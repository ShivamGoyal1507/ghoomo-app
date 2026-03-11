const http = require("http");
const { URL } = require("url");
const { createStorage } = require("./storage");

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
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

const USER_ROLES = {
  USER: "user",
  DRIVER: "driver",
  ADMIN: "admin",
};

const DEFAULT_BUS_ROUTES = [
  {
    id: "b1",
    name: "Route A - Campus to City",
    from: "Main Campus Gate",
    to: "City Bus Stand",
    departureTime: "08:00 AM",
    returnTime: "05:30 PM",
    totalSeats: 40,
    waitingSeats: 10,
    fare: 15,
    stops: ["Campus Gate", "Library", "Boys Hostel", "NH Highway", "City Bus Stand"],
  },
  {
    id: "b2",
    name: "Route B - Campus to Railway",
    from: "Main Campus Gate",
    to: "Railway Station",
    departureTime: "07:30 AM",
    returnTime: "06:00 PM",
    totalSeats: 35,
    waitingSeats: 10,
    fare: 20,
    stops: ["Campus Gate", "Admin Block", "Market Area", "Railway Station"],
  },
  {
    id: "b3",
    name: "Route C - North Campus Shuttle",
    from: "North Campus",
    to: "Main Campus",
    departureTime: "09:00 AM",
    returnTime: "04:00 PM",
    totalSeats: 30,
    waitingSeats: 10,
    fare: 10,
    stops: ["North Campus", "Science Block", "Sports Complex", "Main Campus"],
  },
];

const DEFAULT_STORE = {
  users: [],
  rides: [],
  busRoutes: DEFAULT_BUS_ROUTES,
  busBookings: [],
  sharedRideRequests: [],
};

let storage;

function readStore() {
  const store = storage.readStore();
  if (!Array.isArray(store.busRoutes)) {
    store.busRoutes = DEFAULT_BUS_ROUTES.map((route) => ({ ...route }));
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
  return (store.busRoutes || DEFAULT_BUS_ROUTES).map((route) => ({
    ...route,
    bookedSeats: Array.isArray(route.bookedSeats) ? route.bookedSeats : [],
    waitingSeats: Number(route.waitingSeats || 10),
    totalSeats: Number(route.totalSeats || 0),
    fare: Number(route.fare || 0),
    stops: Array.isArray(route.stops) ? route.stops : [],
  }));
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

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "ghoomo-app/1.0 (contact: local-dev)",
      Accept: "application/json",
    },
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

async function getRoute(start, end) {
  const data = await fetchJson(
    `https://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=full&geometries=geojson`
  );

  const route = data.routes?.[0];
  if (!route) throw new Error("No route found");

  return {
    distanceKm: Number((route.distance / 1000).toFixed(1)),
    durationMinutes: Math.max(1, Math.round(route.duration / 60)),
    geometry: route.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })),
  };
}

