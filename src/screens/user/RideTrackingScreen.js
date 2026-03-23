
import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useDispatch, useSelector } from "react-redux";
import { SafeAreaView } from "react-native-safe-area-context";
import { finalizeBooking, refreshActiveRide, setActiveBooking, syncRideStatus } from "../../store/slices/bookingSlice";
import { COLORS, SPACING, BOOKING_STATUS } from "../../constants";
import Card from "../../components/common/Card";
import Button from "../../components/common/Button";
import OsmRouteMap from "../../components/map/OsmRouteMap";
import { api } from "../../services/api";
import { subscribeRideRealtime } from "../../services/realtime";

const STATUS_STEPS = [
  { key: BOOKING_STATUS.PENDING, label: "Waiting For Driver", icon: "time", color: "#F59E0B" },
  { key: BOOKING_STATUS.ACCEPTED, label: "Driver Assigned", icon: "person", color: "#3B82F6" },
  { key: BOOKING_STATUS.ARRIVED, label: "Driver Arrived", icon: "pin", color: "#0EA5E9" },
  { key: BOOKING_STATUS.IN_PROGRESS, label: "Ride in Progress", icon: "navigate", color: "#10B981" },
  { key: BOOKING_STATUS.COMPLETED, label: "Completed", icon: "checkmark-circle", color: "#10B981" },
];

