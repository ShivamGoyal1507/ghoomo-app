import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useDispatch, useSelector } from "react-redux";
import { SafeAreaView } from "react-native-safe-area-context";
import { logoutUser } from "../../store/slices/authSlice";
import { fetchAdminDashboard } from "../../store/slices/adminSlice";
import { fetchBusRoutes } from "../../store/slices/busRoutesSlice";
import { fetchBusBookings, setBusBookings } from "../../store/slices/bookingSlice";
import Card from "../../components/common/Card";
import Badge from "../../components/common/Badge";
import { BOOKING_STATUS, COLORS, SPACING } from "../../constants";
import { subscribeBusRealtime } from "../../services/realtime";

const { width } = Dimensions.get("window");

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function normalizeSessionBusBooking(booking, routesById) {
  const route = routesById[booking.routeId] || {};
  return {
    id: booking.id,
    type: "bus",
    label: route.name || booking.routeId,
    detail: booking.isWaiting
      ? `Waitlist #${booking.waitlistPosition || "-"}`
      : `Seat ${booking.seatNumber || "-"} • ${route.from || ""} to ${route.to || ""}`,
    status: booking.status,
    createdAt: booking.createdAt,
    userName: booking.userName || "Passenger",
  };
}

function normalizeSessionRide(booking) {
  return {
    id: booking.id,
    type: booking.rideType || booking.type || "ride",
    label: `${booking.pickup?.name || booking.pickup || "Pickup"} to ${booking.drop?.name || booking.drop || "Drop"}`,
    detail: `${Number(booking.distance || booking.route?.distanceKm || 0).toFixed(1)} km • ${booking.durationMinutes || booking.route?.durationMinutes || 0} min`,
    fare: Number(booking.fare || 0),
    status: booking.status,
    createdAt: booking.createdAt,
    userName: booking.userName || null,
  };
}

function buildMergedRoutes(baseRoutes, sessionBookings) {
  return baseRoutes.map((route) => {
    const routeBookings = sessionBookings.filter(
      (booking) => booking.routeId === route.id && booking.status !== BOOKING_STATUS.CANCELLED
    );
    const bookedSeats = routeBookings.filter((booking) => !booking.isWaiting).length;
    const waitingCount = routeBookings.filter((booking) => booking.isWaiting).length;
    return {
      ...route,
      bookedSeats,
      waitingCount,
      availableSeats: Math.max(route.totalSeats - bookedSeats, 0),
      loadFactor: route.totalSeats ? bookedSeats / route.totalSeats : 0,
    };
  });
}

function buildLocalDashboard({ bookingHistory, busBookings, authUser, routesById, routeCatalog }) {
  const normalizedBookings = bookingHistory.map((booking) => {
    if (booking.type === "bus" || booking.routeId) {
      return normalizeSessionBusBooking(booking, routesById);
    }
    return normalizeSessionRide(booking);
  });
  const confirmedBusBookings = busBookings.filter(
    (booking) => !booking.isWaiting && booking.status !== BOOKING_STATUS.CANCELLED
  );
  const waitingList = busBookings.filter(
    (booking) => booking.isWaiting && booking.status !== BOOKING_STATUS.CANCELLED
  );
  const rideRevenue = bookingHistory
    .filter((booking) => booking.type !== "bus" && !booking.routeId)
    .reduce((sum, booking) => sum + Number(booking.fare || 0), 0);

  return {
    stats: {
      totalUsers: 0,
      totalDrivers: 0,
      totalAdmins: authUser?.role === "admin" ? 1 : 0,
      totalRides: bookingHistory.filter((booking) => booking.type !== "bus" && !booking.routeId).length,
      completedRides: bookingHistory.filter((booking) => booking.status === BOOKING_STATUS.COMPLETED).length,
      activeDrivers: 0,
      driversOnTrip: 0,
      totalRevenue: rideRevenue,
      busBookings: confirmedBusBookings.length,
      waitingList: waitingList.length,
    },
    users: [],
    drivers: [],
    admins: authUser?.role === "admin" ? [authUser] : [],
    recentBookings: normalizedBookings,
    routes: buildMergedRoutes(routeCatalog, busBookings),
  };
}

