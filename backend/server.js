const http = require("http");
const path = require("path");
const { URL } = require("url");
const { WebSocketServer } = require("ws");
const { createStorage } = require("./storage");

require("dotenv").config({ path: path.resolve(__dirname, ".env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const PORT = Number(process.env.PORT || 4000);
const DEFAULT_CITY = {
  name: "Ludhiana, Punjab, India",
  lat: 30.900965,
  lon: 75.857277,
};

const FARES = {
  bike: { base: 20, perKm: 8, label: "Bike" },
  auto: { base: 30, perKm: 12, label: "Auto" },
  cab: { base: 50, perKm: 18, label: "Cab" },
  autoShare: { base: 22, perKm: 9, label: "Auto Share" },
  cabShare: { base: 35, perKm: 11, label: "Cab Share" },
};

const BOOKING_STATUS = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  ARRIVED: "arrived",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

const USER_ROLES = {
  USER: "user",
  DRIVER: "driver",
  ADMIN: "admin",
};

const DEFAULT_BUS_ROUTES = [];

const DEFAULT_STORE = {
  users: [],
  rides: [],
  busRoutes: DEFAULT_BUS_ROUTES,
  busBookings: [],
  sharedRideRequests: [],
};

let storage;
const rideRealtimeSubscribers = new Map();
const busRealtimeSubscribers = new Set();

function wsSafeSend(socket, payload) {
  if (!socket || socket.readyState !== 1) return;
  try {
    socket.send(JSON.stringify(payload));
  } catch {
    // Ignore send failures for disconnected sockets.
  }
}

function addRideSubscriber(rideId, socket) {
  if (!rideId || !socket) return;
  const key = String(rideId);
  const bucket = rideRealtimeSubscribers.get(key) || new Set();
  bucket.add(socket);
  rideRealtimeSubscribers.set(key, bucket);
}

function removeRideSubscriber(rideId, socket) {
  const key = String(rideId || "");
  const bucket = rideRealtimeSubscribers.get(key);
  if (!bucket) return;
  bucket.delete(socket);
  if (bucket.size === 0) {
    rideRealtimeSubscribers.delete(key);
  }
}

function removeSocketFromAllRideSubscriptions(socket) {
  for (const [rideId, bucket] of rideRealtimeSubscribers.entries()) {
    bucket.delete(socket);
    if (bucket.size === 0) {
      rideRealtimeSubscribers.delete(rideId);
    }
  }
}

function addBusSubscriber(socket) {
  if (!socket) return;
  busRealtimeSubscribers.add(socket);
}

function removeBusSubscriber(socket) {
  busRealtimeSubscribers.delete(socket);
}

function summarizeBusRoutesWithBookings(store) {
  const routes = getBusRoutes(store);
  const busBookings = Array.isArray(store.busBookings) ? store.busBookings : [];
  return routes.map((route) => {
    const routeBookings = busBookings.filter(
      (booking) => booking.routeId === route.id && booking.status !== BOOKING_STATUS.CANCELLED
    );
    const booked = routeBookings.filter((booking) => !booking.isWaiting).length;
    const waiting = routeBookings.filter((booking) => booking.isWaiting).length;
    return {
      ...route,
      bookedSeats: booked,
      availableSeats: Math.max(Number(route.totalSeats || 0) - booked, 0),
      waitingCount: waiting,
      loadFactor: Number(route.totalSeats || 0) ? booked / Number(route.totalSeats || 0) : 0,
    };
  });
}

function resequenceWaitingList(store, routeId) {
  const waitingBookings = (store.busBookings || [])
    .filter(
      (booking) =>
        booking.routeId === routeId &&
        booking.isWaiting &&
        booking.status !== BOOKING_STATUS.CANCELLED
    )
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

  waitingBookings.forEach((booking, index) => {
    booking.waitlistPosition = index + 1;
    booking.qrCode = JSON.stringify({
      bookingId: booking.id,
      userId: booking.userId,
      busId: booking.routeId,
      seatNo: booking.seatNumber,
      waitlistPosition: booking.waitlistPosition,
      ts: Date.now(),
    });
  });
}

function publishBusRealtimeUpdate(store) {
  if (!busRealtimeSubscribers.size) return;
  const payload = {
    type: "bus:update",
    ts: new Date().toISOString(),
    routes: summarizeBusRoutesWithBookings(store),
    busBookings: Array.isArray(store.busBookings) ? store.busBookings : [],
  };

  for (const socket of busRealtimeSubscribers) {
    wsSafeSend(socket, payload);
  }
}

async function readStore() {
  const store = await storage.readStore();
  if (!Array.isArray(store.busRoutes)) {
    store.busRoutes = [];
  }
  if (!Array.isArray(store.busBookings)) {
    store.busBookings = [];
  }
  if (!Array.isArray(store.sharedRideRequests)) {
    store.sharedRideRequests = [];
  }
  if (!Array.isArray(store.users)) {
    store.users = [];
  }
  if (!Array.isArray(store.rides)) {
    store.rides = [];
  }
  return store;
}

async function writeStore(data) {
  await storage.writeStore(data);
}

function getBusRoutes(store) {
  return (store.busRoutes || []).map((route) => {
    const { fare, ...rest } = route || {};
    return {
      ...rest,
      bookedSeats: Array.isArray(route.bookedSeats) ? route.bookedSeats : [],
      waitingSeats: Number(route.waitingSeats || 10),
      totalSeats: Number(route.totalSeats || 0),
      stops: Array.isArray(route.stops) ? route.stops : [],
    };
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(payload));
}

function clampSharedSeats(value) {
  const count = Number(value || 0);
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.min(3, Math.round(count)));
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function safeUser(user) {
  if (!user) return null;
  const { password, pushToken, ...rest } = user;
  return rest;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeIsoTimestamp(value) {
  const input = normalizeText(value);
  if (!input) return null;
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizePaymentMethod(value) {
  const method = normalizeText(value).toLowerCase();
  const allowed = new Set(["cash", "upi", "card", "wallet"]);
  return allowed.has(method) ? method : "cash";
}

function validateRegistration(body) {
  const role = normalizeText(body.role || USER_ROLES.USER);
  const name = normalizeText(body.name);
  const email = normalizeText(body.email).toLowerCase();
  const phone = normalizeText(body.phone);
  const password = String(body.password || "");
  const city = normalizeText(body.city);
  const emergencyContact = normalizeText(body.emergencyContact);

  if (!name || !email || !phone || !password || !city || !emergencyContact) {
    return { error: "Name, email, phone, city, emergency contact, and password are required." };
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { error: "Please provide a valid email address." };
  }

  // Validate password length
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters long." };
  }

  const user = {
    id: buildId("u"),
    name,
    email,
    phone,
    password,
    role,
    city,
    emergencyContact,
  };

  if (role === USER_ROLES.DRIVER) {
    const vehicleType = normalizeText(body.vehicleType);
    const vehicleNo = normalizeText(body.vehicleNo);
    const licenseNumber = normalizeText(body.licenseNumber);

    if (!vehicleType || !vehicleNo || !licenseNumber) {
      return { error: "Drivers must provide vehicle type, vehicle number, and license number." };
    }

    user.vehicleType = vehicleType;
    user.vehicleNo = vehicleNo;
    user.licenseNumber = licenseNumber;
    user.rating = 5;
    user.online = false;
    user.currentLocation = {
      latitude: DEFAULT_CITY.lat,
      longitude: DEFAULT_CITY.lon,
    };

    if (vehicleType === "bus") {
      const busRoute = normalizeText(body.busRoute);
      if (!busRoute) {
        return { error: "Bus drivers must select a bus route." };
      }
      user.busRoute = busRoute;
    }
  }

  if (role === USER_ROLES.ADMIN) {
    const employeeId = normalizeText(body.employeeId);
    const organization = normalizeText(body.organization);

    if (!employeeId || !organization) {
      return { error: "Admins must provide employee ID and organization." };
    }

    user.employeeId = employeeId;
    user.organization = organization;
  }

  if (![USER_ROLES.USER, USER_ROLES.DRIVER, USER_ROLES.ADMIN].includes(role)) {
    return { error: "Invalid role selected." };
  }

  return { user };
}

function startOfTodayIso() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

function buildId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "ghoomo-app/1.0 (contact: local-dev)",
      Accept: "application/json",
    },
    ...options,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Upstream request failed (${response.status}): ${message.slice(0, 120)}`);
  }

  return response.json();
}

async function sendPushNotification(token, { title, body, data = {} }) {
  if (!token || !String(token).startsWith("ExponentPushToken[")) return;

  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      to: token,
      title,
      body,
      data,
      sound: "default",
      priority: "high",
      channelId: "default",
    }),
  }).catch(() => null);
}

async function notifyUserById(store, userId, payload) {
  const user = store.users.find((entry) => entry.id === userId);
  if (!user?.pushToken) return;
  await sendPushNotification(user.pushToken, payload);
}

function closeSharedRideRequestsForRide(store, rideId, reason = "closed") {
  if (!Array.isArray(store.sharedRideRequests)) return;
  store.sharedRideRequests.forEach((request) => {
    if (request.rideId === rideId && request.status === "active") {
      request.status = reason;
      request.updatedAt = new Date().toISOString();
    }
  });
}

function serializeSharedRideRequest(store, request) {
  const owner = store.users.find((user) => user.id === request.ownerId);
  const ride = store.rides.find((item) => item.id === request.rideId);
  const acceptedUsers = (request.acceptedUsers || []).map((entry) => {
    const joinedUser = store.users.find((user) => user.id === entry.userId);
    return {
      userId: entry.userId,
      name: joinedUser?.name || entry.name || "User",
      joinedAt: entry.joinedAt,
    };
  });

  return {
    ...request,
    ownerName: owner?.name || request.ownerName || "User",
    rideStatus: ride?.status || null,
    acceptedUsers,
    acceptedCount: acceptedUsers.length,
    remainingSeats: Math.max(Number(request.requestedSeats || 0) - acceptedUsers.length, 0),
  };
}

async function searchPlaces(query, near) {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "6",
    addressdetails: "1",
  });

  if (near?.lat && near?.lon) {
    params.set("viewbox", `${near.lon - 0.1},${near.lat + 0.1},${near.lon + 0.1},${near.lat - 0.1}`);
    params.set("bounded", "0");
  }

  const data = await fetchJson(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
  return data.map((place) => ({
    id: String(place.place_id),
    name: place.display_name,
    latitude: Number(place.lat),
    longitude: Number(place.lon),
  }));
}

async function reverseGeocode(lat, lon) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    format: "jsonv2",
  });

  const data = await fetchJson(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`);
  return {
    id: String(data.place_id || `reverse_${lat}_${lon}`),
    name: data.display_name,
    latitude: Number(data.lat),
    longitude: Number(data.lon),
  };
}

const ROUTE_CACHE_TTL_MS = 5 * 60 * 1000;
const ROUTE_CACHE_MAX = 500;
const ROUTE_TIMEOUT_MS = 4000;
const routeCache = new Map();

function roundCoord(value, precision = 4) {
  const factor = 10 ** precision;
  return Math.round(Number(value) * factor) / factor;
}

function getRouteCacheKey(start, end) {
  return [
    roundCoord(start.latitude),
    roundCoord(start.longitude),
    roundCoord(end.latitude),
    roundCoord(end.longitude),
  ].join("|");
}

function haversineDistanceKm(a, b) {
  const toRad = (value) => (value * Math.PI) / 180;
  const r = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

function buildFallbackRoute(start, end) {
  const distanceKm = Number(haversineDistanceKm(start, end).toFixed(1));
  return {
    distanceKm,
    durationMinutes: Math.max(1, Math.round(distanceKm * 3 + 2)),
    geometry: [
      { latitude: Number(start.latitude), longitude: Number(start.longitude) },
      { latitude: Number(end.latitude), longitude: Number(end.longitude) },
    ],
  };
}

function pruneRouteCache() {
  const now = Date.now();
  for (const [key, entry] of routeCache.entries()) {
    if (entry?.data && now - entry.timestamp >= ROUTE_CACHE_TTL_MS) {
      routeCache.delete(key);
    }
  }
  while (routeCache.size > ROUTE_CACHE_MAX) {
    const oldestKey = routeCache.keys().next().value;
    if (!oldestKey) break;
    routeCache.delete(oldestKey);
  }
}

async function getRoute(start, end) {
  const cacheKey = getRouteCacheKey(start, end);
  const cached = routeCache.get(cacheKey);
  const now = Date.now();

  if (cached?.data && now - cached.timestamp < ROUTE_CACHE_TTL_MS) {
    return cached.data;
  }
  if (cached?.promise) {
    return cached.promise;
  }

  const promise = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS);
    try {
      const data = await fetchJson(
        `https://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson`,
        { signal: controller.signal }
      );

      const route = data.routes?.[0];
      if (!route) throw new Error("No route found");

      const routeData = {
        distanceKm: Number((route.distance / 1000).toFixed(1)),
        durationMinutes: Math.max(1, Math.round(route.duration / 60)),
        geometry: route.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })),
      };

      routeCache.set(cacheKey, { timestamp: Date.now(), data: routeData });
      pruneRouteCache();
      return routeData;
    } catch (error) {
      if (error?.name === "AbortError") {
        const fallback = buildFallbackRoute(start, end);
        routeCache.set(cacheKey, { timestamp: Date.now(), data: fallback });
        pruneRouteCache();
        return fallback;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  })();

  routeCache.set(cacheKey, { timestamp: now, promise });

  try {
    return await promise;
  } catch (error) {
    routeCache.delete(cacheKey);
    throw error;
  }
}

