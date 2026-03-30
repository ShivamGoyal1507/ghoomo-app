import React, { useEffect, useRef } from "react";
import { Provider } from "react-redux";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { store } from "./src/store";
import RootNavigator from "./src/navigation/RootNavigator";
import { initializeNotifications } from "./src/services/notifications";
import "./src/services/backgroundLocation";
import { hydrateAuthSession } from "./src/store/slices/authSlice";
import { COLORS } from "./src/constants";
import * as Sentry from '@sentry/react-native';
import { vexo, identifyDevice } from 'vexo-analytics'; 
vexo('d284a952-7090-45ad-a408-15274a43c5a4')

Sentry.init({
  dsn: 'https://aca474d67f9adc2f05fa7c1b2a307a02@o4511134562254848.ingest.de.sentry.io/4511134576476240',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

function AppBootstrap() {
  const dispatch = useDispatch();
  const hydrated = useSelector((state) => state.auth.hydrated);
  const user = useSelector((state) => state.auth.user);
  const lastIdentified = useRef(null);

  useEffect(() => {
    dispatch(hydrateAuthSession());
  }, [dispatch]);

  useEffect(() => {
    if (hydrated && user?.email && lastIdentified.current !== user.email) {
      identifyDevice(user.email);
      lastIdentified.current = user.email;
    }
  }, [hydrated, user]);

  if (!hydrated) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return <RootNavigator />;
}

export default Sentry.wrap(function App() {
  useEffect(() => {
    initializeNotifications().catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <Provider store={store}>
          <StatusBar style="auto" />
          <AppBootstrap />
        </Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  loaderWrap: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.background },
});
