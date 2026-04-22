import React, { useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useDispatch, useSelector } from "react-redux";
import { SafeAreaView } from "react-native-safe-area-context";
import Header from "../../components/common/Header";
import Card from "../../components/common/Card";
import { COLORS, SPACING, RADIUS, SHADOWS } from "../../constants";
import { fetchBusRoutes } from "../../store/slices/busRoutesSlice";
import { setUserFooterMode } from "../../store/slices/navigationPreferencesSlice";

export default function CollegeBusHomeScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const isSmall = width < 380;
  const routeCardWidth = isTablet ? (width - SPACING.md * 2 - 12) / 2 : "100%";
  const dispatch = useDispatch();
  const routes = useSelector((state) => state.busRoutes.routes);

  useEffect(() => {
    dispatch(fetchBusRoutes()).catch(() => {});
  }, [dispatch]);

  const sortedRoutes = useMemo(() => {
    return [...routes].sort((a, b) => {
      const aTime = String(a?.departureTime || "");
      const bTime = String(b?.departureTime || "");
      return aTime.localeCompare(bTime);
    });
  }, [routes]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Header
        title="College Bus"
        subtitle="Track & book bus routes"
        onBack={() => {
          dispatch(setUserFooterMode("shared"));
          navigation.goBack();
        }}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          isTablet && styles.scrollContentWide,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Quick Actions */}
        <View style={[styles.quickActions, isSmall && styles.quickActionsSmall]}>
          <TouchableOpacity
            style={[styles.quickActionBtn, { flex: 1 }]}
            onPress={() => navigation.navigate("BusSchedule")}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={["#6366F1", "#4F46E5"]}
              style={styles.quickActionGrad}
            >
              <Ionicons name="calendar" size={22} color={COLORS.white} />
              <View style={styles.quickActionInfo}>
                <Text style={styles.quickActionTitle}>Bus Schedule</Text>
                <Text style={styles.quickActionSub}>View official timings</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.7)" />
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Route Count */}
        <View style={styles.pageTitleRow}>
          <Text style={styles.pageTitle}>All Routes</Text>
          <Text style={styles.routeCount}>{sortedRoutes.length} routes</Text>
        </View>

        {sortedRoutes.length === 0 ? (
          <Card style={styles.emptyState}>
            <Ionicons name="bus" size={42} color={COLORS.border} />
            <Text style={styles.emptyTitle}>No Bus Routes</Text>
            <Text style={styles.emptyText}>
              No bus routes are available yet. Routes are managed by the admin.
            </Text>
          </Card>
        ) : (
          <View style={styles.routesGrid}>
            {sortedRoutes.map((route) => {
              const stopCount = Array.isArray(route.stops) ? route.stops.length : 0;
              return (
                <Card
                  key={route.id}
                  elevated
                  style={[styles.routeCard, { width: routeCardWidth }]}
                >
                  <View style={styles.routeHeaderRow}>
                    <View style={styles.routeLeft}>
                      <LinearGradient
                        colors={[COLORS.success, "#059669"]}
                        style={styles.busIconGrad}
                      >
                        <Ionicons name="bus" size={20} color={COLORS.white} />
                      </LinearGradient>
                      <View style={styles.routeHeaderInfo}>
                        <Text
                          style={[styles.routeName, isSmall && styles.routeNameSmall]}
                          numberOfLines={1}
                        >
                          {route.name}
                        </Text>
                        <Text style={styles.routeSub} numberOfLines={1}>
                          {route.from} → {route.to}
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.trackRightBtn}
                      onPress={() =>
                        navigation.navigate("CollegeBusLive", { routeId: route.id })
                      }
                    >
                      <Ionicons name="navigate" size={14} color={COLORS.white} />
                      <Text style={styles.trackRightBtnText}>Track</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.routeBasicTripRow}>
                    <View style={styles.routeDetail}>
                      <Ionicons name="time" size={14} color={COLORS.primary} />
                      <Text style={styles.routeDetailText}>
                        {route.departureTime || "—"}
                      </Text>
                    </View>
                    <View style={styles.routeDetail}>
                      <Ionicons name="git-compare" size={14} color={COLORS.primary} />
                      <Text style={styles.routeDetailText}>{stopCount} stops</Text>
                    </View>
                    {route.totalSeats && (
                      <View style={styles.routeDetail}>
                        <Ionicons name="people" size={14} color={COLORS.primary} />
                        <Text style={styles.routeDetailText}>
                          {route.totalSeats} seats
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Stop Preview */}
                  {stopCount > 0 && (
                    <View style={styles.stopPreviewRow}>
                      {(Array.isArray(route.stops) ? route.stops : [])
                        .slice(0, 4)
                        .map((stop, idx) => (
                          <View key={`${route.id}-stop-${idx}`} style={styles.stopChip}>
                            <Text style={styles.stopChipText} numberOfLines={1}>
                              {typeof stop === "object" ? stop.name : stop}
                            </Text>
                          </View>
                        ))}
                      {stopCount > 4 && (
                        <View style={[styles.stopChip, styles.stopChipMore]}>
                          <Text style={styles.stopChipMoreText}>+{stopCount - 4}</Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Action buttons */}
                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={styles.bookBtn}
                      onPress={() =>
                        navigation.navigate("BusBooking", { routeId: route.id })
                      }
                    >
                      <Ionicons name="ticket" size={14} color={COLORS.primary} />
                      <Text style={styles.bookBtnText}>Book Seat</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.liveBtn}
                      onPress={() =>
                        navigation.navigate("CollegeBusLive", { routeId: route.id })
                      }
                    >
                      <Ionicons name="radio" size={14} color={COLORS.success} />
                      <Text style={styles.liveBtnText}>Live Map</Text>
                    </TouchableOpacity>
                  </View>
                </Card>
              );
            })}
          </View>
        )}

        <View style={{ height: SPACING.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.md },
  scrollContentWide: { maxWidth: 900, alignSelf: "center", width: "100%" },

  // Quick Actions
  quickActions: { flexDirection: "row", gap: 10, marginBottom: SPACING.lg },
  quickActionsSmall: { flexDirection: "column" },
  quickActionBtn: {},
  quickActionGrad: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: 12,
  },
  quickActionInfo: { flex: 1 },
  quickActionTitle: { fontSize: 15, fontWeight: "800", color: COLORS.white },
  quickActionSub: { fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 2 },

  // Page Title
  pageTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  pageTitle: { fontSize: 20, fontWeight: "800", color: COLORS.text },
  routeCount: { fontSize: 13, fontWeight: "700", color: COLORS.textSecondary },

  // Routes Grid
  routesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  routeCard: { marginBottom: SPACING.sm },
  routeHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },
  routeLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  busIconGrad: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  routeHeaderInfo: { flex: 1, minWidth: 0 },
  routeName: { fontSize: 15, fontWeight: "800", color: COLORS.text },
  routeNameSmall: { fontSize: 14 },
  routeSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  trackRightBtn: {
    minHeight: 34,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 12,
    flexShrink: 0,
  },
  trackRightBtnText: { fontSize: 12, fontWeight: "700", color: COLORS.white },

  routeBasicTripRow: { flexDirection: "row", gap: 14, flexWrap: "wrap", marginBottom: 8 },
  routeDetail: { flexDirection: "row", alignItems: "center", gap: 6 },
  routeDetailText: { fontSize: 12, color: COLORS.textSecondary },

  // Stop Preview
  stopPreviewRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  stopChip: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  stopChipText: { fontSize: 11, color: COLORS.textSecondary, fontWeight: "600", maxWidth: 100 },
  stopChipMore: { backgroundColor: COLORS.primaryLight },
  stopChipMoreText: { fontSize: 11, color: COLORS.primary, fontWeight: "700" },

  // Card Actions
  cardActions: { flexDirection: "row", gap: 8, marginTop: 2 },
  bookBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.primary + "30",
    backgroundColor: COLORS.primary + "08",
    paddingVertical: 10,
  },
  bookBtnText: { fontSize: 13, fontWeight: "700", color: COLORS.primary },
  liveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.success + "30",
    backgroundColor: COLORS.success + "08",
    paddingVertical: 10,
  },
  liveBtnText: { fontSize: 13, fontWeight: "700", color: COLORS.success },

  // Empty State
  emptyState: { alignItems: "center", paddingVertical: 60, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  emptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 260,
  },
});