function getTimeSurgeMultiplier(now = new Date()) {
  const hour = now.getHours();
  const isMorningPeak = hour >= 8 && hour <= 11;
  const isEveningPeak = hour >= 17 && hour <= 21;
  return isMorningPeak || isEveningPeak ? 1.2 : 1;
}

function getDemandSurgeMultiplier(nearbyDriversCount) {
  if (nearbyDriversCount <= 0) return 1.35;
  if (nearbyDriversCount === 1) return 1.2;
  if (nearbyDriversCount === 2) return 1.1;
  return 1;
}

function getScheduleAdjustmentMultiplier(scheduledAtIso) {
  if (!scheduledAtIso) return 1;
  const scheduledDate = new Date(scheduledAtIso);
  const deltaMinutes = (scheduledDate.getTime() - Date.now()) / (60 * 1000);
  if (deltaMinutes >= 30) return 0.95;
  return 1;
}

function calculateFare(rideType, isShare, distanceKm, pricingContext = {}) {
  const fareKey = isShare ? `${rideType}Share` : rideType;
  const fareRule = FARES[fareKey] || FARES[rideType] || FARES.cab;
  const rawBaseFare = fareRule.base + fareRule.perKm * distanceKm;
  const timeMultiplier = getTimeSurgeMultiplier();
  const demandMultiplier = getDemandSurgeMultiplier(Number(pricingContext.nearbyDriversCount || 0));
  const scheduleMultiplier = getScheduleAdjustmentMultiplier(pricingContext.scheduledAt || null);
  const surgeMultiplier = Number((timeMultiplier * demandMultiplier * scheduleMultiplier).toFixed(2));
  const surgeAdjustedFare = rawBaseFare * surgeMultiplier;
  const fare = Math.round(surgeAdjustedFare);
  return {
    fareKey,
    fare,
    baseFare: Math.round(rawBaseFare),
    surgeAmount: Math.max(0, Math.round(surgeAdjustedFare - rawBaseFare)),
    surgeMultiplier,
    fareRule,
  };
}

function computeDriverLocation(point, driver) {
  return {
    latitude: Number((point.latitude + driver.latOffset).toFixed(6)),
    longitude: Number((point.longitude + driver.lonOffset).toFixed(6)),
  };
}

