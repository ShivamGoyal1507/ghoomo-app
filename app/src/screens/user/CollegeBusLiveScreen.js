import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSelector } from "react-redux";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Path, Line, Rect, Text as SvgText } from "react-native-svg";
import Header from "../../components/common/Header";
import Card from "../../components/common/Card";
import { COLORS, SPACING, RADIUS, SHADOWS } from "../../constants";
import { getStopCoordinates, haversineKm, estimateTravelMinutes } from "../../constants/iitrprStops";
import { subscribeBusRealtime } from "../../services/realtime";
import { getBusLiveSnapshot, getGpsBusLiveSnapshot, buildBusStopPoints } from "../../utils/busTracking";
import { buildTileGrid, getMapRegion, projectToGrid, latLonToWorld } from "../../utils/map";

const MIN_ZOOM = 10;
const MAX_ZOOM = 16;

function buildPath(points, region, grid) {
  return points
    .map((point, index) => {
      const projected = projectToGrid(point, region, grid);
      return `${index === 0 ? "M" : "L"} ${projected.x.toFixed(1)} ${projected.y.toFixed(1)}`;
    })
    .join(" ");
}

export default function CollegeBusLiveScreen({ navigation, route: navRoute }) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isWide = screenWidth >= 768;
  const mapHeight = isWide ? screenHeight * 0.5 : screenHeight * 0.42;

  const routeId = navRoute?.params?.routeId;
  const routes = useSelector((state) => state.busRoutes.routes);
  const busRoute = useMemo(() => routes.find((r) => r.id === routeId), [routes, routeId]);

  const [liveBusLocation, setLiveBusLocation] = useState(null);
  const [now, setNow] = useState(new Date());
  const [zoom, setZoom] = useState(13);

  // Realtime subscription
  useEffect(() => {
    const unsubscribe = subscribeBusRealtime((drivers) => {
      if (!Array.isArray(drivers)) return;
      const match = drivers.find((d) => d.routeId === routeId);
      if (match) {
        setLiveBusLocation({
          latitude: Number(match.latitude),
          longitude: Number(match.longitude),
        });
      }
    });
    return () => unsubscribe?.();
  }, [routeId]);

  // Time ticker
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 5000);
    return () => clearInterval(interval);
  }, []);

  // Build stop points with real GPS coordinates
  const stops = useMemo(() => {
    if (!busRoute) return [];
    const routeStops = Array.isArray(busRoute.stops) ? busRoute.stops : [];
    if (routeStops.length < 2) {
      return buildBusStopPoints(busRoute);
    }
    return routeStops.map((stopName, index) => {
      const coords = getStopCoordinates(stopName);
      return {
        id: `${routeId}_stop_${index}`,
        name: String(stopName),
        latitude: coords.latitude,
        longitude: coords.longitude,
        index,
      };
    });
  }, [busRoute, routeId]);

  // Get snapshot based on live GPS or simulated
  const snapshot = useMemo(() => {
    if (!busRoute) return null;

    if (liveBusLocation) {
      return getGpsBusLiveSnapshot(busRoute, liveBusLocation, now);
    }
    return getBusLiveSnapshot(busRoute, now);
  }, [busRoute, liveBusLocation, now]);

  // Calculate ETA for each stop from current bus position
  const stopETAs = useMemo(() => {
    if (!snapshot || !stops.length) return [];
    const busLoc = snapshot.busLocation || (stops[0] ? stops[0] : null);
    if (!busLoc) return stops.map(() => null);

    return stops.map((stop) => {
      const distKm = haversineKm(busLoc, stop);
      const etaMin = estimateTravelMinutes(distKm);
      return { distKm, etaMin };
    });
  }, [snapshot, stops]);

  // Map region
  const allPoints = useMemo(() => {
    const pts = [...stops];
    if (snapshot?.busLocation) pts.push(snapshot.busLocation);
    return pts.filter((p) => p && Number.isFinite(p.latitude));
  }, [stops, snapshot?.busLocation]);

  const autoRegion = useMemo(() => getMapRegion(allPoints), [allPoints]);
  const region = useMemo(
    () => ({ ...autoRegion, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) }),
    [autoRegion, zoom]
  );
  const grid = useMemo(() => buildTileGrid(region), [region]);

  // Auto-fit zoom
  useEffect(() => {
    if (autoRegion.zoom) setZoom(autoRegion.zoom);
  }, [autoRegion.zoom]);

  const routePoints = useMemo(
    () => stops.map((s) => ({ latitude: s.latitude, longitude: s.longitude })),
    [stops]
  );
  const routePath = useMemo(() => buildPath(routePoints, region, grid), [routePoints, region, grid]);

  const scale = Math.min(1, Math.max(0.42, (screenWidth - 32) / grid.width));
  const canZoomIn = zoom < MAX_ZOOM;
  const canZoomOut = zoom > MIN_ZOOM;

  if (!busRoute) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Header title="Bus Tracking" onBack={() => navigation.goBack()} />
        <View style={styles.emptyState}>
          <Ionicons name="bus-outline" size={48} color={COLORS.border} />
          <Text style={styles.emptyText}>Bus route not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isLive = !!liveBusLocation;
  const progress = snapshot?.progress || 0;
  const statusText = isLive
    ? `Live • ${snapshot?.statusLabel || "Tracking"}`
    : snapshot?.statusLabel || "Waiting for GPS...";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Header
        title={busRoute.name}
        subtitle={`${busRoute.from} → ${busRoute.to}`}
        onBack={() => navigation.goBack()}
      />

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Map View */}
        <View style={[styles.mapContainer, { height: mapHeight }]}>
          <View style={[styles.canvasWrap, { transform: [{ scale }] }]}>
            <View style={styles.canvas}>
              {grid.tiles.map((tile) => (
                <View key={tile.key} style={[styles.tile, { left: tile.left, top: tile.top }]}>
                  <View style={styles.tilePlaceholder} />
                </View>
              ))}
              {/* We use Svg to draw route + markers on the tile grid */}
              <Svg width={grid.width} height={grid.height} style={styles.overlay}>
                {/* Route line */}
                {routePath ? (
                  <Path
                    d={routePath}
                    stroke={COLORS.primary}
                    strokeWidth={4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    strokeDasharray="8,4"
                  />
                ) : null}

                {/* Stop markers */}
                {stops.map((stop, index) => {
                  const projected = projectToGrid(stop, region, grid);
                  const isFirst = index === 0;
                  const isLast = index === stops.length - 1;
                  const color = isFirst ? COLORS.success : isLast ? COLORS.error : COLORS.primary;
                  return (
                    <React.Fragment key={stop.id}>
                      <Circle cx={projected.x} cy={projected.y} r={10} fill={color} opacity={0.2} />
                      <Circle cx={projected.x} cy={projected.y} r={6} fill={color} stroke="#FFF" strokeWidth={2} />
                      <SvgText
                        x={projected.x}
                        y={projected.y - 14}
                        fontSize={9}
                        fontWeight="bold"
                        fill={COLORS.text}
                        textAnchor="middle"
                      >
                        {stop.name.length > 12 ? stop.name.substring(0, 12) + "…" : stop.name}
                      </SvgText>
                    </React.Fragment>
                  );
                })}

                {/* Bus marker */}
                {snapshot?.busLocation && (
                  (() => {
                    const bProj = projectToGrid(snapshot.busLocation, region, grid);
                    return (
                      <>
                        <Circle cx={bProj.x} cy={bProj.y} r={16} fill="#F59E0B" opacity={0.25} />
                        <Circle cx={bProj.x} cy={bProj.y} r={10} fill="#F59E0B" stroke="#FFF" strokeWidth={3} />
                        <SvgText
                          x={bProj.x}
                          y={bProj.y + 4}
                          fontSize={8}
                          fontWeight="bold"
                          fill="#FFF"
                          textAnchor="middle"
                        >
                          🚌
                        </SvgText>
                      </>
                    );
                  })()
                )}
              </Svg>
            </View>
          </View>

          {/* Map Attribution */}
          <View style={styles.attribution}>
            <Text style={styles.attributionText}>© OpenStreetMap</Text>
          </View>

          {/* Zoom Controls */}
          <View style={styles.zoomControls}>
            <TouchableOpacity
              style={[styles.zoomBtn, !canZoomIn && styles.zoomBtnDisabled]}
              onPress={() => setZoom((z) => Math.min(MAX_ZOOM, z + 1))}
              disabled={!canZoomIn}
            >
              <Ionicons name="add" size={18} color={COLORS.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.zoomBtn, !canZoomOut && styles.zoomBtnDisabled]}
              onPress={() => setZoom((z) => Math.max(MIN_ZOOM, z - 1))}
              disabled={!canZoomOut}
            >
              <Ionicons name="remove" size={18} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {/* Status Overlay */}
          <View style={styles.statusOverlay}>
            <LinearGradient
              colors={isLive ? ["#10B981", "#059669"] : ["#6366F1", "#4F46E5"]}
              style={styles.statusBadge}
            >
              <View style={[styles.liveDot, { backgroundColor: isLive ? "#4ADE80" : "#A5B4FC" }]} />
              <Text style={styles.statusBadgeText}>
                {isLive ? "LIVE" : "SIMULATED"}
              </Text>
            </LinearGradient>
          </View>
        </View>

        {/* Trip Info Card */}
        <View style={[styles.infoSection, isWide && styles.infoSectionWide]}>
          <Card elevated style={styles.tripCard}>
            <View style={styles.tripHeader}>
              <View style={styles.tripHeaderLeft}>
                <Text style={styles.tripTitle}>{busRoute.name}</Text>
                <Text style={styles.tripSub}>{statusText}</Text>
              </View>
              <View style={styles.tripHeaderRight}>
                <Text style={styles.tripEtaLabel}>ETA</Text>
                <Text style={styles.tripEta}>
                  {snapshot?.etaMinutes != null ? `${snapshot.etaMinutes} min` : "--"}
                </Text>
              </View>
            </View>

            {/* Progress Bar */}
            <View style={styles.progressBarWrap}>
              <View style={styles.progressBarBg}>
                <LinearGradient
                  colors={["#10B981", "#059669"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.progressBarFill, { width: `${Math.min(100, progress * 100)}%` }]}
                />
              </View>
              <Text style={styles.progressText}>{Math.round(progress * 100)}% complete</Text>
            </View>

            {/* Trip Details */}
            <View style={styles.tripDetailsRow}>
              <View style={styles.tripDetail}>
                <Ionicons name="time-outline" size={14} color={COLORS.primary} />
                <Text style={styles.tripDetailText}>
                  Departs: {busRoute.departureTime || "—"}
                </Text>
              </View>
              <View style={styles.tripDetail}>
                <Ionicons name="git-compare-outline" size={14} color={COLORS.primary} />
                <Text style={styles.tripDetailText}>{stops.length} stops</Text>
              </View>
              {snapshot?.etaToNextStopMinutes != null && (
                <View style={styles.tripDetail}>
                  <Ionicons name="navigate-outline" size={14} color={COLORS.success} />
                  <Text style={styles.tripDetailText}>
                    Next stop: ~{snapshot.etaToNextStopMinutes} min
                  </Text>
                </View>
              )}
            </View>
          </Card>

          {/* Stop Timeline */}
          <Text style={styles.sectionTitle}>Route Stops</Text>
          {stops.map((stop, index) => {
            const isFirst = index === 0;
            const isLast = index === stops.length - 1;
            const isPassed = progress > 0 && index / Math.max(stops.length - 1, 1) <= progress;
            const isCurrent =
              snapshot?.fromStop?.index === index || snapshot?.toStop?.index === index;
            const eta = stopETAs[index];

            return (
              <View key={stop.id} style={styles.stopRow}>
                {/* Timeline connector */}
                <View style={styles.timelineCol}>
                  {!isFirst && (
                    <View style={[styles.timelineLine, isPassed && styles.timelineLinePassed]} />
                  )}
                  <View
                    style={[
                      styles.timelineDot,
                      isPassed && styles.timelineDotPassed,
                      isCurrent && styles.timelineDotCurrent,
                    ]}
                  >
                    {isPassed && <Ionicons name="checkmark" size={10} color={COLORS.white} />}
                    {isCurrent && !isPassed && (
                      <View style={styles.currentPulse} />
                    )}
                  </View>
                  {!isLast && (
                    <View style={[styles.timelineLine, isPassed && styles.timelineLinePassed]} />
                  )}
                </View>

                {/* Stop Info */}
                <View style={[styles.stopInfo, isCurrent && styles.stopInfoCurrent]}>
                  <View style={styles.stopNameRow}>
                    <Text style={[styles.stopName, isPassed && styles.stopNamePassed]}>
                      {stop.name}
                    </Text>
                    {isFirst && (
                      <View style={[styles.stopBadge, { backgroundColor: "#DCFCE7" }]}>
                        <Text style={[styles.stopBadgeText, { color: COLORS.success }]}>Start</Text>
                      </View>
                    )}
                    {isLast && (
                      <View style={[styles.stopBadge, { backgroundColor: "#FEE2E2" }]}>
                        <Text style={[styles.stopBadgeText, { color: COLORS.error }]}>End</Text>
                      </View>
                    )}
                    {isCurrent && !isFirst && !isLast && (
                      <View style={[styles.stopBadge, { backgroundColor: "#DBEAFE" }]}>
                        <Text style={[styles.stopBadgeText, { color: COLORS.primary }]}>Current</Text>
                      </View>
                    )}
                  </View>
                  {eta && !isPassed && (
                    <Text style={styles.stopEta}>
                      ~{eta.distKm.toFixed(1)} km • {eta.etaMin} min away
                    </Text>
                  )}
                  {isPassed && <Text style={styles.stopPassed}>Passed</Text>}
                </View>
              </View>
            );
          })}

          <View style={{ height: SPACING.xxl }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { fontSize: 16, color: COLORS.textSecondary, fontWeight: "600" },

  // Map
  mapContainer: {
    backgroundColor: "#D9E8F3",
    overflow: "hidden",
    justifyContent: "center",
  },
  canvasWrap: { alignSelf: "center" },
  canvas: { width: 256 * 3, height: 256 * 3, alignSelf: "center" },
  tile: { position: "absolute", width: 256, height: 256 },
  tilePlaceholder: {
    flex: 1,
    backgroundColor: "#E8EFF7",
    borderWidth: 0.5,
    borderColor: "#D0DBE8",
  },
  overlay: { position: "absolute", left: 0, top: 0 },
  attribution: {
    position: "absolute",
    right: 8,
    bottom: 8,
    backgroundColor: "rgba(255,255,255,0.88)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  attributionText: { fontSize: 9, color: COLORS.textSecondary, fontWeight: "600" },
  zoomControls: {
    position: "absolute",
    right: 10,
    top: "35%",
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.08)",
  },
  zoomBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  zoomBtnDisabled: { opacity: 0.35 },
  statusOverlay: {
    position: "absolute",
    left: 12,
    top: 12,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  statusBadgeText: { fontSize: 11, fontWeight: "800", color: COLORS.white, letterSpacing: 0.5 },

  // Info Section
  infoSection: { padding: SPACING.md },
  infoSectionWide: { maxWidth: 700, alignSelf: "center", width: "100%" },
  tripCard: { marginBottom: SPACING.md },
  tripHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  tripHeaderLeft: { flex: 1 },
  tripTitle: { fontSize: 17, fontWeight: "800", color: COLORS.text },
  tripSub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 3 },
  tripHeaderRight: { alignItems: "flex-end", backgroundColor: COLORS.primary + "12", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  tripEtaLabel: { fontSize: 10, color: COLORS.primary, fontWeight: "700" },
  tripEta: { fontSize: 20, fontWeight: "900", color: COLORS.primary },

  progressBarWrap: { marginBottom: 14 },
  progressBarBg: {
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: { height: "100%", borderRadius: 3 },
  progressText: { fontSize: 11, color: COLORS.textSecondary, fontWeight: "600", marginTop: 4 },

  tripDetailsRow: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  tripDetail: { flexDirection: "row", alignItems: "center", gap: 5 },
  tripDetailText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: "600" },

  sectionTitle: { fontSize: 16, fontWeight: "800", color: COLORS.text, marginBottom: SPACING.sm, marginTop: 4 },

  // Stop Timeline
  stopRow: { flexDirection: "row", minHeight: 60 },
  timelineCol: { width: 32, alignItems: "center" },
  timelineLine: { flex: 1, width: 2, backgroundColor: COLORS.border },
  timelineLinePassed: { backgroundColor: COLORS.success },
  timelineDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: COLORS.white,
    ...SHADOWS.soft,
  },
  timelineDotPassed: { backgroundColor: COLORS.success },
  timelineDotCurrent: { backgroundColor: COLORS.primary, borderColor: COLORS.primaryLight, borderWidth: 3 },
  currentPulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.white },

  stopInfo: {
    flex: 1,
    paddingLeft: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "transparent",
  },
  stopInfoCurrent: {
    backgroundColor: COLORS.primary + "08",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginLeft: 8,
    marginBottom: 4,
  },
  stopNameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  stopName: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  stopNamePassed: { color: COLORS.textSecondary },
  stopBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  stopBadgeText: { fontSize: 10, fontWeight: "800" },
  stopEta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 3, fontWeight: "500" },
  stopPassed: { fontSize: 12, color: COLORS.success, marginTop: 3, fontWeight: "600" },
});
