import { Platform } from "react-native";
import Constants from "expo-constants";
import { api } from "./api";

let Notifications = null;

// Always try to load Notifications, works in both Expo Go and production
try {
  Notifications = require("expo-notifications");
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  console.log("[Notifications] Initialized successfully");
} catch (error) {
  console.warn("[Notifications] Failed to initialize:", error.message);
  Notifications = null;
}

const sentKeys = new Set();
let registeredPushToken = null;

export async function initializeNotifications() {
  if (!Notifications) return false;

  const permissions = await Notifications.getPermissionsAsync();
  let finalStatus = permissions.status;

  if (finalStatus !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  return finalStatus === "granted";
}

function getExpoProjectId() {
  const candidates = [
    Constants.easConfig?.projectId,
    Constants.expoConfig?.extra?.eas?.projectId,
    Constants.expoConfig?.extra?.projectId,
    Constants.expoConfig?.projectId,
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
    process.env.EXPO_PUBLIC_PROJECT_ID,
  ];
  return candidates.find((value) => typeof value === "string" && value.trim().length > 0) || null;
}

export async function registerPushTokenForUser(userId) {
  if (!Notifications || !userId) {
    console.log("[Notifications] Skipping push token registration - Notifications or userId missing");
    return null;
  }

  try {
    console.log("[Notifications] Initializing notifications for user:", userId);
    const granted = await initializeNotifications();
    if (!granted) {
      console.warn("[Notifications] Notification permission not granted");
      return null;
    }

    const projectId = getExpoProjectId();
    if (!projectId) {
      console.warn("[Notifications] No Expo project ID configured");
      return null;
    }

    console.log("[Notifications] Fetching push token");
    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResponse?.data || null;
    
    if (!token) {
      console.warn("[Notifications] Failed to get push token");
      return null;
    }

    if (token === registeredPushToken) {
      console.log("[Notifications] Push token already registered");
      return token;
    }

    console.log("[Notifications] Registering push token with backend");
    await api.registerPushToken(userId, token);
    registeredPushToken = token;
    console.log("[Notifications] ✓ Push token registered successfully");
    return token;
  } catch (error) {
    console.error("[Notifications] Error registering push token:", error.message);
    // Non-blocking failure - don't throw, just log
    return null;
  }
}

export async function unregisterPushTokenForUser(userId) {
  if (!userId) return;
  try {
    await api.removePushToken(userId);
  } catch (_error) {
    // Ignore cleanup failures during logout.
  }
  registeredPushToken = null;
}

export async function sendLocalNotification({ title, body, data, key }) {
  if (!Notifications) return;
  if (!title || !body) return;
  if (key && sentKeys.has(key)) return;
  if (key) sentKeys.add(key);

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: data || {},
      sound: "default",
    },
    trigger: null,
  });
}

export function clearNotificationKey(key) {
  if (key) sentKeys.delete(key);
}