function haversineKm(a, b) {
  const toRad = (value) => (value * Math.PI) / 180;
  const r = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

function estimateDriverArrivalMinutes(distanceKm) {
  return Math.max(2, Math.round(distanceKm * 4 + 2));
}

function getMatchingVehicleTypes(rideType) {
  if (rideType === "bike") return ["bike"];
  if (rideType === "auto") return ["auto"];
  return ["cab"];
}

function getActiveDriverIds(store) {
  return new Set(
    store.rides
      .filter(
        (ride) =>
          ride.driver?.id &&
          ride.status !== BOOKING_STATUS.COMPLETED &&
          ride.status !== BOOKING_STATUS.CANCELLED
      )
      .map((ride) => ride.driver.id)
  );
}

function withDriverTripMetrics(driver, targetPoint) {
  const location = {
    latitude: driver.latitude,
    longitude: driver.longitude,
  };
  const distanceKm = haversineKm(targetPoint, location);
  return {
    ...driver,
    distanceKm: Number(distanceKm.toFixed(1)),
    etaMinutes: estimateDriverArrivalMinutes(distanceKm),
  };
}

function buildDriverSummary(user, fallbackPoint) {
  const location =
    user.currentLocation ||
    (fallbackPoint
      ? {
          latitude: fallbackPoint.latitude,
          longitude: fallbackPoint.longitude,
        }
      : {
          latitude: DEFAULT_CITY.lat,
          longitude: DEFAULT_CITY.lon,
        });

  return {
    id: user.id,
    name: user.name,
    vehicleNo: user.vehicleNo,
    vehicleType: user.vehicleType,
    rating: user.rating,
    phone: user.phone,
    latitude: location.latitude,
    longitude: location.longitude,
    online: Boolean(user.online),
  };
}

function getNearbyDrivers(store, pickup, rideType, excludedDriverIds = []) {
  const activeDriverIds = getActiveDriverIds(store);
  const allowedVehicleTypes = getMatchingVehicleTypes(rideType);
  const excludedIds = new Set(excludedDriverIds.filter(Boolean));
  return store.users
    .filter(
      (user) =>
        user.role === "driver" &&
        user.vehicleType !== "bus" &&
        Boolean(user.online) &&
        allowedVehicleTypes.includes(user.vehicleType) &&
        !activeDriverIds.has(user.id) &&
        !excludedIds.has(user.id)
    )
    .map((user) => withDriverTripMetrics(buildDriverSummary(user, pickup), pickup))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

function assignDriver(store, pickup, rideType, excludedDriverIds = []) {
  const liveCandidates = getNearbyDrivers(store, pickup, rideType, excludedDriverIds);
  if (liveCandidates.length > 0) {
    return liveCandidates[0];
  }

  return null;
}

function movePointTowards(point, target, ratio) {
  const lat = Number(point.latitude || 0);
  const lon = Number(point.longitude || 0);
  const targetLat = Number(target.latitude || lat);
  const targetLon = Number(target.longitude || lon);
  const nextLat = lat + (targetLat - lat) * ratio;
  const nextLon = lon + (targetLon - lon) * ratio;
  return {
    latitude: Number(nextLat.toFixed(6)),
    longitude: Number(nextLon.toFixed(6)),
  };
}

function tickNearbyDriversTowardsPickup(store, pickup, rideType) {
  const activeDriverIds = getActiveDriverIds(store);
  const allowedVehicleTypes = getMatchingVehicleTypes(rideType || "cab");
  const onlineDrivers = store.users.filter(
    (user) =>
      user.role === "driver" &&
      user.vehicleType !== "bus" &&
      Boolean(user.online) &&
      allowedVehicleTypes.includes(user.vehicleType) &&
      !activeDriverIds.has(user.id)
  );

  onlineDrivers.forEach((driver) => {
    const current = driver.currentLocation || {
      latitude: DEFAULT_CITY.lat,
      longitude: DEFAULT_CITY.lon,
    };
    const approached = movePointTowards(current, pickup, 0.16);
    const jitterLat = (Math.random() - 0.5) * 0.0004;
    const jitterLon = (Math.random() - 0.5) * 0.0004;
    driver.currentLocation = {
      latitude: Number((approached.latitude + jitterLat).toFixed(6)),
      longitude: Number((approached.longitude + jitterLon).toFixed(6)),
    };
    driver.lastSeenAt = new Date().toISOString();
  });

  return getNearbyDrivers(store, pickup, rideType || "cab");
}

function rejectAndReassignRide(store, ride, rejectingDriverId) {
  if (!ride || !rejectingDriverId) {
    return { ride, reassigned: false, cancelled: false };
  }

  ride.rejections = Array.isArray(ride.rejections) ? ride.rejections : [];
  ride.rejections.push({
    driverId: rejectingDriverId,
    at: new Date().toISOString(),
  });

  const replacementDriver = assignDriver(store, ride.pickup, ride.rideType || "cab", [
    rejectingDriverId,
    ride.driver?.id,
    ...ride.rejections.map((entry) => entry.driverId),
  ]);

  if (replacementDriver) {
    ride.driver = replacementDriver;
    ride.status = BOOKING_STATUS.ACCEPTED;
    ride.updatedAt = new Date().toISOString();
    return { ride, reassigned: true, cancelled: false };
  }

  ride.status = BOOKING_STATUS.CANCELLED;
  ride.cancelledBy = "driver";
  ride.cancellationReason = "No other nearby driver was available after the assigned driver rejected the trip.";
  ride.updatedAt = new Date().toISOString();
  return { ride, reassigned: false, cancelled: true };
}

function refreshRideDriverSnapshot(store, ride) {
  if (!ride?.driver?.id) return ride;
  const driverUser = store.users.find((user) => user.id === ride.driver.id && user.role === "driver");
  if (!driverUser) return ride;

  const liveDriver = buildDriverSummary(driverUser, ride.pickup);
  const targetPoint = ride.status === BOOKING_STATUS.IN_PROGRESS ? ride.drop : ride.pickup;
  const enrichedDriver = targetPoint ? withDriverTripMetrics(liveDriver, targetPoint) : liveDriver;

  return {
    ...ride,
    driver: enrichedDriver,
  };
}

function publishRideRealtimeUpdate(store, rideId) {
  const key = String(rideId || "");
  const bucket = rideRealtimeSubscribers.get(key);
  if (!bucket || bucket.size === 0) return;

  const ride = store.rides.find((entry) => String(entry.id) === key);
  if (!ride) {
    for (const socket of bucket) {
      wsSafeSend(socket, {
        type: "ride:deleted",
        rideId: key,
        ts: new Date().toISOString(),
      });
    }
    rideRealtimeSubscribers.delete(key);
    return;
  }

  const hydratedRide = refreshRideDriverSnapshot(store, ride);
  for (const socket of bucket) {
    wsSafeSend(socket, {
      type: "ride:update",
      ride: hydratedRide,
      ts: new Date().toISOString(),
    });
  }
}

function sanitizeRideForDriver(ride) {
  if (!ride) return null;
  const { otp, ...rest } = ride;
  return rest;
}

function buildDriverDashboard(store, driverId) {
  const driver = store.users.find((user) => user.id === driverId && user.role === "driver");
  if (!driver) return null;

  const assignedRides = store.rides
    .filter((ride) => {
      if (ride.driver?.id === driverId) return true;
      return ride.status === BOOKING_STATUS.PENDING && Array.isArray(ride.candidateDriverIds) && ride.candidateDriverIds.includes(driverId);
    })
    .map((ride) => refreshRideDriverSnapshot(store, ride))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const completedRides = store.rides
    .filter((ride) => ride.driver?.id === driverId && (ride.status === BOOKING_STATUS.COMPLETED || ride.status === BOOKING_STATUS.CANCELLED))
    .map((ride) => refreshRideDriverSnapshot(store, ride))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 20);
  const activeRide =
    assignedRides.find((ride) => ride.status === BOOKING_STATUS.IN_PROGRESS) ||
    assignedRides.find((ride) => ride.status === BOOKING_STATUS.ARRIVED) ||
    assignedRides.find((ride) => ride.status === BOOKING_STATUS.ACCEPTED) ||
    null;
  const todayIso = startOfTodayIso();
  const ridesToday = assignedRides.filter((ride) => ride.createdAt >= todayIso);
  const todayEarnings = ridesToday
    .filter((ride) => ride.status === BOOKING_STATUS.COMPLETED)
    .reduce((sum, ride) => sum + Number(ride.fare || 0), 0);

  return {
    driver: safeUser(driver),
    online: Boolean(driver.online),
    location: driver.currentLocation || null,
    activeRide: sanitizeRideForDriver(activeRide),
    assignedRides: assignedRides.filter(
      (ride) => ride.status !== BOOKING_STATUS.COMPLETED && ride.status !== BOOKING_STATUS.CANCELLED
    ).map(sanitizeRideForDriver),
    completedRides: completedRides.map(sanitizeRideForDriver),
    stats: {
      ridesToday: ridesToday.length,
      todayEarnings,
      rating: driver.rating || 0,
    },
  };
}

function buildAdminDashboard(store) {
  const safeUsers = store.users.map(safeUser);
  const users = safeUsers.filter((user) => user.role === USER_ROLES.USER);
  const drivers = safeUsers
    .filter((user) => user.role === USER_ROLES.DRIVER)
    .sort((a, b) => Number(Boolean(b.online)) - Number(Boolean(a.online)));
  const admins = safeUsers.filter((user) => user.role === USER_ROLES.ADMIN);
  const activeRideStatuses = new Set([BOOKING_STATUS.ACCEPTED, BOOKING_STATUS.ARRIVED, BOOKING_STATUS.IN_PROGRESS]);
  const activeRides = store.rides.filter((ride) => activeRideStatuses.has(ride.status));
  const completedRides = store.rides.filter((ride) => ride.status === BOOKING_STATUS.COMPLETED);
  const activeDriverIds = new Set(activeRides.map((ride) => ride.driver?.id).filter(Boolean));
  const busBookings = Array.isArray(store.busBookings) ? store.busBookings : [];
  const busRoutes = getBusRoutes(store);
  const confirmedBusBookings = busBookings.filter(
    (booking) => !booking.isWaiting && booking.status !== BOOKING_STATUS.CANCELLED
  );
  const waitingBusBookings = busBookings.filter(
    (booking) => booking.isWaiting && booking.status !== BOOKING_STATUS.CANCELLED
  );
  const totalRevenue = completedRides.reduce((sum, ride) => sum + Number(ride.fare || 0), 0);
  const recentBookings = [...store.rides, ...busBookings]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 10)
    .map((booking) => {
      if (booking.type === "bus") {
        const route = busRoutes.find((entry) => entry.id === booking.routeId);
        return {
          id: booking.id,
          type: "bus",
          label: route?.name || booking.routeId,
          detail: booking.isWaiting
            ? `Waitlist #${booking.waitlistPosition || "-"}`
            : `Seat ${booking.seatNumber || "-"} • ${route?.from || ""} to ${route?.to || ""}`,
          status: booking.status,
          createdAt: booking.createdAt,
          userName: booking.userName || "Passenger",
        };
      }

      return {
        id: booking.id,
        type: booking.rideType || booking.type || "ride",
        label: `${booking.pickup?.name || booking.pickup || "Pickup"} to ${booking.drop?.name || booking.drop || "Drop"}`,
        detail: `${Number(booking.distance || booking.route?.distanceKm || 0).toFixed(1)} km • ${booking.durationMinutes || booking.route?.durationMinutes || 0} min`,
        fare: Number(booking.fare || 0),
        status: booking.status,
        createdAt: booking.createdAt,
        userId: booking.userId,
      };
    });
  const routes = busRoutes.map((route) => {
    const routeBookings = busBookings.filter(
      (booking) => booking.routeId === route.id && booking.status !== BOOKING_STATUS.CANCELLED
    );
    const booked = routeBookings.filter((booking) => !booking.isWaiting).length;
    const waiting = routeBookings.filter((booking) => booking.isWaiting).length;
    return {
      ...route,
      bookedSeats: booked,
      availableSeats: Math.max(route.totalSeats - booked, 0),
      waitingCount: waiting,
      loadFactor: route.totalSeats ? booked / route.totalSeats : 0,
    };
  });

  return {
    stats: {
      totalUsers: users.length,
      totalDrivers: drivers.length,
      totalAdmins: admins.length,
      totalRides: store.rides.length,
      completedRides: completedRides.length,
      activeDrivers: drivers.filter((driver) => driver.online).length,
      driversOnTrip: activeDriverIds.size,
      totalRevenue,
      busBookings: confirmedBusBookings.length,
      waitingList: waitingBusBookings.length,
    },
    users,
    drivers,
    admins,
    rides: store.rides,
    recentBookings,
    routes,
  };
}

