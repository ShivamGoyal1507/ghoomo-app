import { Platform } from "react-native";
import Constants from "expo-constants";

const DEFAULT_PROTOCOL = (process.env.EXPO_PUBLIC_API_PROTOCOL || "http").trim();
const DEFAULT_PORT = (process.env.EXPO_PUBLIC_API_PORT || "").trim();
const DEFAULT_ANDROID_EMULATOR_HOST = (process.env.EXPO_PUBLIC_API_ANDROID_EMULATOR_HOST || "").trim();
const DEFAULT_LOCALHOST_HOST = (process.env.EXPO_PUBLIC_API_LOCALHOST_HOST || "").trim();

function buildDevUrl(host) {
  if (!host || !DEFAULT_PORT) return "";
  return `${DEFAULT_PROTOCOL}://${host}:${DEFAULT_PORT}`;
}

function getHostUri() {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.manifest2?.extra?.expoClient?.hostUri ||
    Constants.manifest?.debuggerHost ||
    "";

  return hostUri.split(":")[0];
}

export function getApiBaseUrl() {
  const explicitConfigured = process.env.EXPO_PUBLIC_API_BASE_URL || "";
  if (explicitConfigured) return explicitConfigured;

  const configured = Constants.expoConfig?.extra?.apiBaseUrl || "";
  if (configured && !/localhost|127\.0\.0\.1/.test(configured)) return configured;

  const expoHost = getHostUri();
  const expoHostUrl = buildDevUrl(expoHost);
  if (expoHostUrl) return expoHostUrl;

  if (configured) return configured;
  if (Platform.OS === "android") {
    const androidFallbackUrl = buildDevUrl(DEFAULT_ANDROID_EMULATOR_HOST);
    if (androidFallbackUrl) return androidFallbackUrl;
  }
  const localhostFallbackUrl = buildDevUrl(DEFAULT_LOCALHOST_HOST);
  if (localhostFallbackUrl) return localhostFallbackUrl;

  throw new Error(
    "API base URL is not configured. Set EXPO_PUBLIC_API_BASE_URL or fallback host/port env values."
  );
}

async function request(path, options = {}) {
  const maxRetries = options.maxRetries ?? 3;
  const retryDelay = options.retryDelay ?? 350; // ms
  let attempt = 0;
  let lastError;
  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs || 30000; // 30 second default timeout
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${getApiBaseUrl()}${path}`, {
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
        ...options,
        signal: controller.signal,
      });

      const payload = await response.json().catch((err) => {
        console.error(`[API] JSON parse error for ${path}:`, err.message);
        return {};
      });

      if (!response.ok) {
        const errorMessage = payload.message || `HTTP ${response.status}: Request failed`;
        console.error(`[API] Request failed ${path}:`, errorMessage);
        // Check for concurrency errors
        if (
          /Store was modified by another request|could not serialize access due to concurrent update/i.test(errorMessage)
        ) {
          if (attempt < maxRetries) {
            attempt++;
            await new Promise((res) => setTimeout(res, retryDelay * attempt));
            continue;
          }
        }
        throw new Error(errorMessage);
      }

      return payload;
    } catch (error) {
      if (error.name === "AbortError") {
        const timeoutError = new Error(`Request timeout after ${options.timeoutMs || 30000}ms for ${path}`);
        timeoutError.code = "TIMEOUT";
        console.error(`[API] ${timeoutError.message}`);
        throw timeoutError;
      }
      // Check for concurrency errors in network errors too
      if (
        error.message &&
        /Store was modified by another request|could not serialize access due to concurrent update/i.test(error.message)
      ) {
        if (attempt < maxRetries) {
          attempt++;
          await new Promise((res) => setTimeout(res, retryDelay * attempt));
          continue;
        }
      }
      console.error(`[API] Network error for ${path}:`, error.message);
      lastError = error;
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw lastError || new Error("Unknown API error");
}

export const api = {
  login: (email, password, options = {}) =>
    request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
      timeoutMs: options.timeoutMs,
    }),
  register: (user) =>
    request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(user),
    }),
  googleLogin: (googleUserData) =>
    request("/api/auth/google-login", {
      method: "POST",
      body: JSON.stringify(googleUserData),
    }),
  firebaseLogin: (firebaseUserData) =>
    request("/api/auth/firebase-login", {
      method: "POST",
      body: JSON.stringify(firebaseUserData),
    }),
  registerPushToken: (userId, token) =>
    request(`/api/users/${userId}/push-token`, {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  removePushToken: (userId) =>
    request(`/api/users/${userId}/push-token`, {
      method: "DELETE",
    }),
  getBusRoutes: () => request("/api/bus-routes"),
  createBusRoute: (payload) =>
    request("/api/bus-routes", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getBusBookings: (params = {}) => {
    const query = new URLSearchParams();
    if (params.routeId) query.set("routeId", params.routeId);
    if (params.userId) query.set("userId", params.userId);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return request(`/api/bus-bookings${suffix}`);
  },
  createBusBooking: (payload) =>
    request("/api/bus-bookings", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  cancelBusBooking: (bookingId) =>
    request(`/api/bus-bookings/${bookingId}/cancel`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  verifyBusBooking: (bookingId, verifiedBy) =>
    request(`/api/bus-bookings/${bookingId}/verify`, {
      method: "POST",
      body: JSON.stringify({ verifiedBy }),
    }),
  searchPlaces: ({ query, latitude, longitude }) =>
    request(
      `/api/places/search?q=${encodeURIComponent(query)}&lat=${latitude ?? ""}&lon=${longitude ?? ""}`
    ),
  reverseGeocode: ({ latitude, longitude }) =>
    request(`/api/places/reverse?lat=${latitude}&lon=${longitude}`),
  getNearbyDrivers: ({ latitude, longitude, rideType }) =>
    request(
      `/api/drivers/nearby?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&rideType=${encodeURIComponent(rideType || "cab")}`
    ),
  fetchQuote: (payload) =>
    request("/api/rides/quote", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getSharedRides: (userId) => request(`/api/shared-rides?userId=${encodeURIComponent(userId || "")}`),
  getSharedRideByRide: (rideId) => request(`/api/shared-rides/by-ride/${rideId}`),
  joinSharedRide: (requestId, userId) =>
    request(`/api/shared-rides/${requestId}/join`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),
  closeSharedRide: (requestId, userId) =>
    request(`/api/shared-rides/${requestId}/close`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),
  createRide: (payload) =>
    request("/api/rides", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getRide: (rideId) => request(`/api/rides/${rideId}`),
  updateRideStatus: (rideId, status, extra = {}) =>
    request(`/api/rides/${rideId}/status`, {
      method: "POST",
      body: JSON.stringify({ status, ...extra }),
    }),
  getRideHistory: (userId) => request(`/api/rides/history/${userId}`),
  getDriverDashboard: (driverId) => request(`/api/drivers/${driverId}/dashboard`),
  setDriverOnline: (driverId, online) =>
    request(`/api/drivers/${driverId}/status`, {
      method: "POST",
      body: JSON.stringify({ online }),
    }),
  updateDriverLocation: (driverId, { latitude, longitude }) =>
    request(`/api/drivers/${driverId}/location`, {
      method: "POST",
      body: JSON.stringify({ latitude, longitude }),
    }),
  getBusSchedule: () => request("/api/bus-schedule"),
};
