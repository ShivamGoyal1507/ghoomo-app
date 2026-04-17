import Constants from "expo-constants";

const TRACKING_MODE_GPS = "gps";
const TRACKING_MODE_SIMULATED = "simulated";
const TRACKING_MODE_AUTO = "auto";

const VALID_MODES = new Set([
  TRACKING_MODE_GPS,
  TRACKING_MODE_SIMULATED,
  TRACKING_MODE_AUTO,
]);

function normalizeTrackingMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (VALID_MODES.has(normalized)) return normalized;
  return TRACKING_MODE_AUTO;
}

export const BUS_TRACKING_MODES = {
  GPS: TRACKING_MODE_GPS,
  SIMULATED: TRACKING_MODE_SIMULATED,
  AUTO: TRACKING_MODE_AUTO,
};

export const BUS_TRACKING_MODE = normalizeTrackingMode(
  process.env.EXPO_PUBLIC_BUS_TRACKING_MODE ||
    Constants.expoConfig?.extra?.busTrackingMode ||
    TRACKING_MODE_AUTO
);