async function ensureLocation(place) {
  if (place?.latitude && place?.longitude && place?.name) return place;
  if (place?.latitude && place?.longitude) {
    return reverseGeocode(place.latitude, place.longitude);
  }
  if (place?.name) {
    const matches = await searchPlaces(place.name, {
      lat: DEFAULT_CITY.lat,
      lon: DEFAULT_CITY.lon,
    });
    if (matches[0]) return matches[0];
  }
  throw new Error("Invalid place payload");
}

function isValidBusTime(value) {
  const match = String(value || "").trim().match(/^(\d{2}):(\d{2})\s?(AM|PM)$/i);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 1 && hours <= 12 && minutes >= 0 && minutes <= 59;
}

function validateBusRoutePayload(body) {
  const name = normalizeText(body.name);
  const from = normalizeText(body.from);
  const to = normalizeText(body.to);
  const departureTime = normalizeText(body.departureTime);
  const returnTime = normalizeText(body.returnTime);
  const totalSeats = Number(body.totalSeats);
  const stops = Array.isArray(body.stops)
    ? body.stops.map(normalizeText).filter(Boolean)
    : String(body.stops || "")
        .split(",")
        .map(normalizeText)
        .filter(Boolean);

  if (!name || !from || !to || !departureTime || !returnTime || !totalSeats || stops.length < 2) {
    return {
      error:
        "Route name, source, destination, departure time, return time, total seats, and at least two stops are required.",
    };
  }

  if (!isValidBusTime(departureTime) || !isValidBusTime(returnTime)) {
    return {
      error: "Departure time and return time must use the format hh:mm AM/PM.",
    };
  }

  return {
    route: {
      id: buildId("b"),
      name,
      from,
      to,
      departureTime,
      returnTime,
      totalSeats,
      waitingSeats: 10,
      bookedSeats: [],
      stops,
    },
  };
}