function calculateFare(rideType, isShare, distanceKm) {
  const fareKey = isShare ? `${rideType}Share` : rideType;
  const fareRule = FARES[fareKey] || FARES[rideType] || FARES.cab;
  return {
    fareKey,
    fare: Math.round(fareRule.base + fareRule.perKm * distanceKm),
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
  const activeRide =
    assignedRides.find((ride) => ride.status === BOOKING_STATUS.IN_PROGRESS) ||
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
  const activeRideStatuses = new Set([BOOKING_STATUS.ACCEPTED, BOOKING_STATUS.IN_PROGRESS]);
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
  const totalRevenue =
    completedRides.reduce((sum, ride) => sum + Number(ride.fare || 0), 0) +
    confirmedBusBookings.reduce((sum, booking) => {
      const route = busRoutes.find((entry) => entry.id === booking.routeId);
      return sum + Number(route?.fare || 0);
    }, 0);
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
          fare: Number(route?.fare || 0),
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
  const fare = Number(body.fare);
  const stops = Array.isArray(body.stops)
    ? body.stops.map(normalizeText).filter(Boolean)
    : String(body.stops || "")
        .split(",")
        .map(normalizeText)
        .filter(Boolean);

  if (!name || !from || !to || !departureTime || !returnTime || !totalSeats || !fare || stops.length < 2) {
    return {
      error:
        "Route name, source, destination, departure time, return time, total seats, fare, and at least two stops are required.",
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
      fare,
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
      const store = readStore();
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
      const store = readStore();
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
      await writeStore(store);
      sendJson(res, 201, { user: safeUser(user) });
      return;
    }

    if (requestUrl.pathname.match(/^\/api\/users\/[^/]+\/push-token$/)) {
      const userId = requestUrl.pathname.split("/")[3];
      const store = readStore();
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
      const store = readStore();
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
      const store = readStore();
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
      const store = readStore();
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
      const store = readStore();
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
      const store = readStore();
      sendJson(res, 200, { routes: getBusRoutes(store) });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/bus-routes") {
      const body = await parseBody(req);
      const store = readStore();
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
      sendJson(res, 201, { route, routes: store.busRoutes });
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
      const pricing = calculateFare(body.rideType || "cab", Boolean(body.isShare), route.distanceKm);
      const nearbyDrivers = getNearbyDrivers(readStore(), pickup, body.rideType || "cab");
      const driver = nearbyDrivers[0] || null;
      sendJson(res, 200, {
        pickup,
        drop,
        route,
        estimate: {
          fare: pricing.fare,
          distanceKm: route.distanceKm,
          durationMinutes: route.durationMinutes,
          fareRule: pricing.fareRule,
          shareApplied: Boolean(body.isShare),
        },
        driver,
        nearbyDrivers,
        availability: driver
          ? { available: true, message: `${nearbyDrivers.length} nearby drivers can receive this request.` }
          : { available: false, message: "No online drivers are currently available near this pickup." },
      });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/rides") {
      const body = await parseBody(req);
      const store = readStore();
      const pickup = await ensureLocation(body.pickup);
      const drop = await ensureLocation(body.drop);
      const route = await getRoute(pickup, drop);
      const pricing = calculateFare(body.rideType || "cab", Boolean(body.isShare), route.distanceKm);
      const nearbyDrivers = getNearbyDrivers(store, pickup, body.rideType || "cab");
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
        distance: route.distanceKm,
        durationMinutes: route.durationMinutes,
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
      const store = readStore();
      const rides = store.rides
        .filter((ride) => ride.userId === userId)
        .map((ride) => refreshRideDriverSnapshot(store, ride));
      sendJson(res, 200, { rides });
      return;
    }

    if (req.method === "GET" && requestUrl.pathname.startsWith("/api/drivers/") && requestUrl.pathname.endsWith("/dashboard")) {
      const driverId = requestUrl.pathname.split("/")[3];
      const store = readStore();
      const dashboard = buildDriverDashboard(store, driverId);
      if (!dashboard) {
        sendJson(res, 404, { message: "Driver not found" });
        return;
      }
      sendJson(res, 200, dashboard);
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/admin/dashboard") {
      const store = readStore();
      sendJson(res, 200, buildAdminDashboard(store));
      return;
    }

    if (req.method === "POST" && requestUrl.pathname.startsWith("/api/drivers/") && requestUrl.pathname.endsWith("/status")) {
      const driverId = requestUrl.pathname.split("/")[3];
      const body = await parseBody(req);
      const store = readStore();
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
      const store = readStore();
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
        }
      });

      await writeStore(store);
      const dashboard = buildDriverDashboard(store, driverId);
      sendJson(res, 200, dashboard);
      return;
    }

    if (req.method === "GET" && requestUrl.pathname.startsWith("/api/rides/")) {
      const rideId = requestUrl.pathname.split("/").pop();
      const store = readStore();
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
      const store = readStore();
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
        ride.otpVerifiedAt = new Date().toISOString();
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
      if (ride.status === BOOKING_STATUS.IN_PROGRESS) {
        await notifyUserById(store, ride.userId, {
          title: "Ride started",
          body: `${ride.driver?.name || "Your driver"} verified the OTP and started the trip.`,
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
    sendJson(res, 500, { message: error.message || "Internal server error" });
  }
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
