import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSelector } from "react-redux";
import { SafeAreaView } from "react-native-safe-area-context";
import Header from "../../components/common/Header";
import Card from "../../components/common/Card";
import Badge from "../../components/common/Badge";
import { COLORS, SPACING } from "../../constants";
import { getBusLiveSnapshot, getGpsBusLiveSnapshot } from "../../utils/busTracking";
import { subscribeBusRealtime } from "../../services/realtime";
import { BUS_TRACKING_MODE, BUS_TRACKING_MODES } from "../../config/tracking";

function formatTimeLabel(date) {
  return date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getStopEta(snapshot, stopIndex) {
  const arrival = new Date(snapshot.departureAt);
  const addMinutes = stopIndex * 8;
  arrival.setMinutes(arrival.getMinutes() + addMinutes);
  return formatTimeLabel(arrival);
}

function RouteProgressView({ snapshot, compactLayout }) {
  const busPositionPercent = `${Math.max(0, Math.min(snapshot.progress * 100, 100)).toFixed(2)}%`;

  return (
    <>
      <Card style={styles.liveStatusCard}>
        <View style={styles.liveHeaderRow}>
          <View style={styles.liveIconWrap}>
            <Ionicons name="bus" size={24} color={COLORS.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.liveTitle}>Live Status</Text>
            <Text style={styles.liveSubtitle}>{snapshot.statusLabel}</Text>
          </View>
          <Badge
            color={snapshot.progress >= 1 ? COLORS.success : COLORS.primary}
            label={snapshot.progress >= 1 ? "Completed" : "Live"}
          />
        </View>

        <View style={styles.progressMetrics}>
          <View style={[styles.metricBox, compactLayout ? styles.metricBoxCompact : null]}>
            <Text style={styles.metricLabel}>Departure</Text>
            <Text style={styles.metricValue}>{formatTimeLabel(snapshot.departureAt)}</Text>
          </View>
          <View style={[styles.metricBox, compactLayout ? styles.metricBoxCompact : null]}>
            <Text style={styles.metricLabel}>Next Stop ETA</Text>
            <Text style={styles.metricValue}>
              {snapshot.progress >= 1 ? "Arrived" : `${snapshot.etaToNextStopMinutes} min`}
            </Text>
          </View>
          <View style={[styles.metricBox, compactLayout ? styles.metricBoxCompact : null]}>
            <Text style={styles.metricLabel}>Route ETA</Text>
            <Text style={styles.metricValue}>
              {snapshot.progress >= 1 ? "Done" : `${snapshot.etaMinutes} min`}
            </Text>
          </View>
        </View>

      </Card>

      <Card style={styles.timelineCard}>
        <Text style={styles.timelineTitle}>Stops</Text>
        <View style={styles.timelineWrap}>
          <View style={styles.timelineLine} />
          <View style={[styles.busFloating, { top: busPositionPercent }]}> 
            <Ionicons name="bus" size={15} color={COLORS.white} />
          </View>

          {snapshot.stops.map((stop, index) => {
            const isPassed = index <= snapshot.fromStop.index;
            const isCurrent = stop.index === snapshot.fromStop.index || stop.index === snapshot.toStop.index;

            return (
              <View key={stop.id} style={styles.stopRow}>
                <View
                  style={[
                    styles.stopDot,
                    isPassed ? styles.stopDotPassed : null,
                    isCurrent ? styles.stopDotCurrent : null,
                  ]}
                />
                <View style={styles.stopContent}>
                  <Text style={[styles.stopName, isCurrent ? styles.stopNameCurrent : null]}>{stop.name}</Text>
                  <Text style={styles.stopMeta}>{getStopEta(snapshot, index)}</Text>
                </View>
                {isCurrent && snapshot.progress < 1 ? (
                  <View style={styles.livePill}>
                    <Text style={styles.livePillText}>Live</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </Card>

    </>
  );
}

export default function CollegeBusLiveScreen({ navigation, route }) {
  const { width } = useWindowDimensions();
  const compactLayout = width < 390;
  const routes = useSelector((state) => state.busRoutes.routes);
  const [now, setNow] = useState(new Date());
  const [selectedRouteId, setSelectedRouteId] = useState(route?.params?.routeId || null);
  const [routeBusLocations, setRouteBusLocations] = useState({});

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeBusRealtime({
      onBusUpdate: (payload) => {
        const locations = Array.isArray(payload?.busLocations) ? payload.busLocations : [];
        const byRoute = {};

        locations.forEach((item) => {
          const routeId = String(item?.routeId || "").trim();
          const latitude = Number(item?.location?.latitude);
          const longitude = Number(item?.location?.longitude);
          if (!routeId || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return;
          }

          const previous = byRoute[routeId];
          const currentTs = new Date(item?.lastSeenAt || 0).getTime();
          const previousTs = new Date(previous?.lastSeenAt || 0).getTime();
          if (!previous || currentTs >= previousTs) {
            byRoute[routeId] = {
              routeId,
              driverId: item.driverId,
              driverName: item.driverName,
              online: Boolean(item.online),
              lastSeenAt: item.lastSeenAt || null,
              location: { latitude, longitude },
            };
          }
        });

        setRouteBusLocations(byRoute);
      },
      onError: () => {},
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (routes.length === 0) return;
    if (!selectedRouteId) {
      setSelectedRouteId(routes[0].id);
      return;
    }

    const exists = routes.some((item) => item.id === selectedRouteId);
    if (!exists) {
      setSelectedRouteId(routes[0].id);
    }
  }, [routes, selectedRouteId]);

  const selectedRoute = useMemo(
    () => routes.find((item) => item.id === selectedRouteId) || null,
    [routes, selectedRouteId]
  );

  const trackingMode = BUS_TRACKING_MODE;
  const selectedRouteLive = selectedRoute ? routeBusLocations[selectedRoute.id] : null;

  const snapshot = useMemo(() => {
    if (!selectedRoute) return null;

    if (trackingMode === BUS_TRACKING_MODES.SIMULATED) {
      return getBusLiveSnapshot(selectedRoute, now);
    }

    if (trackingMode === BUS_TRACKING_MODES.GPS) {
      const gpsSnapshot = getGpsBusLiveSnapshot(selectedRoute, selectedRouteLive?.location, now);
      return gpsSnapshot || getBusLiveSnapshot(selectedRoute, now);
    }

    const autoGpsSnapshot = getGpsBusLiveSnapshot(selectedRoute, selectedRouteLive?.location, now);
    return autoGpsSnapshot || getBusLiveSnapshot(selectedRoute, now);
  }, [selectedRoute, selectedRouteLive?.location, now, trackingMode]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Header
        title="Bus Live"
        onBack={() => navigation.goBack()}
      />

      {!selectedRoute || !snapshot ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="bus-outline" size={44} color={COLORS.gray} />
          <Text style={styles.emptyTitle}>No route found</Text>
          <Text style={styles.emptyText}>Add a route to start tracking.</Text>
        </View>
      ) : (
        <>
          <ScrollView style={styles.scroll} contentContainerStyle={{ padding: SPACING.md, paddingBottom: 30 }}>
            <RouteProgressView snapshot={snapshot} compactLayout={compactLayout} />
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: SPACING.xl },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: COLORS.text },
  emptyText: { fontSize: 13, color: COLORS.textSecondary, textAlign: "center" },
  scroll: { flex: 1 },
  liveStatusCard: { marginBottom: SPACING.md },
  liveHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  liveIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  liveTitle: { fontSize: 16, fontWeight: "900", color: COLORS.text },
  liveSubtitle: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  progressMetrics: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  metricBox: {
    flex: 1,
    minWidth: 96,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.grayLight,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  metricBoxCompact: {
    minWidth: "48%",
  },
  metricLabel: { fontSize: 10, color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.3 },
  metricValue: { fontSize: 13, color: COLORS.text, fontWeight: "800", marginTop: 2 },
  timelineCard: { marginBottom: SPACING.md },
  timelineTitle: { fontSize: 14, fontWeight: "800", color: COLORS.text, marginBottom: 10 },
  timelineWrap: { paddingLeft: 16 },
  timelineLine: {
    position: "absolute",
    left: 5,
    top: 10,
    bottom: 12,
    width: 2,
    backgroundColor: COLORS.border,
  },
  busFloating: {
    position: "absolute",
    left: -4,
    width: 20,
    height: 20,
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  stopRow: {
    minHeight: 52,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  stopDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.gray,
    backgroundColor: COLORS.white,
    marginRight: 12,
  },
  stopDotPassed: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.success,
  },
  stopDotCurrent: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  stopContent: { flex: 1 },
  stopName: { fontSize: 13, fontWeight: "700", color: COLORS.text },
  stopNameCurrent: { color: COLORS.primary },
  stopMeta: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  livePill: {
    backgroundColor: COLORS.primary + "18",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  livePillText: { fontSize: 10, fontWeight: "800", color: COLORS.primary },
});