const HOST = process.env.HOST || "0.0.0.0";

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === "GET" && requestUrl.pathname === "/health") {
      sendJson(res, 200, { ok: true, service: "ghoomo-backend" });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/auth/login") {
      const body = await parseBody(req);
      const store = await readStore();
      const user = store.users.find(
        (entry) => entry.email === String(body.email || "").toLowerCase() && entry.password === body.password
      );

      if (!user) {
        sendJson(res, 401, { message: "Invalid email or password" });
        return;
      }

      sendJson(res, 200, { user: safeUser(user) });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/auth/register") {
      const body = await parseBody(req);
      const store = await readStore();
      const { user, error } = validateRegistration(body);

      if (error) {
        sendJson(res, 400, { message: error });
        return;
      }

      if (store.users.some((entry) => entry.email === user.email)) {
        sendJson(res, 409, { message: "Email already registered" });
        return;
      }

      store.users.push(user);
      try {
        await writeStore(store);
        console.log(`[Register] User created: ${user.email} (${user.id})`);
        sendJson(res, 201, { user: safeUser(user) });
      } catch (error) {
        console.error(`[Register] Database write failed for ${user.email}:`, error.message);
        if (error.code === "STORE_VERSION_CONFLICT") {
          sendJson(res, 409, { message: "Registration conflict - please try again" });
        } else {
          sendJson(res, 500, { message: "Registration failed due to server error" });
        }
      }
      return;
    }

    // Google authentication endpoint
    if (req.method === "POST" && requestUrl.pathname === "/api/auth/google-login") {
      const body = await parseBody(req);
      const store = await readStore();
      
      const firebaseUid = normalizeText(body.firebaseUid);
      const email = String(body.email || "").trim().toLowerCase();
      const displayName = normalizeText(body.displayName);
      const role = normalizeText(body.role || USER_ROLES.USER);
      
      if (!firebaseUid || !email || !displayName) {
        sendJson(res, 400, { message: "Firebase UID, email, and display name are required" });
        return;
      }

      if (![USER_ROLES.USER, USER_ROLES.DRIVER, USER_ROLES.ADMIN].includes(role)) {
        sendJson(res, 400, { message: "Invalid role selected" });
        return;
      }

      // Check if user already exists by firebase UID
      let user = store.users.find((entry) => entry.firebaseUid === firebaseUid);
      
      if (user) {
        // User exists, update last login
        user.lastLogin = new Date().toISOString();
        await writeStore(store);
        sendJson(res, 200, { user: safeUser(user), isNewUser: false });
        return;
      }

      // Check if email already exists
      user = store.users.find((entry) => entry.email === email);
      if (user && !user.firebaseUid) {
        // Email exists but not linked to Firebase - link it
        user.firebaseUid = firebaseUid;
        user.authMethod = "google";
        user.lastLogin = new Date().toISOString();
        await writeStore(store);
        sendJson(res, 200, { user: safeUser(user), isNewUser: false });
        return;
      } else if (user && user.firebaseUid && user.firebaseUid !== firebaseUid) {
        // Email exists but linked to different Firebase UID
        sendJson(res, 409, { message: "Email already registered with a different account" });
        return;
      }

      // Create new user with Google auth
      const newUser = {
        id: buildId("u"),
        firebaseUid,
        name: displayName,
        email,
        role,
        authMethod: "google",
        photoURL: body.photoURL || null,
        phone: null,
        city: null,
        emergencyContact: null,
        password: null,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        isActive: true,
      };

      // If driver role, add required driver fields
      if (role === USER_ROLES.DRIVER) {
        newUser.vehicleType = null;
        newUser.vehicleNo = null;
        newUser.licenseNumber = null;
        newUser.rating = 5;
        newUser.online = false;
        newUser.currentLocation = {
          latitude: DEFAULT_CITY.lat,
          longitude: DEFAULT_CITY.lon,
        };
      }

      // If admin role, add required admin fields
      if (role === USER_ROLES.ADMIN) {
        newUser.employeeId = null;
        newUser.organization = null;
      }

      store.users.push(newUser);
      await writeStore(store);
      sendJson(res, 201, { user: safeUser(newUser), isNewUser: true });
      return;
    }

    if (requestUrl.pathname.match(/^\/api\/users\/[^/]+\/push-token$/)) {
      const userId = requestUrl.pathname.split("/")[3];
      const store = await readStore();
      const user = store.users.find((entry) => entry.id === userId);
      if (!user) {
        sendJson(res, 404, { message: "User not found" });
        return;
      }

      if (req.method === "POST") {
        const body = await parseBody(req);
        user.pushToken = normalizeText(body.token);
        await writeStore(store);
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === "DELETE") {
        delete user.pushToken;
        await writeStore(store);
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/shared-rides") {
      const userId = normalizeText(requestUrl.searchParams.get("userId"));
      const store = await readStore();
      const requests = store.sharedRideRequests
        .filter((request) => request.status === "active")
        .map((request) => serializeSharedRideRequest(store, request))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      sendJson(res, 200, {
        requests,
        myRequests: requests.filter((request) => request.ownerId === userId),
        availableRequests: requests.filter(
          (request) =>
            request.ownerId !== userId &&
            !request.acceptedUsers.some((entry) => entry.userId === userId)
        ),
      });
      return;
    }

    if (req.method === "GET" && requestUrl.pathname.match(/^\/api\/shared-rides\/by-ride\/[^/]+$/)) {
      const rideId = requestUrl.pathname.split("/")[4];
      const store = await readStore();
      const request = store.sharedRideRequests.find((entry) => entry.rideId === rideId);
      sendJson(res, 200, {
        request: request ? serializeSharedRideRequest(store, request) : null,
      });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname.match(/^\/api\/shared-rides\/[^/]+\/join$/)) {
      const requestId = requestUrl.pathname.split("/")[3];
      const body = await parseBody(req);
      const userId = normalizeText(body.userId);
      const store = await readStore();
      const request = store.sharedRideRequests.find((entry) => entry.id === requestId);
      const user = store.users.find((entry) => entry.id === userId);

      if (!request || request.status !== "active") {
        sendJson(res, 404, { message: "Shared ride request is no longer available." });
        return;
      }
      if (!user) {
        sendJson(res, 404, { message: "User not found." });
        return;
      }
      if (request.ownerId === userId) {
        sendJson(res, 400, { message: "You cannot join your own shared ride request." });
        return;
      }
      if ((request.acceptedUsers || []).some((entry) => entry.userId === userId)) {
        sendJson(res, 409, { message: "You already joined this shared ride request." });
        return;
      }

      request.acceptedUsers = Array.isArray(request.acceptedUsers) ? request.acceptedUsers : [];
      request.acceptedUsers.push({
        userId,
        joinedAt: new Date().toISOString(),
      });
      request.updatedAt = new Date().toISOString();

      const acceptedCount = request.acceptedUsers.length;
      const requestedSeats = Number(request.requestedSeats || 0);
      const isFull = acceptedCount >= requestedSeats;
      if (isFull) {
        request.status = "full";
      }

      await writeStore(store);
      await notifyUserById(store, request.ownerId, {
        title: "Shared ride joined",
        body: isFull
          ? `${user.name} joined and your shared ride is now full.`
          : `${user.name} joined your shared ride request (${acceptedCount}/${requestedSeats}).`,
        data: { sharedRideRequestId: request.id, rideId: request.rideId, type: "shared-ride" },
      });

      sendJson(res, 200, { request: serializeSharedRideRequest(store, request), full: isFull });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname.match(/^\/api\/shared-rides\/[^/]+\/close$/)) {
      const requestId = requestUrl.pathname.split("/")[3];
      const body = await parseBody(req);
      const userId = normalizeText(body.userId);
      const store = await readStore();
      const request = store.sharedRideRequests.find((entry) => entry.id === requestId);

      if (!request || request.status !== "active") {
        sendJson(res, 404, { message: "Shared ride request is no longer active." });
        return;
      }
      if (request.ownerId !== userId) {
        sendJson(res, 403, { message: "Only the request owner can stop this shared ride request." });
        return;
      }

      request.status = "closed";
      request.updatedAt = new Date().toISOString();
      await writeStore(store);
      sendJson(res, 200, { request: serializeSharedRideRequest(store, request) });
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/places/search") {
      const query = String(requestUrl.searchParams.get("q") || "").trim();
      if (!query) {
        sendJson(res, 200, { places: [] });
        return;
      }
      const nearLat = Number(requestUrl.searchParams.get("lat") || DEFAULT_CITY.lat);
      const nearLon = Number(requestUrl.searchParams.get("lon") || DEFAULT_CITY.lon);
      const places = await searchPlaces(query, { lat: nearLat, lon: nearLon });
      sendJson(res, 200, { places });
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/bus-routes") {
      const store = await readStore();
      sendJson(res, 200, { routes: getBusRoutes(store) });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/bus-routes") {
      const body = await parseBody(req);
      const store = await readStore();
      const { route, error } = validateBusRoutePayload(body);

      if (error) {
        sendJson(res, 400, { message: error });
        return;
      }

      const routes = getBusRoutes(store);
      if (routes.some((entry) => entry.name.toLowerCase() === route.name.toLowerCase())) {
        sendJson(res, 409, { message: "A route with this name already exists." });
        return;
      }

      store.busRoutes = [...routes, route];
      await writeStore(store);
      publishBusRealtimeUpdate(store);
      sendJson(res, 201, { route, routes: store.busRoutes });
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/bus-bookings") {
      const store = await readStore();
      const routeId = normalizeText(requestUrl.searchParams.get("routeId"));
      const userId = normalizeText(requestUrl.searchParams.get("userId"));

      const busBookings = (store.busBookings || []).filter((booking) => {
        if (routeId && booking.routeId !== routeId) return false;
        if (userId && booking.userId !== userId) return false;
        return true;
      });

      sendJson(res, 200, {
        busBookings,
        routes: summarizeBusRoutesWithBookings(store),
      });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/bus-bookings") {
      const body = await parseBody(req);
      const routeId = normalizeText(body.routeId);
      const userId = normalizeText(body.userId);
      const userName = normalizeText(body.userName) || "Passenger";

      if (!routeId || !userId) {
        sendJson(res, 400, { message: "routeId and userId are required" });
        return;
      }

      const store = await readStore();
      const route = (store.busRoutes || []).find((entry) => entry.id === routeId);
      if (!route) {
        sendJson(res, 404, { message: "Route not found" });
        return;
      }

      const existing = (store.busBookings || []).find(
        (booking) =>
          booking.routeId === routeId &&
          booking.userId === userId &&
          booking.status !== BOOKING_STATUS.CANCELLED
      );

      if (existing) {
        sendJson(res, 409, { message: "You already have an active booking for this route", booking: existing });
        return;
      }

      const routeBookings = (store.busBookings || []).filter(
        (booking) => booking.routeId === routeId && booking.status !== BOOKING_STATUS.CANCELLED
      );
      const occupiedSeats = new Set(
        routeBookings.filter((booking) => !booking.isWaiting && Number.isFinite(Number(booking.seatNumber))).map((booking) => Number(booking.seatNumber))
      );

      const totalSeats = Number(route.totalSeats || 0);
      const availableSeats = [];
      for (let seat = 1; seat <= totalSeats; seat += 1) {
        if (!occupiedSeats.has(seat)) availableSeats.push(seat);
      }

      const waitingCapacity = Number(route.waitingSeats || 10);
      const waitingBookings = routeBookings
        .filter((booking) => booking.isWaiting)
        .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

      if (availableSeats.length === 0 && waitingBookings.length >= waitingCapacity) {
        sendJson(res, 409, { message: "This route and waitlist are currently full." });
        return;
      }

      const bookingId = normalizeText(body.bookingId) || buildId("bus");
      const isWaiting = availableSeats.length === 0;
      const seatNumber = isWaiting ? null : availableSeats[0];
      const waitlistPosition = isWaiting ? waitingBookings.length + 1 : null;

      const booking = {
        id: bookingId,
        type: "bus",
        routeId,
        seatNumber,
        waitlistPosition,
        userId,
        userName,
        isWaiting,
        status: isWaiting ? "waiting" : BOOKING_STATUS.ACCEPTED,
        verified: false,
        verifiedAt: null,
        verifiedBy: null,
        qrCode: JSON.stringify({
          bookingId,
          userId,
          busId: routeId,
          seatNo: seatNumber,
          waitlistPosition,
          ts: Date.now(),
        }),
        createdAt: new Date().toISOString(),
      };

      store.busBookings = [...(store.busBookings || []), booking];
      if (isWaiting) {
        resequenceWaitingList(store, routeId);
      }

      await writeStore(store);
      publishBusRealtimeUpdate(store);
      sendJson(res, 201, {
        booking,
        routes: summarizeBusRoutesWithBookings(store),
      });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname.match(/^\/api\/bus-bookings\/[^/]+\/cancel$/)) {
      const bookingId = requestUrl.pathname.split("/")[3];
      const store = await readStore();
      const booking = (store.busBookings || []).find((entry) => entry.id === bookingId);

      if (!booking) {
        sendJson(res, 404, { message: "Booking not found" });
        return;
      }
      if (booking.verified) {
        sendJson(res, 409, { message: "Verified tickets cannot be cancelled." });
        return;
      }
      if (booking.status === BOOKING_STATUS.CANCELLED) {
        sendJson(res, 200, { booking, routes: summarizeBusRoutesWithBookings(store) });
        return;
      }

      booking.status = BOOKING_STATUS.CANCELLED;
      booking.cancelledAt = new Date().toISOString();

      if (!booking.isWaiting && Number.isFinite(Number(booking.seatNumber))) {
        const waitingQueue = (store.busBookings || [])
          .filter(
            (entry) =>
              entry.routeId === booking.routeId &&
              entry.isWaiting &&
              entry.status !== BOOKING_STATUS.CANCELLED
          )
          .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

        const promoted = waitingQueue[0];
        if (promoted) {
          promoted.isWaiting = false;
          promoted.status = BOOKING_STATUS.ACCEPTED;
          promoted.seatNumber = booking.seatNumber;
          promoted.waitlistPosition = null;
          promoted.qrCode = JSON.stringify({
            bookingId: promoted.id,
            userId: promoted.userId,
            busId: promoted.routeId,
            seatNo: promoted.seatNumber,
            waitlistPosition: null,
            ts: Date.now(),
          });
        }
      }

      resequenceWaitingList(store, booking.routeId);
      await writeStore(store);
      publishBusRealtimeUpdate(store);
      sendJson(res, 200, {
        booking,
        routes: summarizeBusRoutesWithBookings(store),
      });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname.match(/^\/api\/bus-bookings\/[^/]+\/verify$/)) {
      const bookingId = requestUrl.pathname.split("/")[3];
      const body = await parseBody(req);
      const verifiedBy = normalizeText(body.verifiedBy) || "bus_driver";
      const store = await readStore();
      const booking = (store.busBookings || []).find((entry) => entry.id === bookingId);

      if (!booking) {
        sendJson(res, 404, { message: "Booking not found" });
        return;
      }
      if (booking.status === BOOKING_STATUS.CANCELLED) {
        sendJson(res, 409, { message: "Cancelled booking cannot be verified" });
        return;
      }
      if (booking.isWaiting) {
        sendJson(res, 409, { message: "Waiting list booking cannot be verified" });
        return;
      }

      booking.verified = true;
      booking.verifiedAt = new Date().toISOString();
      booking.verifiedBy = verifiedBy;

      await writeStore(store);
      publishBusRealtimeUpdate(store);
      sendJson(res, 200, {
        booking,
        routes: summarizeBusRoutesWithBookings(store),
      });
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/places/reverse") {
      const lat = Number(requestUrl.searchParams.get("lat"));
      const lon = Number(requestUrl.searchParams.get("lon"));
      const place = await reverseGeocode(lat, lon);
      sendJson(res, 200, { place });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/rides/quote") {
      const body = await parseBody(req);
      const pickup = await ensureLocation(body.pickup);
      const drop = await ensureLocation(body.drop);
      const route = await getRoute(pickup, drop);
      const normalizedSchedule = normalizeIsoTimestamp(body.scheduledAt);
      const nearbyDrivers = getNearbyDrivers(await readStore(), pickup, body.rideType || "cab");
      const pricing = calculateFare(body.rideType || "cab", Boolean(body.isShare), route.distanceKm, {
        nearbyDriversCount: nearbyDrivers.length,
        scheduledAt: normalizedSchedule,
      });
      const driver = nearbyDrivers[0] || null;
      sendJson(res, 200, {
        pickup,
        drop,
        route,
        estimate: {
          fare: pricing.fare,
          baseFare: pricing.baseFare,
          surgeAmount: pricing.surgeAmount,
          surgeMultiplier: pricing.surgeMultiplier,
          distanceKm: route.distanceKm,
          durationMinutes: route.durationMinutes,
          fareRule: pricing.fareRule,
          shareApplied: Boolean(body.isShare),
          scheduledAt: normalizedSchedule,
        },
        driver,
        nearbyDrivers,
        availability: driver
          ? { available: true, message: `${nearbyDrivers.length} nearby drivers can receive this request.` }
          : { available: false, message: "No online drivers are currently available near this pickup." },
      });
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/drivers/nearby") {
      const lat = Number(requestUrl.searchParams.get("lat"));
      const lon = Number(requestUrl.searchParams.get("lon"));
      const rideType = normalizeText(requestUrl.searchParams.get("rideType") || "cab") || "cab";
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        sendJson(res, 400, { message: "lat and lon are required" });
        return;
      }

      const store = await readStore();
      const pickup = {
        latitude: lat,
        longitude: lon,
        name: "Selected Pickup",
      };
      const nearbyDrivers = tickNearbyDriversTowardsPickup(store, pickup, rideType);
      await writeStore(store);
      sendJson(res, 200, {
        drivers: nearbyDrivers,
        refreshedAt: new Date().toISOString(),
      });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/rides") {
      const body = await parseBody(req);
      const store = await readStore();
      const pickup = await ensureLocation(body.pickup);
      const drop = await ensureLocation(body.drop);
      const route = await getRoute(pickup, drop);
      const nearbyDrivers = getNearbyDrivers(store, pickup, body.rideType || "cab");
      const normalizedSchedule = normalizeIsoTimestamp(body.scheduledAt);
      const pricing = calculateFare(body.rideType || "cab", Boolean(body.isShare), route.distanceKm, {
        nearbyDriversCount: nearbyDrivers.length,
        scheduledAt: normalizedSchedule,
      });
      const paymentMethod = normalizePaymentMethod(body.paymentMethod);
      if (!nearbyDrivers.length) {
        sendJson(res, 409, { message: "No online drivers are available near this pickup location right now." });
        return;
      }

      const ride = {
        id: buildId("ride"),
        type: "ride",
        userId: body.userId,
        rideType: body.rideType,
        isShare: Boolean(body.isShare),
        pickup,
        drop,
        route,
        fare: pricing.fare,
        baseFare: pricing.baseFare,
        surgeAmount: pricing.surgeAmount,
        surgeMultiplier: pricing.surgeMultiplier,
        distance: route.distanceKm,
        durationMinutes: route.durationMinutes,
        paymentMethod,
        scheduledAt: normalizedSchedule,
        status: BOOKING_STATUS.PENDING,
        createdAt: new Date().toISOString(),
        otp: String(Math.floor(1000 + Math.random() * 9000)),
        driver: null,
        candidateDriverIds: nearbyDrivers.map((driver) => driver.id),
        requestedDrivers: nearbyDrivers,
      };

      const sharedSeatsWanted = Boolean(body.isShare) ? clampSharedSeats(body.sharedSeatsWanted) : 0;
      if (sharedSeatsWanted > 0) {
        ride.sharedSeatsWanted = sharedSeatsWanted;
        ride.sharedSeatsJoined = 0;
        store.sharedRideRequests.unshift({
          id: buildId("share"),
          rideId: ride.id,
          ownerId: body.userId,
          ownerName: store.users.find((entry) => entry.id === body.userId)?.name || "User",
          rideType: ride.rideType,
          pickup: ride.pickup,
          drop: ride.drop,
          requestedSeats: sharedSeatsWanted,
          acceptedUsers: [],
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      store.rides.unshift(ride);
      await writeStore(store);
      publishRideRealtimeUpdate(store, ride.id);
      await notifyUserById(store, ride.userId, {
        title: "Ride request sent",
        body: `${nearbyDrivers.length} nearby drivers received your request.`,
        data: { rideId: ride.id, status: ride.status, role: "user" },
      });
      await Promise.all(
        nearbyDrivers.map((driver) =>
          notifyUserById(store, driver.id, {
            title: "New nearby ride request",
            body: `${ride.pickup.name} to ${ride.drop.name}`,
            data: { rideId: ride.id, status: ride.status, role: "driver" },
          })
        )
      );
      const sharedRequest = store.sharedRideRequests.find((request) => request.rideId === ride.id && request.status === "active");
      sendJson(res, 201, { ride, sharedRequest: sharedRequest ? serializeSharedRideRequest(store, sharedRequest) : null });
      return;
    }

    if (req.method === "GET" && requestUrl.pathname.startsWith("/api/rides/history/")) {
      const userId = requestUrl.pathname.split("/").pop();
      const store = await readStore();
      const rides = store.rides
        .filter((ride) => ride.userId === userId)
        .map((ride) => refreshRideDriverSnapshot(store, ride));
      sendJson(res, 200, { rides });
      return;
    }

    if (req.method === "GET" && requestUrl.pathname.startsWith("/api/drivers/") && requestUrl.pathname.endsWith("/dashboard")) {
      const driverId = requestUrl.pathname.split("/")[3];
      const store = await readStore();
      const dashboard = buildDriverDashboard(store, driverId);
      if (!dashboard) {
        sendJson(res, 404, { message: "Driver not found" });
        return;
      }
      sendJson(res, 200, dashboard);
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/admin/dashboard") {
      const store = await readStore();
      sendJson(res, 200, buildAdminDashboard(store));
      return;
    }

    if (req.method === "POST" && requestUrl.pathname.startsWith("/api/drivers/") && requestUrl.pathname.endsWith("/status")) {
      const driverId = requestUrl.pathname.split("/")[3];
      const body = await parseBody(req);
      const store = await readStore();
      const driver = store.users.find((user) => user.id === driverId && user.role === "driver");
      if (!driver) {
        sendJson(res, 404, { message: "Driver not found" });
        return;
      }
      driver.online = Boolean(body.online);
      driver.lastSeenAt = new Date().toISOString();
      await writeStore(store);
      sendJson(res, 200, { driver: safeUser(driver) });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname.startsWith("/api/drivers/") && requestUrl.pathname.endsWith("/location")) {
      const driverId = requestUrl.pathname.split("/")[3];
      const body = await parseBody(req);
      const store = await readStore();
      const driver = store.users.find((user) => user.id === driverId && user.role === "driver");
      if (!driver) {
        sendJson(res, 404, { message: "Driver not found" });
        return;
      }

      driver.currentLocation = {
        latitude: Number(body.latitude),
        longitude: Number(body.longitude),
      };
      driver.lastSeenAt = new Date().toISOString();

      const touchedRideIds = [];
      store.rides.forEach((ride) => {
        if (
          ride.driver?.id === driverId &&
          ride.status !== BOOKING_STATUS.COMPLETED &&
          ride.status !== BOOKING_STATUS.CANCELLED
        ) {
          const targetPoint = ride.status === BOOKING_STATUS.IN_PROGRESS ? ride.drop : ride.pickup;
          ride.driver = withDriverTripMetrics(
            {
              ...ride.driver,
              latitude: driver.currentLocation.latitude,
              longitude: driver.currentLocation.longitude,
              online: Boolean(driver.online),
            },
            targetPoint || ride.pickup
          );
          ride.updatedAt = new Date().toISOString();
          touchedRideIds.push(ride.id);
        }
      });

      await writeStore(store);
      touchedRideIds.forEach((rideId) => publishRideRealtimeUpdate(store, rideId));
      const dashboard = buildDriverDashboard(store, driverId);
      sendJson(res, 200, dashboard);
      return;
    }

    if (req.method === "GET" && requestUrl.pathname.startsWith("/api/rides/")) {
      const rideId = requestUrl.pathname.split("/").pop();
      const store = await readStore();
      const ride = store.rides.find((entry) => entry.id === rideId);
      if (!ride) {
        sendJson(res, 404, { message: "Ride not found" });
        return;
      }
      sendJson(res, 200, { ride: refreshRideDriverSnapshot(store, ride) });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname.match(/^\/api\/rides\/[^/]+\/status$/)) {
      const rideId = requestUrl.pathname.split("/")[3];
      const body = await parseBody(req);
      const store = await readStore();
      const ride = store.rides.find((entry) => entry.id === rideId);
      if (!ride) {
        sendJson(res, 404, { message: "Ride not found" });
        return;
      }

      if (body.status === BOOKING_STATUS.IN_PROGRESS) {
        const suppliedOtp = normalizeText(body.otp);
        if (!suppliedOtp || suppliedOtp !== String(ride.otp)) {
          sendJson(res, 400, { message: "Invalid OTP. Ask the rider for the correct trip OTP before starting." });
          return;
        }
        if (![BOOKING_STATUS.ACCEPTED, BOOKING_STATUS.ARRIVED].includes(ride.status)) {
          sendJson(res, 409, { message: "Ride can only start after driver acceptance." });
          return;
        }
        ride.otpVerifiedAt = new Date().toISOString();
      }

      if (body.status === BOOKING_STATUS.ARRIVED) {
        if (ride.status !== BOOKING_STATUS.ACCEPTED) {
          sendJson(res, 409, { message: "Driver can mark arrived only after accepting the ride." });
          return;
        }
      }

      if (
        body.status === BOOKING_STATUS.ACCEPTED &&
        normalizeText(body.actor) === "driver"
      ) {
        const driverId = normalizeText(body.driverId);
        const driver = store.users.find((user) => user.id === driverId && user.role === "driver");
        if (!driver) {
          sendJson(res, 404, { message: "Driver not found" });
          return;
        }
        if (ride.status !== BOOKING_STATUS.PENDING) {
          sendJson(res, 409, { message: "This ride has already been booked by another driver." });
          return;
        }
        if (!Array.isArray(ride.candidateDriverIds) || !ride.candidateDriverIds.includes(driverId)) {
          sendJson(res, 403, { message: "This request is not available for this driver." });
          return;
        }

        ride.driver = withDriverTripMetrics(buildDriverSummary(driver, ride.pickup), ride.pickup);
        ride.status = BOOKING_STATUS.ACCEPTED;
        ride.acceptedAt = new Date().toISOString();
        ride.updatedAt = new Date().toISOString();
        await writeStore(store);
        publishRideRealtimeUpdate(store, ride.id);
        await notifyUserById(store, ride.userId, {
          title: "Driver accepted your ride",
          body: `${driver.name} accepted your request and is on the way.`,
          data: { rideId: ride.id, status: ride.status, role: "user" },
        });
        sendJson(res, 200, { ride: refreshRideDriverSnapshot(store, ride) });
        return;
      }

      if (
        body.status === BOOKING_STATUS.CANCELLED &&
        normalizeText(body.actor) === "driver" &&
        ride.status === BOOKING_STATUS.ACCEPTED
      ) {
        const reassignmentResult = rejectAndReassignRide(store, ride, normalizeText(body.driverId || ride.driver?.id));
        if (reassignmentResult.cancelled) {
          closeSharedRideRequestsForRide(store, ride.id, "closed");
        }
        await writeStore(store);
        publishRideRealtimeUpdate(store, ride.id);
        if (reassignmentResult.reassigned) {
          await notifyUserById(store, ride.userId, {
            title: "Driver updated",
            body: `${ride.driver.name} is now assigned to your ride.`,
            data: { rideId: ride.id, status: ride.status, role: "user" },
          });
          await notifyUserById(store, ride.driver.id, {
            title: "New ride assigned",
            body: `${ride.pickup.name} to ${ride.drop.name}`,
            data: { rideId: ride.id, status: ride.status, role: "driver" },
          });
        } else {
          await notifyUserById(store, ride.userId, {
            title: "Ride cancelled",
            body: "No other nearby driver was available after reassignment.",
            data: { rideId: ride.id, status: ride.status, role: "user" },
          });
        }
        sendJson(res, 200, {
          ride: refreshRideDriverSnapshot(store, reassignmentResult.ride),
          reassigned: reassignmentResult.reassigned,
          cancelled: reassignmentResult.cancelled,
        });
        return;
      }

      ride.status = body.status || ride.status;
      if (ride.driver?.id) {
        const driver = store.users.find((user) => user.id === ride.driver.id);
        if (driver) {
          const targetPoint = ride.status === BOOKING_STATUS.IN_PROGRESS ? ride.drop : ride.pickup;
          ride.driver = withDriverTripMetrics(
            {
              ...ride.driver,
              latitude: driver.currentLocation?.latitude ?? ride.driver.latitude,
              longitude: driver.currentLocation?.longitude ?? ride.driver.longitude,
              online: Boolean(driver.online),
            },
            targetPoint || ride.pickup
          );
        }
      }
      ride.updatedAt = new Date().toISOString();
      if (ride.status === BOOKING_STATUS.COMPLETED || ride.status === BOOKING_STATUS.CANCELLED) {
        closeSharedRideRequestsForRide(store, ride.id, "closed");
      }
      await writeStore(store);
      publishRideRealtimeUpdate(store, ride.id);
      if (ride.status === BOOKING_STATUS.IN_PROGRESS) {
        await notifyUserById(store, ride.userId, {
          title: "Ride started",
          body: `${ride.driver?.name || "Your driver"} verified the OTP and started the trip.`,
          data: { rideId: ride.id, status: ride.status, role: "user" },
        });
      }
      if (ride.status === BOOKING_STATUS.ARRIVED) {
        await notifyUserById(store, ride.userId, {
          title: "Driver arrived",
          body: `${ride.driver?.name || "Your driver"} has reached the pickup point. Share OTP to begin.`,
          data: { rideId: ride.id, status: ride.status, role: "user" },
        });
      }
      if (ride.status === BOOKING_STATUS.COMPLETED) {
        await notifyUserById(store, ride.userId, {
          title: "Ride completed",
          body: "Your ride has been marked completed.",
          data: { rideId: ride.id, status: ride.status, role: "user" },
        });
      }
      if (ride.status === BOOKING_STATUS.CANCELLED && normalizeText(body.actor) !== "driver") {
        await notifyUserById(store, ride.driver?.id, {
          title: "Ride cancelled",
          body: "The current trip has been cancelled.",
          data: { rideId: ride.id, status: ride.status, role: "driver" },
        });
      }
      sendJson(res, 200, { ride: refreshRideDriverSnapshot(store, ride) });
      return;
    }

    sendJson(res, 404, { message: "Not found" });
  } catch (error) {
    if (error?.code === "STORE_VERSION_CONFLICT") {
      sendJson(res, 409, { message: error.message || "Concurrent update conflict. Please retry." });
      return;
    }
    sendJson(res, 500, { message: error.message || "Internal server error" });
  }
});

