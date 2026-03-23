import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useDispatch, useSelector } from "react-redux";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  cancelBusSeatBooking,
  createBusSeatBooking,
  fetchBusBookings,
  setBusBookings,
} from "../../store/slices/bookingSlice";
import { fetchBusRoutes } from "../../store/slices/busRoutesSlice";
import Header from "../../components/common/Header";
import Button from "../../components/common/Button";
import Card from "../../components/common/Card";
import Badge from "../../components/common/Badge";
import QRDisplay from "../../components/common/QRDisplay";
import { COLORS, SPACING } from "../../constants";
import { sendLocalNotification } from "../../services/notifications";
import { subscribeBusRealtime } from "../../services/realtime";
import {
  BUS_WAITLIST_LIMIT,
  formatRelativeMinutes,
  formatShortTime,
  getBookingWindow,
  getDemandLabel,
  getRouteOccupancy,
} from "../../utils/bus";

const createBusBookingId = () => `bus_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export default function BusBookingScreen({ navigation }) {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.auth.user);
  const busBookings = useSelector((state) => state.booking.busBookings);
  const liveRoutes = useSelector((state) => state.busRoutes.routes);
  const routes = liveRoutes;
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [step, setStep] = useState("routes");
  const [lastBooking, setLastBooking] = useState(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const intervalId = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(intervalId);
  }, []);

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
    if (!selectedRoute && routes.length > 0) {
      setSelectedRoute(routes[0]);
    }
  }, [routes, selectedRoute]);

  useEffect(() => {
    if (step !== "routes" && !selectedRoute) {
      setStep("routes");
    }
  }, [selectedRoute, step]);

  const userBusBookings = useMemo(
    () => busBookings.filter((booking) => booking.userId === user?.id && booking.status !== "cancelled"),
    [busBookings, user?.id]
  );
  const getUserRouteBooking = (routeId) =>
    userBusBookings.find((booking) => booking.routeId === routeId && booking.status !== "cancelled");

  const getOccupancy = (route) => getRouteOccupancy(route, busBookings);

  const sortedRoutes = useMemo(() => {
    return [...routes].sort((a, b) => {
      const aw = getBookingWindow(a, now);
      const bw = getBookingWindow(b, now);
      return aw.departure.getTime() - bw.departure.getTime();
    });
  }, [routes, now, busBookings]);

  const handleBook = async () => {
    if (!selectedRoute) return;

    const existingBooking = getUserRouteBooking(selectedRoute.id);
    if (existingBooking) {
      Alert.alert(
        "Already Booked",
        existingBooking.isWaiting
          ? `You are already on WL ${existingBooking.waitlistPosition} for this route.`
          : `You already have seat ${existingBooking.seatNumber} booked for this route.`
      );
      return;
    }

    const occupancy = getOccupancy(selectedRoute);
    const bookingWindow = getBookingWindow(selectedRoute, now);
    if (!bookingWindow.canBook) {
      Alert.alert("Booking Closed", `Booking opens at ${formatShortTime(bookingWindow.opensAt)} and closes at departure.`);
      return;
    }

    if (occupancy.availableSeats.length === 0 && occupancy.waitlistRemaining <= 0) {
      Alert.alert("Bus Full", "This route is full and the waiting list is also full right now.");
      return;
    }

    try {
      const bookingId = createBusBookingId();
      const booking = await dispatch(
        createBusSeatBooking({
          bookingId,
          routeId: selectedRoute.id,
          userId: user.id,
          userName: user.name,
        })
      );

      sendLocalNotification({
        key: booking.isWaiting ? `bus-waiting-${booking.id}` : `bus-booking-${booking.id}`,
        title: booking.isWaiting ? "Added to waiting list" : "Bus seat confirmed",
        body: booking.isWaiting
          ? `${selectedRoute.name} waitlist position ${booking.waitlistPosition} is reserved.`
          : `${selectedRoute.name} seat ${booking.seatNumber} is booked for you.`,
        data: { bookingId: booking.id, routeId: selectedRoute.id, type: "bus" },
      }).catch(() => {});

      setLastBooking({
        id: booking.id,
        routeId: selectedRoute.id,
        seatNumber: booking.seatNumber,
        waitlistPosition: booking.waitlistPosition,
        isWaiting: booking.isWaiting,
        routeName: selectedRoute.name,
      });
    } catch (error) {
      Alert.alert("Booking Failed", error.message || "Unable to book seat right now.");
      return;
    }

    setStep("success");
  };

  const handleCancel = (booking) => {
    const route = routes.find((item) => item.id === booking.routeId);
    const bookingWindow = route ? getBookingWindow(route, now) : null;
    if (booking.verified) {
      Alert.alert("Cancellation Locked", "This ticket has already been verified by the driver and cannot be cancelled.");
      return;
    }
    if (route && bookingWindow && !bookingWindow.canCancel) {
      Alert.alert("Cancellation Closed", "You can cancel only up to 5 minutes before departure.");
      return;
    }

    Alert.alert("Cancel Booking", "Are you sure you want to cancel this bus seat?", [
      { text: "No", style: "cancel" },
      {
        text: "Yes, Cancel",
        style: "destructive",
        onPress: () => {
          dispatch(cancelBusSeatBooking(booking.id)).catch((cancelError) => {
            Alert.alert("Cancel Failed", cancelError.message || "Unable to cancel booking.");
          });
          sendLocalNotification({
            key: `bus-cancel-${booking.id}`,
            title: "Bus booking cancelled",
            body: `${route?.name || "Your route"} booking has been cancelled.`,
            data: { bookingId: booking.id, routeId: booking.routeId, type: "bus" },
          }).catch(() => {});
        },
      },
    ]);
  };

  if (step === "success" && lastBooking) {
    const qrData = {
      bookingId: lastBooking.id,
      type: "BUS",
      busId: lastBooking.routeId,
      seatNo: lastBooking.seatNumber,
      waitlistPosition: lastBooking.waitlistPosition,
      userId: user.id,
      ts: Date.now(),
    };

    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Header
          title="Booking Confirmed"
          onBack={() => {
            setStep("routes");
            setSelectedRoute(null);
          }}
        />
        <ScrollView contentContainerStyle={styles.successScroll}>
          <LinearGradient colors={[COLORS.success, "#059669"]} style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={56} color={COLORS.white} />
            <Text style={styles.successTitle}>
              {lastBooking.isWaiting ? `WL ${lastBooking.waitlistPosition} Reserved` : "Seat Confirmed"}
            </Text>
            <Text style={styles.successSub}>{lastBooking.routeName}</Text>
          </LinearGradient>
          <View style={styles.qrSection}>
            <Text style={styles.qrTitle}>Your Boarding QR Code</Text>
            <Text style={styles.bookingIdText}>Booking ID: {lastBooking.id}</Text>
            <Text style={styles.qrSub}>
              {lastBooking.isWaiting
                ? "You are on the waiting list. Confirmation will happen automatically if a seat opens."
                : "Show this to the bus driver for route verification."}
            </Text>
            <QRDisplay
              data={qrData}
              size={200}
              label={
                lastBooking.isWaiting
                  ? `WL ${lastBooking.waitlistPosition}`
                  : `Seat ${lastBooking.seatNumber}`
              }
            />
          </View>
          <View style={{ paddingHorizontal: SPACING.md }}>
            <Button
              title="Back to Routes"
              onPress={() => {
                setStep("routes");
                setSelectedRoute(null);
              }}
              variant="outline"
            />
            <Button title="View My Bookings" onPress={() => setStep("my")} style={{ marginTop: 10 }} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === "my") {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Header title="My Bus Bookings" onBack={() => setStep("routes")} />
        <ScrollView style={styles.scroll} contentContainerStyle={{ padding: SPACING.md }}>
          {userBusBookings.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="bus" size={56} color={COLORS.border} />
              <Text style={styles.emptyText}>No bus bookings yet</Text>
            </View>
          ) : (
            userBusBookings.map((booking) => {
              const route = routes.find((item) => item.id === booking.routeId);
              const bookingWindow = route ? getBookingWindow(route, now) : null;
              const qrData = booking.qrCode
                ? JSON.parse(booking.qrCode)
                : {
                    type: "BUS",
                    busId: booking.routeId,
                    seatNo: booking.seatNumber,
                    waitlistPosition: booking.waitlistPosition,
                    userId: booking.userId,
                  };

              return (
                <Card key={booking.id} elevated style={styles.myBookingCard}>
                  <View style={styles.myBookingHeader}>
                    <View style={styles.busIcon}>
                      <Ionicons name="bus" size={22} color={COLORS.white} />
                    </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.myBookingRoute}>{route?.name}</Text>
                    <Text style={styles.myBookingMeta}>
                      {booking.isWaiting ? `WL ${booking.waitlistPosition}` : `Seat ${booking.seatNumber}`}
                    </Text>
                    <Text style={styles.bookingIdMeta}>Booking ID: {booking.id}</Text>
                      {route ? (
                        <Text style={styles.routeWindowText}>
                          Cancel till {formatShortTime(getBookingWindow(route, now).cancelClosesAt)}
                        </Text>
                      ) : null}
                    </View>
                    <Badge
                      status={booking.isWaiting ? "waiting" : booking.verified ? "completed" : "accepted"}
                      label={booking.isWaiting ? `WL ${booking.waitlistPosition}` : booking.verified ? "Verified" : "Confirmed"}
                    />
                  </View>
                  <QRDisplay data={qrData} size={130} />
                  <TouchableOpacity
                    style={[
                      styles.cancelBtn,
                      (bookingWindow && !bookingWindow.canCancel) || booking.verified ? styles.cancelBtnDisabled : null,
                    ]}
                    onPress={() => handleCancel(booking)}
                    disabled={Boolean((bookingWindow && !bookingWindow.canCancel) || booking.verified)}
                  >
                    <Ionicons
                      name="close-circle"
                      size={16}
                      color={(bookingWindow && !bookingWindow.canCancel) || booking.verified ? COLORS.gray : COLORS.error}
                    />
                    <Text
                      style={[
                        styles.cancelBtnText,
                        (bookingWindow && !bookingWindow.canCancel) || booking.verified ? styles.cancelBtnTextDisabled : null,
                      ]}
                    >
                      {booking.verified
                        ? "Verified • Cannot cancel"
                        : bookingWindow && !bookingWindow.canCancel
                          ? "Cancellation closed"
                          : "Cancel Booking"}
                    </Text>
                  </TouchableOpacity>
                </Card>
              );
            })
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === "seats" && selectedRoute) {
    const occupancy = getOccupancy(selectedRoute);
    const bookingWindow = getBookingWindow(selectedRoute, now);
    const demand = getDemandLabel(occupancy.occupancyRatio);
    const existingRouteBooking = getUserRouteBooking(selectedRoute.id);

    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Header
          title="Book Ticket"
          subtitle={selectedRoute.name}
          onBack={() => {
            setStep("routes");
          }}
          rightComponent={
            <TouchableOpacity onPress={() => setStep("my")} style={styles.myBookingsBtn}>
              <Ionicons name="ticket" size={16} color={COLORS.primary} />
              <Text style={styles.myBookingsBtnText}>My Bookings</Text>
            </TouchableOpacity>
          }
        />
        <ScrollView style={styles.scroll}>
          <View style={{ paddingHorizontal: SPACING.md, paddingTop: SPACING.md }}>
            <Card style={styles.routeInfoCard}>
              <View style={styles.routeMetaTop}>
                <Badge color={demand.color} label={demand.label} />
                <Text style={styles.routeOpenText}>
                  {bookingWindow.canBook
                    ? `Booking closes in ${formatRelativeMinutes(bookingWindow.departure, now)}`
                    : `Opens at ${formatShortTime(bookingWindow.opensAt)}`}
                </Text>
              </View>
              <View style={styles.routeStopRow}>
                {selectedRoute.stops.map((stop, index) => (
                  <React.Fragment key={`${stop}-${index}`}>
                    <Text style={styles.stopText}>{stop}</Text>
                    {index < selectedRoute.stops.length - 1 ? (
                      <Ionicons name="arrow-forward" size={12} color={COLORS.primary} />
                    ) : null}
                  </React.Fragment>
                ))}
              </View>
              <View style={styles.routeMetaRow}>
                <Text style={styles.routeMeta}><Ionicons name="time" size={12} /> {selectedRoute.departureTime}</Text>
                <Text style={styles.routeMeta}>{occupancy.availableSeatCount} live seats left</Text>
              </View>
            </Card>

            {!bookingWindow.canBook ? (
              <Card style={styles.infoCard}>
                <Ionicons name="time" size={20} color={COLORS.warning} />
                <Text style={styles.infoText}>
                  Booking opens exactly one hour before departure. Next opening is at {formatShortTime(bookingWindow.opensAt)}.
                </Text>
              </Card>
            ) : null}

            {bookingWindow.canBook ? (
              <>
                {existingRouteBooking ? (
                  <Card style={styles.infoCard}>
                    <View style={styles.existingBookingBlock}>
                      <View style={styles.existingBookingHeader}>
                        <Ionicons
                          name={existingRouteBooking.isWaiting ? "time" : "checkmark-circle"}
                          size={20}
                          color={existingRouteBooking.isWaiting ? COLORS.warning : COLORS.success}
                        />
                        <Text style={styles.infoText}>
                          {existingRouteBooking.isWaiting
                            ? `You already have a waiting list booking on this route: WL ${existingRouteBooking.waitlistPosition}.`
                            : `You already have a confirmed booking on this route: Seat ${existingRouteBooking.seatNumber}.`}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.cancelBtn,
                          styles.routeCancelBtn,
                          (bookingWindow && !bookingWindow.canCancel) || existingRouteBooking.verified
                            ? styles.cancelBtnDisabled
                            : null,
                        ]}
                        onPress={() => handleCancel(existingRouteBooking)}
                        disabled={Boolean((bookingWindow && !bookingWindow.canCancel) || existingRouteBooking.verified)}
                      >
                        <Ionicons
                          name="close-circle"
                          size={16}
                          color={(bookingWindow && !bookingWindow.canCancel) || existingRouteBooking.verified ? COLORS.gray : COLORS.error}
                        />
                        <Text
                          style={[
                            styles.cancelBtnText,
                            (bookingWindow && !bookingWindow.canCancel) || existingRouteBooking.verified
                              ? styles.cancelBtnTextDisabled
                              : null,
                          ]}
                        >
                          {existingRouteBooking.verified
                            ? "Verified • Cannot cancel"
                            : bookingWindow && !bookingWindow.canCancel
                              ? "Cancellation closed"
                              : "Cancel Ticket"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </Card>
                ) : null}
                <Text style={styles.selectionTitle}>Ticket Availability</Text>
                {occupancy.availableSeats.length === 0 ? (
                  <Card style={styles.infoCard}>
                    <Ionicons name="alert-circle" size={20} color={COLORS.warning} />
                    <Text style={styles.infoText}>All seats are taken. If you continue, you will be added to the waiting list automatically.</Text>
                  </Card>
                ) : (
                  <Card style={styles.infoCard}>
                    <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                    <Text style={styles.infoText}>
                      Ticket booking is direct. The system will assign the next available seat automatically after booking.
                    </Text>
                  </Card>
                )}

                <Text style={styles.selectionTitle}>Route Status</Text>
                <Card style={styles.infoCard}>
                  <Ionicons name="people" size={20} color={COLORS.primary} />
                  <Text style={styles.infoText}>
                    {occupancy.availableSeatCount > 0
                      ? `${occupancy.availableSeatCount} seats are currently available. You do not need to choose a seat manually.`
                      : occupancy.waitlistRemaining > 0
                        ? `No seats are left. ${occupancy.waitlistRemaining} waiting list spots are still open.`
                        : "No seats or waiting list spots are available for this route right now."}
                  </Text>
                </Card>
              </>
            ) : null}

            <View style={{ height: 110 }} />
          </View>
        </ScrollView>

        {bookingWindow.canBook &&
        !existingRouteBooking &&
        (occupancy.availableSeatCount > 0 || occupancy.waitlistRemaining > 0) ? (
          <View style={styles.bookBtnWrap}>
            <View style={styles.selectedSeatInfo}>
              <Text style={styles.selectedSeatText}>
                {occupancy.availableSeatCount > 0
                  ? "Seat will be assigned automatically"
                  : "Waitlist booking will be created automatically"}
              </Text>
            </View>
            <Button title="Book Ticket" onPress={handleBook} />
          </View>
        ) : null}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Header
        title="College Bus"
        subtitle="Real-time booking and waitlist"
        onBack={() => navigation.goBack()}
        rightComponent={
          <TouchableOpacity onPress={() => setStep("my")} style={styles.myBookingsBtn}>
            <Ionicons name="ticket" size={16} color={COLORS.primary} />
            <Text style={styles.myBookingsBtnText}>My Bookings ({userBusBookings.length})</Text>
          </TouchableOpacity>
        }
      />
      <ScrollView style={styles.scroll} contentContainerStyle={{ padding: SPACING.md }}>
        <Text style={styles.pageTitle}>Available Routes</Text>
        {sortedRoutes.length === 0 ? (
          <Card style={styles.emptyState}>
            <Ionicons name="bus" size={42} color={COLORS.border} />
            <Text style={styles.emptyText}>No bus routes are available yet.</Text>
            <Text style={styles.emptySub}>Please check again later or contact your admin.</Text>
          </Card>
        ) : (
          sortedRoutes.map((route) => {
            const occupancy = getOccupancy(route);
            const bookingWindow = getBookingWindow(route, now);
            const demand = getDemandLabel(occupancy.occupancyRatio);
            const existingRouteBooking = getUserRouteBooking(route.id);

            return (
              <TouchableOpacity
                key={route.id}
                onPress={() => {
                  setSelectedRoute(route);
                  setStep("seats");
                }}
                activeOpacity={0.85}
              >
                <Card elevated style={styles.routeCard}>
                  <View style={styles.routeHeader}>
                    <LinearGradient colors={[COLORS.success, "#059669"]} style={styles.busIconGrad}>
                      <Ionicons name="bus" size={22} color={COLORS.white} />
                    </LinearGradient>
                    <View style={styles.routeHeaderInfo}>
                      <Text style={styles.routeName}>{route.name}</Text>
                      <Text style={styles.routeSub}>{route.from} to {route.to}</Text>
                    </View>
                    <Badge
                      color={
                        existingRouteBooking
                          ? existingRouteBooking.isWaiting
                            ? COLORS.warning
                            : COLORS.success
                          : demand.color
                      }
                      label={
                        existingRouteBooking
                          ? existingRouteBooking.isWaiting
                            ? `WL ${existingRouteBooking.waitlistPosition}`
                            : `Seat ${existingRouteBooking.seatNumber}`
                          : demand.label
                      }
                    />
                  </View>
                  <View style={styles.routeDetails}>
                    <View style={styles.routeDetail}>
                      <Ionicons name="time" size={14} color={COLORS.primary} />
                      <Text style={styles.routeDetailText}>Dep: {route.departureTime}</Text>
                    </View>
                    <View style={styles.routeDetail}>
                      <Ionicons name="flash" size={14} color={COLORS.warning} />
                      <Text style={styles.routeDetailText}>
                        {bookingWindow.canBook
                          ? `Open now (${formatRelativeMinutes(bookingWindow.departure, now)} left)`
                          : `Opens ${formatShortTime(bookingWindow.opensAt)}`}
                      </Text>
                    </View>
                    <View style={styles.routeDetail}>
                      <Ionicons name="people" size={14} color={COLORS.success} />
                      <Text style={styles.routeDetailText}>
                        {occupancy.availableSeatCount} seats • {occupancy.waitlistRemaining}/{BUS_WAITLIST_LIMIT} WL left
                      </Text>
                    </View>
                  </View>
                  <View style={styles.capacityBar}>
                    <View
                      style={[
                        styles.capacityFill,
                        {
                          width: `${occupancy.occupancyRatio * 100}%`,
                          backgroundColor: demand.color,
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.capacityRow}>
                    <Text style={styles.capacityText}>
                      {existingRouteBooking
                        ? existingRouteBooking.isWaiting
                          ? "You already have a waitlist booking on this route"
                          : "You already have an active booking on this route"
                        : "Direct booking with automatic seat assignment"}
                    </Text>
                    <Text style={styles.waitingText}>Cancel till {formatShortTime(bookingWindow.cancelClosesAt)}</Text>
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  pageTitle: { fontSize: 22, fontWeight: "800", color: COLORS.text, marginBottom: SPACING.md },
  routeCard: { marginBottom: SPACING.md },
  routeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 12 },
  busIconGrad: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  routeHeaderInfo: { flex: 1 },
  routeName: { fontSize: 15, fontWeight: "800", color: COLORS.text },
  routeSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  routeDetails: { gap: 8, marginBottom: 12 },
  routeDetail: { flexDirection: "row", alignItems: "center", gap: 6 },
  routeDetailText: { fontSize: 12, color: COLORS.textSecondary },
  capacityBar: { height: 6, backgroundColor: COLORS.border, borderRadius: 3, marginBottom: 6 },
  capacityFill: { height: 6, borderRadius: 3 },
  capacityRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  capacityText: { flex: 1, fontSize: 12, color: COLORS.text, fontWeight: "600" },
  waitingText: { fontSize: 12, color: COLORS.warning, fontWeight: "600" },
  routeInfoCard: { marginBottom: SPACING.md },
  routeMetaTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  routeOpenText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: "600" },
  routeStopRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4, marginBottom: 8 },
  stopText: { fontSize: 11, color: COLORS.text, fontWeight: "600" },
  routeMetaRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  routeMeta: { fontSize: 11, color: COLORS.textSecondary },
  selectionTitle: { fontSize: 15, fontWeight: "800", color: COLORS.text, marginBottom: 10, marginTop: 8 },
  infoCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: SPACING.md },
  existingBookingBlock: { flex: 1 },
  existingBookingHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  infoText: { flex: 1, fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },
  availableSeatGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: SPACING.md },
  availableSeatChip: { borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: COLORS.white },
  availableSeatChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  availableSeatText: { fontSize: 13, fontWeight: "700", color: COLORS.text },
  availableSeatTextActive: { color: COLORS.white },
  waitlistChip: { borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.warning, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: "#FFF7ED" },
  waitlistChipActive: { backgroundColor: COLORS.warning, borderColor: COLORS.warning },
  waitlistText: { fontSize: 13, fontWeight: "700", color: COLORS.warning },
  waitlistTextActive: { color: COLORS.white },
  bookBtnWrap: { backgroundColor: COLORS.white, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, paddingBottom: 28, shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 10 },
  selectedSeatInfo: { backgroundColor: COLORS.primary + "15", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 12 },
  selectedSeatText: { fontSize: 14, fontWeight: "700", color: COLORS.primary },
  myBookingsBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: COLORS.primary + "15", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  myBookingsBtnText: { fontSize: 12, color: COLORS.primary, fontWeight: "700" },
  myBookingCard: { marginBottom: SPACING.md, alignItems: "center" },
  myBookingHeader: { flexDirection: "row", alignItems: "center", marginBottom: SPACING.md, width: "100%" },
  busIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: COLORS.success, alignItems: "center", justifyContent: "center" },
  myBookingRoute: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  myBookingMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  routeWindowText: { fontSize: 11, color: COLORS.warning, marginTop: 4, fontWeight: "600" },
  cancelBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: SPACING.sm },
  routeCancelBtn: { marginLeft: 30 },
  cancelBtnDisabled: { opacity: 0.55 },
  cancelBtnText: { fontSize: 13, color: COLORS.error, fontWeight: "600" },
  cancelBtnTextDisabled: { color: COLORS.grayDark },
  emptyState: { alignItems: "center", paddingVertical: 60 },
  emptyText: { fontSize: 16, color: COLORS.textSecondary, marginTop: 12, fontWeight: "600" },
  emptySub: { fontSize: 12, color: COLORS.grayDark, marginTop: 6 },
  successScroll: { paddingBottom: 40 },
  successBanner: { padding: SPACING.xl, alignItems: "center", paddingVertical: 40 },
  successTitle: { fontSize: 24, fontWeight: "900", color: COLORS.white, marginTop: 12, textAlign: "center" },
  successSub: { fontSize: 14, color: "rgba(255,255,255,0.85)", marginTop: 6, textAlign: "center" },
  qrSection: { padding: SPACING.lg, alignItems: "center" },
  qrTitle: { fontSize: 18, fontWeight: "800", color: COLORS.text, marginBottom: 6 },
  bookingIdText: { fontSize: 13, fontWeight: "700", color: COLORS.textSecondary, marginBottom: 4 },
  qrSub: { fontSize: 13, color: COLORS.textSecondary, marginBottom: SPACING.md, textAlign: "center" },
  bookingIdMeta: { fontSize: 11, color: COLORS.textSecondary, marginTop: 4 },
});
