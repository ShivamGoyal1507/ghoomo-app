import { Platform } from "react-native";
import Constants from "expo-constants";

const DEFAULT_PORT = "4000";

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
  if (expoHost) return `http://${expoHost}:${DEFAULT_PORT}`;

  if (configured) return configured;
  if (Platform.OS === "android") return `http://10.0.2.2:${DEFAULT_PORT}`;
  return `http://localhost:${DEFAULT_PORT}`;
}

async function request(path, options = {}) {
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
      throw new Error(errorMessage);
    }

    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error(`Request timeout after ${timeoutMs}ms for ${path}`);
      timeoutError.code = "TIMEOUT";
      console.error(`[API] ${timeoutError.message}`);
      throw timeoutError;
    }
    console.error(`[API] Network error for ${path}:`, error.message);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const api = {
  login: (email, password) =>
    request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
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
  getAdminDashboard: () => request("/api/admin/dashboard"),
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
};
