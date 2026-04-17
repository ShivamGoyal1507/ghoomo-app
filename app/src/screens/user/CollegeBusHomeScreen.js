import React, { useEffect, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useDispatch, useSelector } from "react-redux";
import { SafeAreaView } from "react-native-safe-area-context";
import Header from "../../components/common/Header";
import Card from "../../components/common/Card";
import { COLORS, SPACING } from "../../constants";
import { fetchBusRoutes } from "../../store/slices/busRoutesSlice";

export default function CollegeBusHomeScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
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
        subtitle="Track bus routes"
        onBack={() => navigation.goBack()}
      />

      <ScrollView style={styles.scroll} contentContainerStyle={{ padding: SPACING.md }}>
        <Text style={styles.pageTitle}>All Routes</Text>

        {sortedRoutes.length === 0 ? (
          <Card style={styles.emptyState}>
            <Ionicons name="bus" size={42} color={COLORS.border} />
            <Text style={styles.emptyText}>No bus routes are available yet.</Text>
          </Card>
        ) : (
          <View style={styles.routesGrid}>
            {sortedRoutes.map((route) => (
              <Card key={route.id} elevated style={[styles.routeCard, { width: routeCardWidth }]}>
                <View style={styles.routeHeaderRow}>
                  <View style={styles.routeLeft}>
                    <LinearGradient colors={[COLORS.success, "#059669"]} style={styles.busIconGrad}>
                      <Ionicons name="bus" size={20} color={COLORS.white} />
                    </LinearGradient>
                    <View style={styles.routeHeaderInfo}>
                      <Text style={styles.routeName}>{route.name}</Text>
                      <Text style={styles.routeSub}>{route.from} to {route.to}</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.trackRightBtn}
                    onPress={() => navigation.navigate("CollegeBusLive", { routeId: route.id })}
                  >
                    <Ionicons name="navigate" size={14} color={COLORS.white} />
                    <Text style={styles.trackRightBtnText}>Track</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.routeBasicTripRow}>
                  <View style={styles.routeDetail}>
                    <Ionicons name="time" size={14} color={COLORS.primary} />
                    <Text style={styles.routeDetailText}>Departure: {route.departureTime}</Text>
                  </View>
                  <View style={styles.routeDetail}>
                    <Ionicons name="git-compare" size={14} color={COLORS.primary} />
                    <Text style={styles.routeDetailText}>{Array.isArray(route.stops) ? route.stops.length : 0} stops</Text>
                  </View>
                </View>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  pageTitle: { fontSize: 22, fontWeight: "800", color: COLORS.text, marginBottom: SPACING.md },
  routesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  routeCard: { marginBottom: SPACING.md },
  routeHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 },
  routeLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  busIconGrad: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  routeHeaderInfo: { flex: 1 },
  routeName: { fontSize: 15, fontWeight: "800", color: COLORS.text },
  routeSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  trackRightBtn: {
    minHeight: 34,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 10,
  },
  trackRightBtnText: { fontSize: 12, fontWeight: "700", color: COLORS.white },
  routeBasicTripRow: { flexDirection: "row", gap: 14, flexWrap: "wrap" },
  routeDetail: { flexDirection: "row", alignItems: "center", gap: 6 },
  routeDetailText: { fontSize: 12, color: COLORS.textSecondary },
  emptyState: { alignItems: "center", paddingVertical: 60 },
  emptyText: { fontSize: 16, color: COLORS.textSecondary, marginTop: 12, fontWeight: "600" },
});
