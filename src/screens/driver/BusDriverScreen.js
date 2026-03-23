
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useDispatch, useSelector } from "react-redux";
import { SafeAreaView } from "react-native-safe-area-context";
import { logoutUser } from "../../store/slices/authSlice";
import { fetchBusRoutes } from "../../store/slices/busRoutesSlice";
import { fetchBusBookings, setBusBookings } from "../../store/slices/bookingSlice";
import { COLORS, SPACING } from "../../constants";
import { getBookingWindow } from "../../utils/bus";
import { subscribeBusRealtime } from "../../services/realtime";

export default function BusDriverScreen({ navigation }) {
  const dispatch = useDispatch();
  const user = useSelector(s => s.auth.user);
  const busBookings = useSelector(s => s.booking.busBookings);
  const liveRoutes = useSelector((state) => state.busRoutes.routes);
  const routes = liveRoutes;
  const [selectedRouteId, setSelectedRouteId] = useState(user?.busRoute || routes[0]?.id);

  useEffect(() => {
    dispatch(fetchBusRoutes()).catch(() => {});
    dispatch(fetchBusBookings()).catch(() => {});
  }, [dispatch]);

  useEffect(() => {
    const unsubscribe = subscribeBusRealtime({
      onBusUpdate: ({ busBookings }) => {
        dispatch(setBusBookings(busBookings || []));
      },
      onError: () => {
        dispatch(fetchBusBookings()).catch(() => {});
      },
    });
    return () => unsubscribe();
  }, [dispatch]);

  useEffect(() => {
    if (!routes.some((route) => route.id === selectedRouteId)) {
      setSelectedRouteId(user?.busRoute || routes[0]?.id);
    }
  }, [routes, selectedRouteId, user?.busRoute]);

  const sortedRoutes = useMemo(() => {
    return [...routes].sort((a, b) => {
      const aw = getBookingWindow(a, new Date());
      const bw = getBookingWindow(b, new Date());
      return aw.departure.getTime() - bw.departure.getTime();
    });
  }, [routes]);

  const selectedRoute = sortedRoutes.find(r => r.id === selectedRouteId) || sortedRoutes[0];
  if (!selectedRoute) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>No bus routes available</Text>
          <Text style={styles.emptySub}>Ask an admin to add routes before scanning tickets.</Text>
        </View>
      </SafeAreaView>
    );
  }
  const routeBookings = busBookings.filter(b => b.routeId === selectedRoute.id && b.status !== "cancelled");
  const verifiedCount = routeBookings.filter(b => b.verified).length;

  const todayPassengers = routeBookings.length;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <LinearGradient colors={[COLORS.success, "#059669"]} style={styles.header}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.busDriverName}>{user?.name}</Text>
              <Text style={styles.routeLabel}>{selectedRoute.name}</Text>
            </View>
            <TouchableOpacity onPress={() => dispatch(logoutUser())} style={styles.logoutBtn}>
              <Ionicons name="log-out" size={22} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.stat}><Text style={styles.statVal}>{todayPassengers}</Text><Text style={styles.statLabel}>Passengers</Text></View>
            <View style={styles.statDivider} />
            <View style={styles.stat}><Text style={styles.statVal}>{verifiedCount}</Text><Text style={styles.statLabel}>Verified</Text></View>
            <View style={styles.statDivider} />
            <View style={styles.stat}><Text style={styles.statVal}>{selectedRoute.totalSeats - routeBookings.length}</Text><Text style={styles.statLabel}>Empty Seats</Text></View>
          </View>
        </LinearGradient>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Choose Route</Text>
          <View style={styles.routePickerList}>
            {sortedRoutes.map(route => (
              <TouchableOpacity
                key={route.id}
                style={[styles.routePickerCard, selectedRouteId === route.id && styles.routePickerCardActive]}
                onPress={() => {
                  setSelectedRouteId(route.id);
                  navigation.navigate("BusDriverRoute", { routeId: route.id });
                }}
              >
                <Text style={styles.routePickerTitle}>{route.name}</Text>
                <Text style={styles.routePickerText}>{route.from} to {route.to}</Text>
                <Text style={styles.routePickerMeta}>{route.departureTime}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ height: SPACING.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: SPACING.xl },
  headerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: SPACING.md },
  busDriverName: { fontSize: 22, fontWeight: "800", color: COLORS.white },
  routeLabel: { fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 4 },
  logoutBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  statsRow: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 16, paddingVertical: 14, paddingHorizontal: 20 },
  stat: { flex: 1, alignItems: "center" },
  statVal: { fontSize: 18, fontWeight: "900", color: COLORS.white },
  statLabel: { fontSize: 11, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  statDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.3)" },
  section: { paddingHorizontal: SPACING.md, marginTop: SPACING.md },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: COLORS.text, marginBottom: SPACING.sm },
  emptySub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 6 },
  routePickerList: { gap: 10 },
  routePickerCard: { borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.white, padding: 14 },
  routePickerCardActive: { borderColor: COLORS.success, backgroundColor: "#ECFDF5" },
  routePickerTitle: { fontSize: 14, fontWeight: "800", color: COLORS.text },
  routePickerText: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
  routePickerMeta: { fontSize: 12, color: COLORS.success, fontWeight: "700", marginTop: 6 },
  emptyCard: { alignItems: "center", paddingVertical: SPACING.xl },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, marginTop: 10 },
});