export default function RideTrackingScreen({ navigation }) {
  const dispatch = useDispatch();
  const booking = useSelector(s => s.booking.activeBooking);
  const lastBookingRef = useRef(null);
  const isRedirectingRef = useRef(false);
  const [sharedRequest, setSharedRequest] = useState(null);

  const goHomeFast = () => {
    if (isRedirectingRef.current) return;
    isRedirectingRef.current = true;
    navigation.reset({
      index: 0,
      routes: [{ name: "UserHome" }],
    });
  };

  useEffect(() => {
    if (booking) {
      lastBookingRef.current = booking;
      if (booking.status === BOOKING_STATUS.COMPLETED || booking.status === BOOKING_STATUS.CANCELLED) {
        goHomeFast();
      }
      return;
    }

    const lastBooking = lastBookingRef.current;
    if (!lastBooking) {
      goHomeFast();
      return;
    }

    if (lastBooking.status === BOOKING_STATUS.COMPLETED) {
      goHomeFast();
      return;
    }

    if (lastBooking.status === BOOKING_STATUS.CANCELLED) {
      goHomeFast();
    }
  }, [booking, navigation]);

  useEffect(() => {
    if (!booking?.id) return undefined;

    const refresh = () => dispatch(refreshActiveRide(booking.id)).catch(() => {});
    refresh();

    const unsubscribeRealtime = subscribeRideRealtime(booking.id, {
      onRideUpdate: (ride) => {
        if (ride.status === BOOKING_STATUS.COMPLETED || ride.status === BOOKING_STATUS.CANCELLED) {
          goHomeFast();
          dispatch(finalizeBooking(ride));
          return;
        }
        dispatch(setActiveBooking(ride));
      },
      onError: () => {
        // Fallback refresh on socket issues.
        refresh();
      },
    });

    api.getSharedRideByRide(booking.id)
      .then(({ request }) => setSharedRequest(request))
      .catch(() => setSharedRequest(null));

    const intervalId = setInterval(() => {
      api.getSharedRideByRide(booking.id)
        .then(({ request }) => setSharedRequest(request))
        .catch(() => setSharedRequest(null));
    }, 7000);

    return () => {
      unsubscribeRealtime();
      clearInterval(intervalId);
    };
  }, [booking?.id, dispatch]);

  if (!booking) return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.emptyState}>
        <Ionicons name="car-outline" size={42} color={COLORS.gray} />
        <Text style={styles.emptyTitle}>Ride status updated</Text>
        <Text style={styles.emptyText}>Redirecting to Home...</Text>
      </View>
    </SafeAreaView>
  );

  const statusIdx = STATUS_STEPS.findIndex(s => s.key === booking.status);
  const currentStep = STATUS_STEPS[statusIdx] || STATUS_STEPS[0];

  const handleCancel = () => {
    Alert.alert("Cancel Ride", "Are you sure you want to cancel?", [
      { text: "No", style: "cancel" },
      {
        text: "Yes, Cancel",
        style: "destructive",
        onPress: () => {
          dispatch(syncRideStatus(booking.id, BOOKING_STATUS.CANCELLED))
            .then(() => {
              navigation.navigate("UserHome");
            })
            .catch((error) => Alert.alert("Cancel Failed", error.message));
        },
      },
    ]);
  };

  const handleShareOtp = () => {
    Alert.alert(
      "Share OTP With Driver",
      `Tell this OTP to your driver to start the ride: ${booking.otp}`
    );
  };

  const driverPhone =
    booking?.driver?.phone ||
    booking?.driver?.phoneNumber ||
    booking?.driver?.mobile ||
    booking?.driver?.mobileNumber ||
    null;

  const handleCallDriver = () => {
    if (!driverPhone) return;
    Linking.openURL(`tel:${driverPhone}`).catch(() => {
      Alert.alert("Call Failed", "Unable to open the phone dialer on this device.");
    });
  };

  const handleSmsDriver = () => {
    if (!driverPhone) return;
    Linking.openURL(`sms:${driverPhone}`).catch(() => {
      Alert.alert("SMS Failed", "Unable to open the messaging app on this device.");
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.mapArea}>
        <OsmRouteMap
          pickup={booking.pickup}
          drop={booking.drop}
          driver={booking.driver}
          routePoints={booking.route?.geometry || []}
        />
      </View>

      <View style={styles.bottomSheet}>
        <View style={styles.statusHeader}>
          <View style={[styles.statusIcon, { backgroundColor: currentStep.color + "20" }]}>
            <Ionicons name={currentStep.icon} size={22} color={currentStep.color} />
          </View>
          <View style={styles.statusInfo}>
            <Text style={styles.statusLabel}>{currentStep.label}</Text>
            <Text style={styles.statusSub}>
              {booking.status === BOOKING_STATUS.PENDING
                ? `${booking.requestedDrivers?.length || 0} nearby drivers can accept this ride request`
                : booking.status === BOOKING_STATUS.ACCEPTED
                ? `${booking.driver?.name} will reach you in about ${booking.driver?.etaMinutes} min`
                : booking.status === BOOKING_STATUS.ARRIVED
                  ? "Your driver has reached pickup. Share OTP to start the trip"
                : booking.status === BOOKING_STATUS.IN_PROGRESS
                  ? "Trip is live and synced with the backend"
                  : "Trip completed"}
            </Text>
          </View>
          <View style={styles.otpWrap}>
            <Text style={styles.otpLabel}>OTP</Text>
            <Text style={styles.otpCode}>{booking.status === BOOKING_STATUS.PENDING ? "--" : booking.otp}</Text>
          </View>
        </View>

        <View style={styles.progressRow}>
          {STATUS_STEPS.map((step, i) => (
            <React.Fragment key={step.key}>
              <View style={[styles.progressDot, i <= statusIdx && { backgroundColor: COLORS.primary }]} />
              {i < STATUS_STEPS.length - 1 && <View style={[styles.progressLine, i < statusIdx && { backgroundColor: COLORS.primary }]} />}
            </React.Fragment>
          ))}
        </View>

        {booking.driver && booking.status !== BOOKING_STATUS.PENDING && (
          <Card style={styles.driverCard}>
            <View style={styles.driverRow}>
              <View style={styles.driverAvatar}>
                <Text style={styles.driverAvatarText}>{booking.driver.name[0]}</Text>
              </View>
              <View style={styles.driverInfo}>
                <Text style={styles.driverName}>{booking.driver.name}</Text>
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={14} color="#F59E0B" />
                  <Text style={styles.ratingText}>{booking.driver.rating} • {booking.driver.vehicleType} • {booking.driver.distanceKm} km away</Text>
                </View>
                <Text style={styles.vehicleNo}>{booking.driver.vehicleNo}</Text>
              </View>
              {driverPhone ? (
                <View style={styles.driverActions}>
                  <TouchableOpacity style={styles.callBtn} onPress={handleCallDriver}>
                    <Ionicons name="call" size={20} color={COLORS.success} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.msgBtn} onPress={handleSmsDriver}>
                    <Ionicons name="chatbubble" size={20} color={COLORS.primary} />
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          </Card>
        )}

        <Card style={styles.tripCard}>
          <View style={styles.tripRow}>
            <View style={styles.tripLoc}>
              <Ionicons name="ellipse" size={10} color={COLORS.success} />
              <Text style={styles.tripLocText} numberOfLines={1}>{booking.pickup?.name}</Text>
            </View>
            <View style={styles.tripLoc}>
              <Ionicons name="location" size={12} color={COLORS.error} />
              <Text style={styles.tripLocText} numberOfLines={1}>{booking.drop?.name}</Text>
            </View>
          </View>
          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>Estimated Fare</Text>
            <Text style={styles.fareVal}>₹{booking.fare}</Text>
          </View>
          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>Payment</Text>
            <Text style={styles.tripMeta}>{String(booking.paymentMethod || "cash").toUpperCase()}</Text>
          </View>
          {booking.scheduledAt ? (
            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Scheduled</Text>
              <Text style={styles.tripMeta}>
                {new Date(booking.scheduledAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
              </Text>
            </View>
          ) : null}
          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>Distance / ETA</Text>
            <Text style={styles.tripMeta}>{booking.distance} km • {booking.durationMinutes} min</Text>
          </View>
        </Card>

        {booking.isShare && sharedRequest ? (
          <Card style={styles.participantsCard}>
            <View style={styles.participantsHeader}>
              <Ionicons name="people" size={18} color={COLORS.success} />
              <Text style={styles.participantsTitle}>Shared Ride Participants</Text>
            </View>
            <View style={styles.chipsRow}>
              <View style={[styles.participantChip, styles.ownerChip]}>
                <Text style={styles.ownerChipText}>You</Text>
              </View>
              {sharedRequest.acceptedUsers.map((participant) => (
                <View key={participant.userId} style={styles.participantChip}>
                  <Text style={styles.participantChipText}>{participant.name}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.participantsMeta}>
              {sharedRequest.acceptedCount}/{sharedRequest.requestedSeats} joined
            </Text>
          </Card>
        ) : null}

        <View style={styles.actionsRow}>
          {(booking.status === BOOKING_STATUS.ACCEPTED || booking.status === BOOKING_STATUS.ARRIVED) ? <Button title="Share OTP" onPress={handleShareOtp} variant="success" style={{ flex: 1 }} /> : null}
          {(booking.status === BOOKING_STATUS.PENDING || booking.status === BOOKING_STATUS.ACCEPTED || booking.status === BOOKING_STATUS.ARRIVED) ? (
            <Button title="Cancel Ride" onPress={handleCancel} variant="danger" variant2="outline" style={{ flex: 1 }} />
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: SPACING.lg },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, textAlign: "center" },
  mapArea: { flex: 1 },
  bottomSheet: { backgroundColor: COLORS.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.md, shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 10 },
  statusHeader: { flexDirection: "row", alignItems: "center", marginBottom: SPACING.md },
  statusIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  statusInfo: { flex: 1, marginLeft: 12 },
  statusLabel: { fontSize: 16, fontWeight: "800", color: COLORS.text },
  statusSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  otpWrap: { alignItems: "center", backgroundColor: COLORS.primary + "15", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  otpLabel: { fontSize: 10, color: COLORS.primary, fontWeight: "600" },
  otpCode: { fontSize: 20, fontWeight: "900", color: COLORS.primary },
  progressRow: { flexDirection: "row", alignItems: "center", marginBottom: SPACING.md },
  progressDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.border },
  progressLine: { flex: 1, height: 3, backgroundColor: COLORS.border, marginHorizontal: 2 },
  driverCard: { marginBottom: SPACING.sm },
  driverRow: { flexDirection: "row", alignItems: "center" },
  driverAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  driverAvatarText: { fontSize: 18, fontWeight: "800", color: COLORS.white },
  driverInfo: { flex: 1, marginLeft: 12 },
  driverName: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  ratingText: { fontSize: 12, color: COLORS.textSecondary },
  vehicleNo: { fontSize: 12, color: COLORS.primary, fontWeight: "600", marginTop: 2 },
  driverActions: { flexDirection: "row", gap: 10 },
  callBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.success + "15", alignItems: "center", justifyContent: "center" },
  msgBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.primary + "15", alignItems: "center", justifyContent: "center" },
  tripCard: { marginBottom: SPACING.sm },
  participantsCard: { marginBottom: SPACING.sm },
  participantsHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  participantsTitle: { fontSize: 14, fontWeight: "800", color: COLORS.text },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  participantChip: { backgroundColor: COLORS.grayLight, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  participantChipText: { fontSize: 12, fontWeight: "700", color: COLORS.text },
  ownerChip: { backgroundColor: COLORS.success + "15" },
  ownerChipText: { fontSize: 12, fontWeight: "800", color: COLORS.success },
  participantsMeta: { marginTop: 10, fontSize: 12, fontWeight: "700", color: COLORS.primary },
  tripRow: { marginBottom: 8 },
  tripLoc: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  tripLocText: { fontSize: 13, color: COLORS.text, flex: 1 },
  fareRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  fareLabel: { fontSize: 13, color: COLORS.textSecondary },
  fareVal: { fontSize: 18, fontWeight: "900", color: COLORS.primary },
  tripMeta: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  actionsRow: { flexDirection: "row", gap: 10 },
});
