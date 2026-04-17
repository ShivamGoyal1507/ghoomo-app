import { getNextDeparture } from "./bus";

const DEFAULT_CENTER = {
  latitude: 30.900965,
  longitude: 75.857277,
};

function hashText(text) {
  const value = String(text || "");
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function getRouteStopNames(route) {
  const stops = Array.isArray(route?.stops) ? route.stops.filter(Boolean) : [];
  if (stops.length >= 2) return stops;
  const fallback = [route?.from, route?.to].filter(Boolean);
  if (fallback.length >= 2) return fallback;
  if (fallback.length === 1) return [fallback[0], `${fallback[0]} Drop`];
  return ["Campus Gate", "Destination"];
}

function getRouteCenter(route) {
  const routeHash = hashText(route?.id || route?.name || "route");
  const latOffset = ((routeHash % 140) - 70) / 10000;
  const lonOffset = (((routeHash >> 4) % 180) - 90) / 10000;

  return {
    latitude: DEFAULT_CENTER.latitude + latOffset,
    longitude: DEFAULT_CENTER.longitude + lonOffset,
  };
}

export function buildBusStopPoints(route) {
  const stopNames = getRouteStopNames(route);
  const center = getRouteCenter(route);
  const routeHash = hashText(`${route?.id || route?.name || "route"}:shape`);
  const angle = toRadians(routeHash % 360);

  const segments = Math.max(stopNames.length - 1, 1);
  const totalDistanceKm = clamp(2 + stopNames.length * 0.8, 2.5, 8.5);

  const kmToLat = 1 / 110.574;
  const kmToLon = 1 / (111.32 * Math.cos(toRadians(center.latitude)));
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const normalX = -dy;
  const normalY = dx;

  return stopNames.map((name, index) => {
    const t = segments === 0 ? 0 : index / segments;
    const distanceFromCenterKm = (t - 0.5) * totalDistanceKm;
    const waveKm = Math.sin(t * Math.PI) * (0.16 + (routeHash % 5) * 0.03);

    const eastKm = distanceFromCenterKm * dx + waveKm * normalX;
    const northKm = distanceFromCenterKm * dy + waveKm * normalY;

    return {
      id: `${route?.id || "route"}_stop_${index}`,
      name,
      latitude: center.latitude + northKm * kmToLat,
      longitude: center.longitude + eastKm * kmToLon,
      index,
    };
  });
}

export function getBusLiveSnapshot(route, now = new Date()) {
  const stops = buildBusStopPoints(route);
  const segmentCount = Math.max(stops.length - 1, 1);
  const stopGapMinutes = 8;
  const routeDurationMinutes = segmentCount * stopGapMinutes;

  const departureAt = getNextDeparture(route, now);
  const arrivalAt = new Date(departureAt.getTime() + routeDurationMinutes * 60000);

  let progress = 0;
  if (now >= arrivalAt) {
    progress = 1;
  } else if (now > departureAt) {
    progress = (now.getTime() - departureAt.getTime()) / (arrivalAt.getTime() - departureAt.getTime());
  }

  const boundedProgress = clamp(progress, 0, 1);
  const segmentProgress = boundedProgress * segmentCount;
  const fromIndex = clamp(Math.floor(segmentProgress), 0, stops.length - 1);
  const toIndex = clamp(Math.min(fromIndex + 1, stops.length - 1), 0, stops.length - 1);
  const localRatio = clamp(segmentProgress - fromIndex, 0, 1);

  const fromStop = stops[fromIndex] || stops[0];
  const toStop = stops[toIndex] || stops[stops.length - 1];

  const busLocation = {
    latitude: fromStop.latitude + (toStop.latitude - fromStop.latitude) * localRatio,
    longitude: fromStop.longitude + (toStop.longitude - fromStop.longitude) * localRatio,
  };

  const remainingMs = Math.max(0, arrivalAt.getTime() - now.getTime());
  const etaMinutes = Math.ceil(remainingMs / 60000);
  const etaToNextStopMinutes = Math.max(1, Math.ceil((1 - localRatio) * stopGapMinutes));

  let statusLabel = "Departing soon";
  if (boundedProgress >= 1) {
    statusLabel = "Reached destination";
  } else if (boundedProgress > 0) {
    statusLabel = `${fromStop.name} -> ${toStop.name}`;
  }

  return {
    stops,
    routePoints: stops.map((stop) => ({ latitude: stop.latitude, longitude: stop.longitude })),
    progress: boundedProgress,
    fromStop,
    toStop,
    departureAt,
    arrivalAt,
    routeDurationMinutes,
    etaMinutes,
    etaToNextStopMinutes,
    statusLabel,
    busLocation,
  };
}

function squaredDistance(a, b) {
  const dLat = Number(a.latitude) - Number(b.latitude);
  const dLon = Number(a.longitude) - Number(b.longitude);
  return dLat * dLat + dLon * dLon;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function deriveProgressFromLocation(stops, busLocation) {
  if (!Array.isArray(stops) || stops.length < 2 || !busLocation) return null;

  let best = null;
  const segmentCount = stops.length - 1;

  for (let index = 0; index < segmentCount; index += 1) {
    const start = stops[index];
    const end = stops[index + 1];
    const abLat = end.latitude - start.latitude;
    const abLon = end.longitude - start.longitude;
    const abSq = abLat * abLat + abLon * abLon;
    if (abSq <= 0) continue;

    const apLat = busLocation.latitude - start.latitude;
    const apLon = busLocation.longitude - start.longitude;
    const t = clamp01((apLat * abLat + apLon * abLon) / abSq);
    const projection = {
      latitude: start.latitude + abLat * t,
      longitude: start.longitude + abLon * t,
    };
    const distSq = squaredDistance(busLocation, projection);

    if (!best || distSq < best.distSq) {
      best = {
        index,
        t,
        distSq,
      };
    }
  }

  if (!best) return null;

  const progress = (best.index + best.t) / segmentCount;
  const fromStop = stops[best.index];
  const toStop = stops[Math.min(best.index + 1, stops.length - 1)];

  return {
    progress: clamp01(progress),
    fromStop,
    toStop,
    localRatio: best.t,
  };
}

export function getGpsBusLiveSnapshot(route, liveBusLocation, now = new Date()) {
  if (
    !liveBusLocation ||
    !Number.isFinite(Number(liveBusLocation.latitude)) ||
    !Number.isFinite(Number(liveBusLocation.longitude))
  ) {
    return null;
  }

  const fallback = getBusLiveSnapshot(route, now);
  const stops = fallback.stops;
  const progressInfo = deriveProgressFromLocation(stops, {
    latitude: Number(liveBusLocation.latitude),
    longitude: Number(liveBusLocation.longitude),
  });

  if (!progressInfo) {
    return {
      ...fallback,
      busLocation: {
        latitude: Number(liveBusLocation.latitude),
        longitude: Number(liveBusLocation.longitude),
      },
    };
  }

  const segmentCount = Math.max(stops.length - 1, 1);
  const routeDurationMinutes = segmentCount * 8;
  const remainingRatio = 1 - progressInfo.progress;

  return {
    ...fallback,
    progress: progressInfo.progress,
    fromStop: progressInfo.fromStop,
    toStop: progressInfo.toStop,
    etaMinutes: Math.max(0, Math.ceil(routeDurationMinutes * remainingRatio)),
    etaToNextStopMinutes: Math.max(1, Math.ceil((1 - progressInfo.localRatio) * 8)),
    statusLabel:
      progressInfo.progress >= 1
        ? "Reached destination"
        : `${progressInfo.fromStop.name} -> ${progressInfo.toStop.name}`,
    busLocation: {
      latitude: Number(liveBusLocation.latitude),
      longitude: Number(liveBusLocation.longitude),
    },
  };
}