const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (socket) => {
  wsSafeSend(socket, {
    type: "connected",
    ts: new Date().toISOString(),
  });

  socket.on("message", async (raw) => {
    let message;
    try {
      message = JSON.parse(String(raw || "{}"));
    } catch {
      wsSafeSend(socket, { type: "error", message: "Invalid JSON payload" });
      return;
    }

    if (message?.action === "subscribe_ride") {
      const rideId = String(message.rideId || "");
      if (!rideId) {
        wsSafeSend(socket, { type: "error", message: "rideId is required" });
        return;
      }

      addRideSubscriber(rideId, socket);
      wsSafeSend(socket, { type: "subscribed", channel: "ride", rideId });

      try {
        const store = await readStore();
        publishRideRealtimeUpdate(store, rideId);
      } catch {
        wsSafeSend(socket, { type: "error", message: "Unable to load initial ride state" });
      }
      return;
    }

    if (message?.action === "unsubscribe_ride") {
      removeRideSubscriber(message.rideId, socket);
      wsSafeSend(socket, { type: "unsubscribed", channel: "ride", rideId: String(message.rideId || "") });
      return;
    }

    if (message?.action === "subscribe_bus") {
      addBusSubscriber(socket);
      wsSafeSend(socket, { type: "subscribed", channel: "bus" });
      try {
        const store = await readStore();
        publishBusRealtimeUpdate(store);
      } catch {
        wsSafeSend(socket, { type: "error", message: "Unable to load bus realtime state" });
      }
      return;
    }

    if (message?.action === "unsubscribe_bus") {
      removeBusSubscriber(socket);
      wsSafeSend(socket, { type: "unsubscribed", channel: "bus" });
      return;
    }

    if (message?.action === "ping") {
      wsSafeSend(socket, { type: "pong", ts: new Date().toISOString() });
      return;
    }

    wsSafeSend(socket, { type: "error", message: "Unknown action" });
  });

  socket.on("close", () => {
    removeSocketFromAllRideSubscriptions(socket);
    removeBusSubscriber(socket);
  });

  socket.on("error", () => {
    removeSocketFromAllRideSubscriptions(socket);
    removeBusSubscriber(socket);
  });
});

server.on("upgrade", (req, socket, head) => {
  let requestUrl;
  try {
    requestUrl = new URL(req.url, `http://${req.headers.host}`);
  } catch {
    socket.destroy();
    return;
  }

  if (requestUrl.pathname !== "/ws") {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

createStorage({ seedStore: DEFAULT_STORE })
  .then((resolvedStorage) => {
    storage = resolvedStorage;
    server.listen(PORT, HOST, () => {
      console.log(
        `Ghoomo backend listening on http://${HOST}:${PORT} using ${resolvedStorage.mode} storage`
      );
    });
  })
  .catch((error) => {
    console.error("Failed to initialize storage", error);
    process.exit(1);
  });