export default function AdminDashboardScreen({ navigation }) {
  const dispatch = useDispatch();
  const authUser = useSelector((state) => state.auth.user);
  const { dashboard, loading, error } = useSelector((state) => state.admin);
  const { routes: liveRoutes } = useSelector((state) => state.busRoutes);
  const bookingHistory = useSelector((state) => state.booking.bookingHistory);
  const busBookings = useSelector((state) => state.booking.busBookings);
  const [activeTab, setActiveTab] = useState("overview");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    dispatch(fetchAdminDashboard()).catch(() => {});
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

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await dispatch(fetchAdminDashboard());
      await dispatch(fetchBusRoutes());
    } catch (refreshError) {
      // The screen already renders the admin slice error state.
    } finally {
      setRefreshing(false);
    }
  };

  const routeCatalog = useMemo(
    () => (liveRoutes.length ? liveRoutes : dashboard?.routes?.length ? dashboard.routes : []),
    [dashboard?.routes, liveRoutes]
  );
  const routesById = useMemo(
    () =>
      routeCatalog.reduce((acc, route) => {
        acc[route.id] = route;
        return acc;
      }, {}),
    [routeCatalog]
  );
  const fallbackDashboard = useMemo(
    () =>
      buildLocalDashboard({
        bookingHistory,
        busBookings,
        authUser,
        routesById,
        routeCatalog,
      }),
    [authUser, bookingHistory, busBookings, routeCatalog, routesById]
  );
  const effectiveDashboard = dashboard || fallbackDashboard;
  const mergedRecentBookings = useMemo(
    () =>
      [...(effectiveDashboard.recentBookings || []), ...bookingHistory.map((booking) => {
        if (booking.type === "bus" || booking.routeId) {
          return normalizeSessionBusBooking(booking, routesById);
        }
        return normalizeSessionRide(booking);
      })]
        .reduce((acc, booking) => {
          if (!acc.some((entry) => entry.id === booking.id)) acc.push(booking);
          return acc;
        }, [])
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .slice(0, 8),
    [bookingHistory, effectiveDashboard.recentBookings, routesById]
  );
  const mergedRoutes = useMemo(
    () => (dashboard ? buildMergedRoutes(routeCatalog, busBookings) : effectiveDashboard.routes),
    [busBookings, dashboard, effectiveDashboard.routes, routeCatalog]
  );
  const sessionConfirmedBusBookings = useMemo(
    () => busBookings.filter((booking) => !booking.isWaiting && booking.status !== BOOKING_STATUS.CANCELLED),
    [busBookings]
  );
  const sessionWaitingList = useMemo(
    () => busBookings.filter((booking) => booking.isWaiting && booking.status !== BOOKING_STATUS.CANCELLED),
    [busBookings]
  );
  const stats = useMemo(
    () => ({
      totalRides: effectiveDashboard?.stats?.totalRides || 0,
      activeDrivers: effectiveDashboard?.stats?.activeDrivers || 0,
      driversOnTrip: effectiveDashboard?.stats?.driversOnTrip || 0,
      totalRevenue: Number(effectiveDashboard?.stats?.totalRevenue || 0),
      busBookings: Math.max(effectiveDashboard?.stats?.busBookings || 0, sessionConfirmedBusBookings.length),
      waitingList: Math.max(effectiveDashboard?.stats?.waitingList || 0, sessionWaitingList.length),
      totalUsers: effectiveDashboard?.stats?.totalUsers || 0,
    }),
    [effectiveDashboard?.stats, sessionConfirmedBusBookings.length, sessionWaitingList.length]
  );
  const statCards = useMemo(() => [
    {
      label: "Total Rides",
      value: String(stats.totalRides),
      icon: "car",
      color: COLORS.primary,
      sub: `${stats.driversOnTrip} drivers on trip`,
    },
    {
      label: "Active Drivers",
      value: String(stats.activeDrivers),
      icon: "people",
      color: COLORS.success,
      sub: `${effectiveDashboard?.drivers?.length || 0} registered`,
    },
    {
      label: "Revenue",
      value: formatCurrency(stats.totalRevenue),
      icon: "cash",
      color: COLORS.accentOrange,
      sub: "Completed rides + bus bookings",
    },
    {
      label: "Bus Bookings",
      value: String(stats.busBookings),
      icon: "bus",
      color: "#0F766E",
      sub: `${stats.waitingList} on waitlist`,
    },
  ], [effectiveDashboard?.drivers?.length, stats]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <LinearGradient colors={["#1A1A2E", "#16213E"]} style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.headerCopy}>
              <Text style={styles.adminLabel}>Admin Panel</Text>
              <Text style={styles.platformName}>Ghoomo Dashboard</Text>
              <Text style={styles.platformMeta}>
                {authUser?.name || "Administrator"} • {stats.totalUsers} users • {effectiveDashboard?.drivers?.length || 0} drivers
              </Text>
              {!dashboard && error ? (
                <Text style={styles.fallbackMeta}>Showing current-session data. Restart backend for full admin sync.</Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={() => dispatch(logoutUser())} style={styles.logoutBtn}>
              <Ionicons name="log-out" size={20} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        <View style={styles.statsGrid}>
          {statCards.map((card) => (
            <LinearGradient key={card.label} colors={[card.color, `${card.color}CC`]} style={styles.statCard}>
              <View style={styles.statIconWrap}>
                <Ionicons name={card.icon} size={22} color="rgba(255,255,255,0.85)" />
              </View>
              <Text style={styles.statVal}>{card.value}</Text>
              <Text style={styles.statLabel}>{card.label}</Text>
              <Text style={styles.statSub}>{card.sub}</Text>
            </LinearGradient>
          ))}
        </View>

        <View style={styles.tabNav}>
          {["overview", "drivers", "users", "routes"].map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.content}>
          {loading && !dashboard ? (
            <Card style={styles.stateCard}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={styles.stateText}>Loading admin dashboard...</Text>
            </Card>
          ) : null}

          {error ? (
            <Card style={styles.errorCard}>
              <Text style={styles.errorTitle}>Dashboard sync failed</Text>
              <Text style={styles.errorText}>
                {dashboard ? error : `${error}. Showing current-session data until the backend is restarted.`}
              </Text>
            </Card>
          ) : null}

          {activeTab === "overview" ? (
            <>
              <Text style={styles.sectionTitle}>Recent Activity</Text>
              {mergedRecentBookings.length === 0 ? (
                <Card style={styles.stateCard}>
                  <Text style={styles.stateText}>No ride or bus bookings yet.</Text>
                </Card>
              ) : (
                mergedRecentBookings.map((booking) => (
                  <Card key={booking.id} style={styles.bookingRow}>
                    <View style={styles.bookingInfo}>
                      <Text style={styles.bookingType}>{String(booking.type || "ride").toUpperCase()}</Text>
                      <Text style={styles.bookingDetail}>{booking.label}</Text>
                      <Text style={styles.bookingMeta}>
                        {booking.detail}
                        {booking.userName ? ` • ${booking.userName}` : ""}
                      </Text>
                    </View>
                    <View style={styles.bookingRight}>
                      {booking.type === "bus" ? null : (
                        <Text style={styles.bookingFare}>{formatCurrency(booking.fare)}</Text>
                      )}
                      <Badge status={booking.status} />
                    </View>
                  </Card>
                ))
              )}

              <Text style={styles.sectionTitle}>Operations Snapshot</Text>
              <Card elevated style={styles.snapshotCard}>
                <View style={styles.snapshotRow}>
                  <Text style={styles.snapshotLabel}>Completed rides</Text>
                  <Text style={styles.snapshotValue}>{effectiveDashboard?.stats?.completedRides || 0}</Text>
                </View>
                <View style={styles.snapshotRow}>
                  <Text style={styles.snapshotLabel}>Drivers on trip</Text>
                  <Text style={styles.snapshotValue}>{stats.driversOnTrip}</Text>
                </View>
                <View style={styles.snapshotRow}>
                  <Text style={styles.snapshotLabel}>Waitlisted students</Text>
                  <Text style={styles.snapshotValue}>{stats.waitingList}</Text>
                </View>
                <View style={styles.snapshotRow}>
                  <Text style={styles.snapshotLabel}>Admin accounts</Text>
                  <Text style={styles.snapshotValue}>{effectiveDashboard?.admins?.length || 0}</Text>
                </View>
              </Card>
            </>
          ) : null}

          {activeTab === "drivers" ? (
            <>
              <Text style={styles.sectionTitle}>Drivers ({effectiveDashboard?.drivers?.length || 0})</Text>
              {(effectiveDashboard?.drivers || []).map((driver) => (
                <Card key={driver.id} elevated style={styles.personCard}>
                  <View style={styles.personRow}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{driver.name?.[0] || "D"}</Text>
                    </View>
                    <View style={styles.personInfo}>
                      <Text style={styles.personName}>{driver.name}</Text>
                      <Text style={styles.personMeta}>
                        {(driver.vehicleType || "driver").toUpperCase()} • {driver.vehicleNo || driver.busRoute || "Unassigned"}
                      </Text>
                      <Text style={styles.personSub}>{driver.email}</Text>
                    </View>
                    <View style={styles.personRight}>
                      <View style={styles.ratingRow}>
                        <Ionicons name="star" size={12} color="#F59E0B" />
                        <Text style={styles.ratingText}>{Number(driver.rating || 0).toFixed(1)}</Text>
                      </View>
                      <Badge status={driver.online ? "completed" : "pending"} label={driver.online ? "Online" : "Offline"} />
                    </View>
                  </View>
                </Card>
              ))}
            </>
          ) : null}

          {activeTab === "users" ? (
            <>
              <Text style={styles.sectionTitle}>Users ({effectiveDashboard?.users?.length || 0})</Text>
              {(effectiveDashboard?.users || []).map((user) => (
                <Card key={user.id} elevated style={styles.personCard}>
                  <View style={styles.personRow}>
                    <View style={[styles.avatar, styles.userAvatar]}>
                      <Text style={styles.avatarText}>{user.name?.[0] || "U"}</Text>
                    </View>
                    <View style={styles.personInfo}>
                      <Text style={styles.personName}>{user.name}</Text>
                      <Text style={styles.personSub}>{user.email}</Text>
                      <Text style={styles.personMeta}>Phone • {user.phone || "Not provided"}</Text>
                    </View>
                    <Badge status="completed" label="Active" />
                  </View>
                </Card>
              ))}
            </>
          ) : null}

          {activeTab === "routes" ? (
            <>
              <View style={styles.routesHeader}>
                <Text style={[styles.sectionTitle, styles.routesTitle]}>Bus Routes</Text>
                <TouchableOpacity
                  style={styles.addRouteTopBtn}
                  onPress={() => navigation.navigate("AdminAddRoute")}
                >
                  <Ionicons name="add" size={22} color={COLORS.white} />
                </TouchableOpacity>
              </View>
              {mergedRoutes.map((route) => (
                <Card key={route.id} elevated style={styles.routeCard}>
                  <View style={styles.routeHeader}>
                    <Text style={styles.routeName}>{route.name}</Text>
                    <Badge
                      status={route.availableSeats > 0 ? "completed" : "waiting"}
                      label={`${route.availableSeats} seats left`}
                    />
                  </View>
                  <View style={styles.routeDetails}>
                    <View style={styles.routeDetail}>
                      <Ionicons name="location" size={14} color={COLORS.success} />
                      <Text style={styles.routeDetailText}>{route.from}</Text>
                    </View>
                    <View style={styles.routeDetail}>
                      <Ionicons name="flag" size={14} color={COLORS.error} />
                      <Text style={styles.routeDetailText}>{route.to}</Text>
                    </View>
                    <View style={styles.routeDetail}>
                      <Ionicons name="time" size={14} color={COLORS.primary} />
                      <Text style={styles.routeDetailText}>
                        {route.departureTime} / {route.returnTime}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.routeStats}>
                    <Text style={styles.routeStat}>Booked: {route.bookedSeats}</Text>
                    <Text style={styles.routeStat}>Available: {route.availableSeats}</Text>
                    <Text style={styles.routeStat}>Waitlist: {route.waitingCount}</Text>
                  </View>
                  <View style={styles.capacityBar}>
                    <View style={[styles.capacityFill, { width: `${Math.round((route.loadFactor || 0) * 100)}%` }]} />
                  </View>
                  <Text style={styles.stopsTitle}>Stops</Text>
                  <View style={styles.stopsRow}>
                    {route.stops.map((stop, index) => (
                      <Text key={`${stop}-${index}`} style={styles.stop}>
                        {stop}
                      </Text>
                    ))}
                  </View>
                </Card>
              ))}
            </>
          ) : null}
        </View>

        <View style={styles.footerSpace} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: SPACING.xl },
  headerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headerCopy: { flex: 1, paddingRight: SPACING.md },
  adminLabel: { fontSize: 13, color: "rgba(255,255,255,0.6)", letterSpacing: 2, textTransform: "uppercase" },
  platformName: { fontSize: 24, fontWeight: "900", color: COLORS.white, marginTop: 4 },
  platformMeta: { fontSize: 12, color: "rgba(255,255,255,0.72)", marginTop: 6, fontWeight: "600" },
  fallbackMeta: { fontSize: 11, color: "#FDE68A", marginTop: 6, fontWeight: "700" },
  logoutBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, padding: SPACING.md },
  statCard: { width: (width - SPACING.md * 2 - 10) / 2, borderRadius: 16, padding: SPACING.md },
  statIconWrap: { marginBottom: 8 },
  statVal: { fontSize: 24, fontWeight: "900", color: COLORS.white },
  statLabel: { fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 2, fontWeight: "600" },
  statSub: { fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 4 },
  tabNav: {
    flexDirection: "row",
    marginHorizontal: SPACING.md,
    backgroundColor: COLORS.grayLight,
    borderRadius: 14,
    padding: 4,
    marginBottom: SPACING.sm,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 10 },
  tabActive: {
    backgroundColor: COLORS.white,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  tabText: { fontSize: 13, fontWeight: "600", color: COLORS.textSecondary },
  tabTextActive: { color: COLORS.primary, fontWeight: "700" },
  content: { paddingHorizontal: SPACING.md },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: COLORS.text, marginBottom: SPACING.sm, marginTop: SPACING.sm },
  routesHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: SPACING.sm, marginBottom: SPACING.sm },
  routesTitle: { marginTop: 0, marginBottom: 0 },
  addRouteTopBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  stateCard: { alignItems: "center", paddingVertical: SPACING.lg, gap: SPACING.sm },
  stateText: { fontSize: 14, color: COLORS.textSecondary, textAlign: "center" },
  errorCard: { marginBottom: SPACING.sm, backgroundColor: "#FFF7ED", borderColor: "#FDBA74" },
  errorTitle: { fontSize: 14, fontWeight: "800", color: "#9A3412", marginBottom: 4 },
  errorText: { fontSize: 13, color: "#C2410C" },
  bookingRow: { flexDirection: "row", alignItems: "center", marginBottom: SPACING.sm },
  bookingInfo: { flex: 1, paddingRight: SPACING.sm },
  bookingType: { fontSize: 12, fontWeight: "800", color: COLORS.primary, letterSpacing: 1 },
  bookingDetail: { fontSize: 13, color: COLORS.text, marginTop: 2, fontWeight: "700" },
  bookingMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 3 },
  bookingRight: { alignItems: "flex-end", gap: 4 },
  bookingFare: { fontSize: 16, fontWeight: "900", color: COLORS.text },
  snapshotCard: { marginBottom: SPACING.sm },
  snapshotRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  snapshotLabel: { fontSize: 13, color: COLORS.textSecondary, fontWeight: "600" },
  snapshotValue: { fontSize: 15, color: COLORS.text, fontWeight: "800" },
  personCard: { marginBottom: SPACING.sm },
  personRow: { flexDirection: "row", alignItems: "center" },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  userAvatar: { backgroundColor: COLORS.secondary },
  avatarText: { fontSize: 18, fontWeight: "800", color: COLORS.white },
  personInfo: { flex: 1, marginLeft: 12 },
  personName: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  personMeta: { fontSize: 12, color: COLORS.primary, marginTop: 2, fontWeight: "600" },
  personSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  personRight: { alignItems: "flex-end", gap: 4 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  ratingText: { fontSize: 13, fontWeight: "700", color: COLORS.text },
  routeCard: { marginBottom: SPACING.sm },
  routeHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12 },
  routeName: { flex: 1, fontSize: 15, fontWeight: "800", color: COLORS.text },
  routeDetails: { gap: 6, marginBottom: 10 },
  routeDetail: { flexDirection: "row", alignItems: "center", gap: 8 },
  routeDetailText: { fontSize: 13, color: COLORS.textSecondary },
  routeStats: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 10 },
  routeStat: { fontSize: 12, color: COLORS.textSecondary, fontWeight: "700" },
  capacityBar: { height: 6, backgroundColor: COLORS.border, borderRadius: 3, marginBottom: 10 },
  capacityFill: { height: 6, borderRadius: 3, backgroundColor: COLORS.success },
  stopsTitle: { fontSize: 12, fontWeight: "700", color: COLORS.text, marginBottom: 6 },
  stopsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  stop: { fontSize: 11, color: COLORS.text, fontWeight: "600", backgroundColor: COLORS.grayLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  footerSpace: { height: 40 },
});
