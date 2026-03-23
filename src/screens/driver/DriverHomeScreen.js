import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useDispatch, useSelector } from "react-redux";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { logoutUser } from "../../store/slices/authSlice";
import {
  driverUpdateRideStatus,
  fetchDriverDashboard,
  toggleDriverOnline,
  updateDriverLocation,
} from "../../store/slices/driverSlice";
import Card from "../../components/common/Card";
import Button from "../../components/common/Button";
import Badge from "../../components/common/Badge";
import OsmRouteMap from "../../components/map/OsmRouteMap";
import { COLORS, SPACING, BOOKING_STATUS } from "../../constants";
import { ensureDriverBackgroundLocation, stopDriverBackgroundLocation } from "../../services/backgroundLocation";
import { api } from "../../services/api";

export default function DriverHomeScreen({ navigation }) {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.auth.user);
  const { dashboard, loading, error } = useSelector((state) => state.driver);
  const watchSubscriptionRef = useRef(null);
  const [sharedRequest, setSharedRequest] = useState(null);

  useEffect(() => {
    if (!user?.id) return undefined;

    dispatch(fetchDriverDashboard(user.id)).catch(() => {});
    const intervalId = setInterval(() => {
      dispatch(fetchDriverDashboard(user.id)).catch(() => {});
    }, 10000);

    return () => {
      clearInterval(intervalId);
    };
  }, [dispatch, user?.id]);

  useEffect(() => {
    let mounted = true;

    const startTracking = async () => {
      if (!dashboard?.online || !user?.id) return;
      try {
        await ensureDriverBackgroundLocation();
      } catch (permissionError) {
        if (mounted) {
          Alert.alert("Location Permission Required", permissionError.message);
        }
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted" || !mounted) return;

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (mounted) {
        dispatch(
          updateDriverLocation(user.id, {
            latitude: current.coords.latitude,
            longitude: current.coords.longitude,
          })
        ).catch(() => {});
      }

      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 20,
          timeInterval: 7000,
        },
        (position) => {
          dispatch(
            updateDriverLocation(user.id, {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            })
          ).catch(() => {});
        }
      );

      if (mounted) {
        watchSubscriptionRef.current = subscription;
      } else {
        subscription.remove();
      }
    };

    startTracking();

    return () => {
      mounted = false;
      if (watchSubscriptionRef.current) {
        watchSubscriptionRef.current.remove();
        watchSubscriptionRef.current = null;
      }
    };
  }, [dashboard?.online, dispatch, user?.id]);

  const handleToggleOnline = (nextValue) => {
    if (!nextValue) {
      stopDriverBackgroundLocation().catch(() => {});
    }
    dispatch(toggleDriverOnline(user.id, nextValue)).catch((toggleError) =>
      Alert.alert("Update Failed", toggleError.message)
    );
  };

  const handleRideAction = (rideId, status, extra = {}) => {
    dispatch(driverUpdateRideStatus(user.id, rideId, status, extra)).catch((rideError) =>
      Alert.alert("Ride Update Failed", rideError.message)
    );
  };

  const handleAcceptRide = (rideId) => {
    handleRideAction(rideId, BOOKING_STATUS.ACCEPTED, {
      actor: "driver",
      driverId: user?.id,
    });
  };

  const assignedRides = dashboard?.assignedRides || [];
  const activeRide =
    dashboard?.activeRide ||
    assignedRides.find((ride) => ride.status === BOOKING_STATUS.IN_PROGRESS) ||
    assignedRides.find((ride) => ride.status === BOOKING_STATUS.ARRIVED) ||
    assignedRides.find((ride) => ride.status === BOOKING_STATUS.ACCEPTED) ||
    null;
  const completedRides = dashboard?.completedRides || [];
  const driverProfile = dashboard?.driver || user || {};
  const stats = dashboard?.stats || { todayEarnings: 0, ridesToday: 0, rating: user?.rating || 0 };
  const isOnline = Boolean(dashboard?.online ?? user?.online);

  useEffect(() => {
    if (!activeRide?.id || !activeRide?.isShare) {
      setSharedRequest(null);
      return undefined;
    }

    api.getSharedRideByRide(activeRide.id)
      .then(({ request }) => setSharedRequest(request))
      .catch(() => setSharedRequest(null));

    const intervalId = setInterval(() => {
      api.getSharedRideByRide(activeRide.id)
        .then(({ request }) => setSharedRequest(request))
        .catch(() => setSharedRequest(null));
    }, 7000);

    return () => clearInterval(intervalId);
  }, [activeRide?.id, activeRide?.isShare]);

  const handleRejectRide = (rideId) => {
    Alert.alert("Reject Ride", "This ride will be reassigned to the next nearest driver if one is available.", [
      { text: "Keep Ride", style: "cancel" },
      {
        text: "Reject",
        style: "destructive",
        onPress: () =>
          handleRideAction(rideId, BOOKING_STATUS.CANCELLED, {
            actor: "driver",
            driverId: user?.id,
            reason: "Driver rejected ride before pickup",
          }),
      },
    ]);
  };

  const handleMarkArrived = async (rideId) => {
    try {
      await dispatch(driverUpdateRideStatus(user.id, rideId, BOOKING_STATUS.ARRIVED));
      navigation.getParent()?.navigate("DriverOtp", { rideId });
    } catch (rideError) {
      Alert.alert("Ride Update Failed", rideError.message);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <LinearGradient colors={isOnline ? [COLORS.success, "#059669"] : [COLORS.grayDark, "#374151"]} style={styles.header}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.driverName}>{user?.name}</Text>
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={14} color="#F59E0B" />
                <Text style={styles.rating}>{stats.rating || driverProfile?.rating || user?.rating || 0} • {driverProfile?.vehicleType || user?.vehicleType || "driver"}</Text>
              </View>
              {dashboard?.location ? (
                <Text style={styles.locationText}>
                  {dashboard.location.latitude.toFixed(5)}, {dashboard.location.longitude.toFixed(5)}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={() => dispatch(logoutUser())} style={styles.logoutBtn}>
              <Ionicons name="log-out" size={22} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          </View>

          <View style={styles.onlineCard}>
            <View>
              <Text style={styles.onlineTitle}>{isOnline ? "You are Online" : "You are Offline"}</Text>
              <Text style={styles.onlineSub}>
                {isOnline ? "Your GPS location is being shared with assigned riders" : "Go online to receive and serve trips"}
              </Text>
            </View>
            <Switch
              value={isOnline}
              onValueChange={handleToggleOnline}
              trackColor={{ false: "#374151", true: "#10B981" }}
              thumbColor={COLORS.white}
            />
          </View>
          {error ? <Text style={styles.headerError}>{error}</Text> : null}
        </LinearGradient>

        <View style={styles.section}>
          <View style={styles.statsRow}>
            <Card elevated style={styles.statCard}>
              <Ionicons name="cash" size={22} color={COLORS.success} />
              <Text style={styles.statVal}>₹{stats.todayEarnings}</Text>
              <Text style={styles.statLabel}>Today Earnings</Text>
            </Card>
            <Card elevated style={styles.statCard}>
              <Ionicons name="car" size={22} color={COLORS.primary} />
              <Text style={styles.statVal}>{stats.ridesToday}</Text>
              <Text style={styles.statLabel}>Trips Today</Text>
            </Card>
            <Card elevated style={styles.statCard}>
              <Ionicons name="navigate" size={22} color={COLORS.info} />
              <Text style={styles.statVal}>{assignedRides.length}</Text>
              <Text style={styles.statLabel}>Assigned</Text>
            </Card>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vehicle</Text>
          <Card elevated>
            <View style={styles.vehicleRow}>
              <View style={styles.vehicleIcon}>
                <Ionicons
                  name={driverProfile?.vehicleType === "bike" ? "bicycle" : driverProfile?.vehicleType === "auto" ? "car-sport" : "car"}
                  size={26}
                  color={COLORS.primary}
                />
              </View>
              <View style={styles.vehicleInfo}>
                <Text style={styles.vehicleNo}>{driverProfile?.vehicleNo || "Vehicle unavailable"}</Text>
                <Text style={styles.vehicleType}>
                  {(driverProfile?.vehicleType || "driver").charAt(0).toUpperCase() + (driverProfile?.vehicleType || "driver").slice(1)}
                </Text>
              </View>
              <Badge status={isOnline ? "accepted" : "pending"} label={isOnline ? "Online" : "Offline"} />
            </View>
          </Card>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Assignment</Text>
          {loading && !dashboard ? (
            <Card style={styles.loadingCard}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={styles.loadingText}>Loading driver dashboard...</Text>
            </Card>
          ) : activeRide ? (
            <>
              <View style={styles.mapCard}>
                <OsmRouteMap
                  pickup={activeRide.pickup}
                  drop={activeRide.drop}
                  driver={activeRide.driver}
                  routePoints={activeRide.route?.geometry || []}
                />
              </View>
              <Card elevated style={styles.assignmentCard}>
                <View style={styles.assignmentHeader}>
                  <View>
                    <Text style={styles.assignmentTitle}>{activeRide.pickup?.name}</Text>
                    <Text style={styles.assignmentSubtitle}>{activeRide.drop?.name}</Text>
                  </View>
                  <Badge status={activeRide.status} />
                </View>
                <View style={styles.assignmentMetaRow}>
                  <Text style={styles.assignmentMeta}>Fare: ₹{activeRide.fare}</Text>
                  <Text style={styles.assignmentMeta}>{activeRide.distance} km</Text>
                  <Text style={styles.assignmentMeta}>{activeRide.durationMinutes} min</Text>
                </View>
                <View style={styles.assignmentMetaRow}>
                  <Text style={styles.assignmentMeta}>User ID: {activeRide.userId}</Text>
                </View>
                {activeRide.isShare && sharedRequest ? (
                  <View style={styles.sharedPassengersWrap}>
                    <Text style={styles.sharedPassengersTitle}>Shared Ride Participants</Text>
                    <View style={styles.sharedPassengersRow}>
                      <View style={[styles.sharedPassengerChip, styles.sharedPassengerOwner]}>
                        <Text style={styles.sharedPassengerOwnerText}>Owner</Text>
                      </View>
                      {sharedRequest.acceptedUsers.map((participant) => (
                        <View key={participant.userId} style={styles.sharedPassengerChip}>
                          <Text style={styles.sharedPassengerText}>{participant.name}</Text>
                        </View>
                      ))}
                    </View>
                    <Text style={styles.sharedPassengersMeta}>
                      {sharedRequest.acceptedCount}/{sharedRequest.requestedSeats} joined
                    </Text>
                  </View>
                ) : null}
                <View style={styles.actionRow}>
                  {activeRide.status === BOOKING_STATUS.ACCEPTED ? (
                    <View style={styles.otpStartWrap}>
                      <Button
                        title="Mark Arrived"
                        onPress={() => handleMarkArrived(activeRide.id)}
                        variant="primary"
                        style={{ flex: 1 }}
                      />
                      <Button
                        title="Reject Ride"
                        onPress={() => handleRejectRide(activeRide.id)}
                        variant="danger"
                        variant2="outline"
                        style={{ flex: 1 }}
                      />
                    </View>
                  ) : null}
                  {activeRide.status === BOOKING_STATUS.ARRIVED ? (
                    <Button
                      title="Open OTP Page"
                      onPress={() => navigation.getParent()?.navigate("DriverOtp", { rideId: activeRide.id })}
                      variant="primary"
                      style={{ flex: 1 }}
                    />
                  ) : null}
                  {activeRide.status === BOOKING_STATUS.IN_PROGRESS ? (
                    <Button
                      title="Reached"
                      onPress={() => handleRideAction(activeRide.id, BOOKING_STATUS.COMPLETED)}
                      variant="success"
                      style={{ flex: 1 }}
                    />
                  ) : null}
                </View>
              </Card>
            </>
          ) : (
            <Card style={styles.noRequests}>
              <Ionicons name="search" size={32} color={COLORS.border} />
              <Text style={styles.noRequestsText}>
                {dashboard?.online ? "No active trip. Stay online to keep your location visible." : "Go online to start live trip sharing."}
              </Text>
            </Card>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Assigned Rides</Text>
          {assignedRides.length === 0 ? (
            <Card style={styles.noRequests}>
              <Text style={styles.noRequestsText}>No assigned rides yet.</Text>
            </Card>
          ) : (
            assignedRides.map((ride) => (
              <Card key={ride.id} elevated style={styles.rideCard}>
                <View style={styles.requestHeader}>
                  <View>
                    <Text style={styles.passengerName}>{ride.pickup?.name}</Text>
                    <Text style={styles.routeText}>{ride.drop?.name}</Text>
                  </View>
                  <View style={styles.fareWrap}>
                    <Text style={styles.reqFare}>₹{ride.fare}</Text>
                    <Badge status={ride.status} />
                  </View>
                </View>
                <View style={styles.routeInfo}>
                  <Text style={styles.routeSubText}>Ride type: {ride.rideType}{ride.isShare ? " • Shared" : ""}</Text>
                  {ride.driver ? (
                    <Text style={styles.routeSubText}>Driver location: {ride.driver?.latitude?.toFixed?.(5)}, {ride.driver?.longitude?.toFixed?.(5)}</Text>
                  ) : (
                    <Text style={styles.routeSubText}>Nearby request waiting for first driver acceptance</Text>
                  )}
                </View>
                {ride.status === BOOKING_STATUS.PENDING ? (
                  <View style={styles.pendingActionRow}>
                    <Button
                      title="Accept Ride"
                      onPress={() => handleAcceptRide(ride.id)}
                      variant="success"
                      style={{ flex: 1 }}
                    />
                  </View>
                ) : null}
              </Card>
            ))
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.historyHeader}>
            <Text style={styles.sectionTitle}>Trip History</Text>
            <Text style={styles.historyMeta}>Last {completedRides.length} trips</Text>
          </View>
          {completedRides.length === 0 ? (
            <Card style={styles.noRequests}>
              <Text style={styles.noRequestsText}>No completed trips yet.</Text>
            </Card>
          ) : (
            completedRides.map((ride) => (
              <Card key={ride.id} elevated style={styles.historyCard}>
                <View style={styles.historyRow}>
                  <View>
                    <Text style={styles.historyTitle}>{ride.pickup?.name} → {ride.drop?.name}</Text>
                    <Text style={styles.historySub}>
                      {new Date(ride.updatedAt || ride.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      {" • "}
                      {ride.distance} km • {ride.durationMinutes} min
                    </Text>
                  </View>
                  <View style={styles.historyRight}>
                    <Text style={styles.historyFare}>₹{ride.fare}</Text>
                    <Badge status={ride.status} />
                  </View>
                </View>
              </Card>
            ))
          )}
        </View>

        <View style={{ height: SPACING.xxl }} />
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  header: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: SPACING.xl },
  headerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: SPACING.md },
  driverName: { fontSize: 22, fontWeight: "800", color: COLORS.white },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  rating: { fontSize: 13, color: "rgba(255,255,255,0.85)" },
  locationText: { fontSize: 12, color: "rgba(255,255,255,0.82)", marginTop: 6 },
  logoutBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  onlineCard: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 16, padding: SPACING.md, gap: 16 },
  onlineTitle: { fontSize: 16, fontWeight: "700", color: COLORS.white },
  onlineSub: { fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 2, maxWidth: 230 },
  headerError: { marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.92)", fontWeight: "600" },
  section: { paddingHorizontal: SPACING.md, marginTop: SPACING.md },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: COLORS.text, marginBottom: SPACING.sm },
  statsRow: { flexDirection: "row", gap: 10 },
  statCard: { flex: 1, alignItems: "center", paddingVertical: SPACING.md },
  statVal: { fontSize: 20, fontWeight: "900", color: COLORS.text, marginTop: 6 },
  statLabel: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2, textAlign: "center" },
  vehicleRow: { flexDirection: "row", alignItems: "center" },
  vehicleIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: COLORS.primary + "15", alignItems: "center", justifyContent: "center" },
  vehicleInfo: { flex: 1, marginLeft: 12 },
  vehicleNo: { fontSize: 16, fontWeight: "800", color: COLORS.text },
  vehicleType: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  loadingCard: { alignItems: "center", paddingVertical: SPACING.xl, gap: 10 },
  loadingText: { fontSize: 14, color: COLORS.textSecondary },
  mapCard: { height: 260, borderRadius: 20, overflow: "hidden", marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  assignmentCard: { marginBottom: SPACING.sm },
  assignmentHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  assignmentTitle: { fontSize: 15, fontWeight: "800", color: COLORS.text, maxWidth: 220 },
  assignmentSubtitle: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2, maxWidth: 220 },
  assignmentMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 8 },
  assignmentMeta: { fontSize: 12, color: COLORS.textSecondary, fontWeight: "600" },
  sharedPassengersWrap: { marginBottom: 10 },
  sharedPassengersTitle: { fontSize: 13, fontWeight: "800", color: COLORS.text, marginBottom: 8 },
  sharedPassengersRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sharedPassengerChip: { backgroundColor: COLORS.grayLight, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  sharedPassengerText: { fontSize: 12, fontWeight: "700", color: COLORS.text },
  sharedPassengerOwner: { backgroundColor: COLORS.success + "15" },
  sharedPassengerOwnerText: { fontSize: 12, fontWeight: "800", color: COLORS.success },
  sharedPassengersMeta: { marginTop: 8, fontSize: 12, fontWeight: "700", color: COLORS.primary },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  otpStartWrap: { flex: 1, gap: 10 },
  noRequests: { alignItems: "center", paddingVertical: SPACING.xl },
  noRequestsText: { fontSize: 14, color: COLORS.textSecondary, marginTop: 10, textAlign: "center" },
  rideCard: { marginBottom: SPACING.sm },
  requestHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  passengerName: { fontSize: 14, fontWeight: "700", color: COLORS.text, maxWidth: 200 },
  routeText: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4, maxWidth: 220 },
  routeInfo: { marginTop: 10, gap: 4 },
  routeSubText: { fontSize: 12, color: COLORS.textSecondary },
  pendingActionRow: { marginTop: 12 },
  fareWrap: { alignItems: "flex-end", gap: 8 },
  reqFare: { fontSize: 18, fontWeight: "900", color: COLORS.text },
  historyHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  historyMeta: { fontSize: 12, color: COLORS.textSecondary, fontWeight: "600" },
  historyCard: { marginBottom: SPACING.sm },
  historyRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  historyTitle: { fontSize: 13, fontWeight: "700", color: COLORS.text, maxWidth: 210 },
  historySub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
  historyRight: { alignItems: "flex-end", gap: 6 },
  historyFare: { fontSize: 14, fontWeight: "800", color: COLORS.text },
});
