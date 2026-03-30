
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useDispatch, useSelector } from "react-redux";
import { SafeAreaView } from "react-native-safe-area-context";
import { logoutUser } from "../../store/slices/authSlice";
import { fetchBusRoutes } from "../../store/slices/busRoutesSlice";
import { verifyBusTicket } from "../../store/slices/bookingSlice";
import Card from "../../components/common/Card";
import Badge from "../../components/common/Badge";
import { COLORS, SPACING, BUS_ROUTES } from "../../constants";
import { sendLocalNotification } from "../../services/notifications";

export default function BusDriverScreen({ navigation }) {
  const dispatch = useDispatch();
  const user = useSelector(s => s.auth.user);
  const busBookings = useSelector(s => s.booking.busBookings);
  const liveRoutes = useSelector((state) => state.busRoutes.routes);
  const routes = liveRoutes.length ? liveRoutes : BUS_ROUTES;
  const [selectedRouteId, setSelectedRouteId] = useState(user?.busRoute || routes[0]?.id);
  const [scanResult, setScanResult] = useState(null);
  const [manualInput, setManualInput] = useState("");

  useEffect(() => {
    dispatch(fetchBusRoutes()).catch(() => {});
  }, [dispatch]);

  useEffect(() => {
    if (!routes.some((route) => route.id === selectedRouteId)) {
      setSelectedRouteId(user?.busRoute || routes[0]?.id);
    }
  }, [routes, selectedRouteId, user?.busRoute]);

  const selectedRoute = routes.find(r => r.id === selectedRouteId) || routes[0];
  if (!selectedRoute) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>No bus routes available</Text>
        </View>
      </SafeAreaView>
    );
  }
  const routeBookings = busBookings.filter(b => b.routeId === selectedRoute.id && b.status !== "cancelled");
  const verifiedCount = routeBookings.filter(b => b.verified).length;

  const verifyQR = (qrString) => {
    try {
      const data = typeof qrString === "string" ? JSON.parse(qrString) : qrString;
      if (data.busId !== selectedRoute.id) {
        setScanResult({ valid: false, message: `This QR belongs to another route. Select ${data.busId} to verify it.` });
        return;
      }

      const booking = busBookings.find(
        b =>
          b.routeId === data.busId &&
          b.userId === data.userId &&
          b.seatNumber === data.seatNo &&
          b.id === data.bookingId &&
          b.status !== "cancelled"
      );
      if (booking) {
        if (booking.isWaiting) {
          setScanResult({ valid: false, message: "This passenger is still on the waiting list and cannot board yet." });
          return;
        }
        if (booking.verified) {
          setScanResult({ valid: false, message: "Ticket already verified for boarding." });
          return;
        }

        dispatch(verifyBusTicket({ bookingId: booking.id, verifiedBy: user?.id || "bus_driver" }));
        sendLocalNotification({
          key: `ticket-verified-${booking.id}`,
          title: "Ticket verified",
          body: `${booking.userName} is cleared to board ${selectedRoute.name}.`,
          data: { bookingId: booking.id, routeId: selectedRoute.id, type: "bus-driver" },
        }).catch(() => {});
        setScanResult({
          valid: true,
          booking: { ...booking, verified: true, verifiedBy: user?.id || "bus_driver" },
          data,
          message: "Ticket verified successfully.",
        });
        setManualInput("");
      } else {
        setScanResult({ valid: false, message: "Invalid or expired QR code" });
      }
    } catch {
      setScanResult({ valid: false, message: "Could not parse QR code" });
    }
  };

  const handleManualVerify = () => {
    if (!manualInput.trim()) return;
    verifyQR(manualInput.trim());
  };

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
            {routes.map(route => (
              <TouchableOpacity
                key={route.id}
                style={[styles.routePickerCard, selectedRouteId === route.id && styles.routePickerCardActive]}
                onPress={() => {
                  setSelectedRouteId(route.id);
                  setScanResult(null);
                  setManualInput("");
                }}
              >
                <Text style={styles.routePickerTitle}>{route.name}</Text>
                <Text style={styles.routePickerText}>{route.from} to {route.to}</Text>
                <Text style={styles.routePickerMeta}>{route.departureTime} • ₹{route.fare}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Route Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Route Details</Text>
          <Card elevated>
            <View style={styles.routeStopsRow}>
              {selectedRoute.stops.map((stop, i) => (
                <View key={stop} style={styles.stopRow}>
                  <View style={[styles.stopDot, i === 0 && { backgroundColor: COLORS.success }, i === selectedRoute.stops.length - 1 && { backgroundColor: COLORS.error }]} />
                  <Text style={styles.stopName}>{stop}</Text>
                  {i < selectedRoute.stops.length - 1 && <View style={styles.stopLine} />}
                </View>
              ))}
            </View>
          </Card>
        </View>

        {/* QR Scanner / Verifier */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Verify Passenger QR</Text>
          <Card elevated>
            <Text style={styles.scanInstructions}>Selected route: {selectedRoute.name}. Paste the passenger QR payload below and verify boarding.</Text>
            <TextInput
              style={styles.manualInput}
              placeholder="Paste QR data or booking ID..."
              value={manualInput}
              onChangeText={setManualInput}
              multiline
              androidDisableFullscreenInput
              underlineColorAndroid="transparent"
              selectionColor={COLORS.primary}
              cursorColor={COLORS.primary}
              autoCorrect={false}
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.verifyBtn} onPress={handleManualVerify}>
              <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.verifyGrad}>
                <Ionicons name="qr-code" size={18} color={COLORS.white} />
                <Text style={styles.verifyBtnText}>Verify QR Code</Text>
              </LinearGradient>
            </TouchableOpacity>

            {scanResult && (
              <View style={[styles.scanResult, { backgroundColor: scanResult.valid ? COLORS.success + "15" : COLORS.error + "15" }]}>
                <Ionicons name={scanResult.valid ? "checkmark-circle" : "close-circle"} size={28} color={scanResult.valid ? COLORS.success : COLORS.error} />
                {scanResult.valid ? (
                  <View style={styles.scanResultInfo}>
                    <Text style={[styles.scanResultTitle, { color: COLORS.success }]}>Ticket Verified</Text>
                    <Text style={styles.scanResultText}>Seat: {scanResult.booking.seatNumber}</Text>
                    <Text style={styles.scanResultText}>Passenger: {scanResult.booking.userName}</Text>
                    <Text style={styles.scanResultText}>{scanResult.message}</Text>
                    <Badge status="completed" label="Verified" />
                  </View>
                ) : (
                  <View style={styles.scanResultInfo}>
                    <Text style={[styles.scanResultTitle, { color: COLORS.error }]}>Invalid!</Text>
                    <Text style={styles.scanResultText}>{scanResult.message}</Text>
                  </View>
                )}
              </View>
            )}
          </Card>
        </View>

        {/* Passenger List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Passenger List ({routeBookings.length})</Text>
          {routeBookings.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Ionicons name="people" size={32} color={COLORS.border} />
              <Text style={styles.emptyText}>No bookings yet for this route</Text>
            </Card>
          ) : (
            routeBookings.map(booking => (
              <Card key={booking.id} style={styles.passengerCard}>
                <View style={styles.passengerRow}>
                  <View style={styles.seatBadge}>
                    <Text style={styles.seatBadgeText}>{booking.seatNumber}</Text>
                  </View>
                  <View style={styles.passengerInfo}>
                    <Text style={styles.passengerName}>{booking.userName}</Text>
                    <Text style={styles.passengerStatus}>
                      {booking.isWaiting
                        ? `WL ${booking.waitlistPosition}`
                        : `Seat ${booking.seatNumber}`}
                      {booking.verified ? " • Verified" : ""}
                    </Text>
                  </View>
                  <Badge
                    status={booking.verified ? "completed" : booking.isWaiting ? "waiting" : "accepted"}
                    label={booking.verified ? "Verified" : booking.isWaiting ? "Waiting" : "Pending Scan"}
                  />
                </View>
              </Card>
            ))
          )}
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
  routePickerList: { gap: 10 },
  routePickerCard: { borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.white, padding: 14 },
  routePickerCardActive: { borderColor: COLORS.success, backgroundColor: "#ECFDF5" },
  routePickerTitle: { fontSize: 14, fontWeight: "800", color: COLORS.text },
  routePickerText: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
  routePickerMeta: { fontSize: 12, color: COLORS.success, fontWeight: "700", marginTop: 6 },
  routeStopsRow: {},
  stopRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  stopDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.primary, marginRight: 12 },
  stopName: { fontSize: 14, color: COLORS.text, fontWeight: "500" },
  stopLine: {},
  scanInstructions: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 12 },
  manualInput: { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, color: COLORS.text, minHeight: 80, textAlignVertical: "top", marginBottom: 12 },
  verifyBtn: { borderRadius: 12, overflow: "hidden", marginBottom: 12 },
  verifyGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14 },
  verifyBtnText: { fontSize: 15, fontWeight: "700", color: COLORS.white },
  scanResult: { borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  scanResultInfo: { flex: 1 },
  scanResultTitle: { fontSize: 16, fontWeight: "800", marginBottom: 4 },
  scanResultText: { fontSize: 13, color: COLORS.text, marginBottom: 4 },
  passengerCard: { marginBottom: SPACING.sm },
  passengerRow: { flexDirection: "row", alignItems: "center" },
  seatBadge: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  seatBadgeText: { fontSize: 14, fontWeight: "900", color: COLORS.white },
  passengerInfo: { flex: 1, marginLeft: 12 },
  passengerName: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  passengerStatus: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  emptyCard: { alignItems: "center", paddingVertical: SPACING.xl },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, marginTop: 10 },
});
