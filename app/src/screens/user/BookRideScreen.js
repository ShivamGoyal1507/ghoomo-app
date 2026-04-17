
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
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useDispatch, useSelector } from "react-redux";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { createRideBooking, fetchRideQuote } from "../../store/slices/bookingSlice";
import Header from "../../components/common/Header";
import Button from "../../components/common/Button";
import Card from "../../components/common/Card";
import { COLORS, SPACING, FARES } from "../../constants";
import { api } from "../../services/api";

const RIDE_OPTIONS = [
  { type: "bike", label: "Bike", icon: "bicycle", color: "#FF6B35", desc: "Fast & affordable", shareable: false },
  { type: "auto", label: "Auto", icon: "car-sport", color: "#F59E0B", desc: "Comfortable 3-wheeler", shareable: true },
  { type: "cab", label: "Cab", icon: "car", color: "#6C63FF", desc: "AC cab, premium ride", shareable: true },
];

const PAYMENT_OPTIONS = [
  { key: "cash", label: "Cash", icon: "cash" },
  { key: "upi", label: "UPI", icon: "phone-portrait" },
  { key: "card", label: "Card", icon: "card" },
  { key: "wallet", label: "Wallet", icon: "wallet" },
];

const SCHEDULE_OPTIONS = [
  { key: "now", label: "Now", minutes: 0 },
  { key: "15", label: "In 15 min", minutes: 15 },
  { key: "30", label: "In 30 min", minutes: 30 },
];

function SimpleField({
  label,
  leftIcon,
  rightIcon,
  value,
  onChangeText,
  placeholder,
  autoCorrect,
  autoCapitalize,
  returnKeyType,
  inputRef,
}) {
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <View style={styles.inputWrap}>
        {leftIcon ? <View style={styles.iconLeft}>{leftIcon}</View> : null}
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={COLORS.gray}
          value={value ?? ""}
          onChangeText={onChangeText}
          autoCorrect={autoCorrect}
          autoCapitalize={autoCapitalize}
          returnKeyType={returnKeyType}
        />
        {rightIcon ? <View style={styles.iconRight}>{rightIcon}</View> : null}
      </View>
    </View>
  );
}

function buildPlaceFromCoords(coords, geocodeResult) {
  const street = [geocodeResult?.streetNumber, geocodeResult?.street].filter(Boolean).join(" ").trim();
  const nameParts = [
    geocodeResult?.name,
    street,
    geocodeResult?.district,
    geocodeResult?.city,
  ].filter(Boolean);
  const fallbackName = `Lat ${Number(coords.latitude).toFixed(5)}, Lon ${Number(coords.longitude).toFixed(5)}`;

  return {
    id: `coord-${Number(coords.latitude).toFixed(6)}-${Number(coords.longitude).toFixed(6)}`,
    name: nameParts[0] || fallbackName,
    address: nameParts.join(", ") || fallbackName,
    latitude: coords.latitude,
    longitude: coords.longitude,
  };
}

async function reverseGeocodeOnDevice(coords) {
  try {
    const result = await Location.reverseGeocodeAsync(coords);
    return buildPlaceFromCoords(coords, Array.isArray(result) ? result[0] : null);
  } catch (_error) {
    return buildPlaceFromCoords(coords, null);
  }
}

export default function BookRideScreen({ navigation, route }) {
  const dispatch = useDispatch();
  const scrollRef = useRef(null);
  const dropInputRef = useRef(null);
  const user = useSelector(s => s.auth.user);
  const { currentQuote, loading, error } = useSelector(s => s.booking);
  const { rideType: initType = "cab" } = route.params || {};
  const [pickupInput, setPickupInput] = useState("");
  const [dropInput, setDropInput] = useState("");
  const [pickupPlace, setPickupPlace] = useState(null);
  const [dropPlace, setDropPlace] = useState(null);
  const [isShare, setIsShare] = useState(false);
  const [pickupResults, setPickupResults] = useState([]);
  const [dropResults, setDropResults] = useState([]);
  const [searching, setSearching] = useState(null);
  const [currentCoords, setCurrentCoords] = useState(null);
  const [sharedSeatsWanted, setSharedSeatsWanted] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [scheduleKey, setScheduleKey] = useState("now");

  const selectedType = initType;
  const currentRide = RIDE_OPTIONS.find(r => r.type === selectedType) || RIDE_OPTIONS[2];
  const fareKey = isShare && currentRide?.shareable ? selectedType + "Share" : selectedType;
  const fareInfo = FARES[fareKey] || FARES[selectedType];
  const estimate = currentQuote?.estimate;
  const availability = currentQuote?.availability;
  const hasAvailableDriver = Boolean(currentQuote?.availability?.available);
  const estDist = estimate?.distanceKm || 0;
  const estFare = estimate?.fare || fareInfo.base;
  const nonSharedEstimate = Math.round((FARES[selectedType]?.base || 0) + (FARES[selectedType]?.perKm || 0) * estDist);
  const sharedSavings = isShare && currentRide?.shareable ? Math.max(0, nonSharedEstimate - estFare) : 0;
  const surgeAmount = estimate?.surgeAmount || 0;
  const surgeMultiplier = estimate?.surgeMultiplier || 1;
  const scheduledAt = (() => {
    const option = SCHEDULE_OPTIONS.find((item) => item.key === scheduleKey);
    if (!option || option.minutes <= 0) return null;
    return new Date(Date.now() + option.minutes * 60 * 1000).toISOString();
  })();
  const estTime = estimate?.durationMinutes || (selectedType === "bike" ? 12 : selectedType === "auto" ? 18 : 20);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      if (!mounted) return;
      const coords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      setCurrentCoords(coords);

      const place = await reverseGeocodeOnDevice(coords);
      if (!mounted) return;
      setPickupPlace(place);
      setPickupInput(place.name);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!pickupPlace || !dropPlace) return;
    dispatch(fetchRideQuote({
      rideType: selectedType,
      isShare: isShare && currentRide?.shareable,
      pickup: pickupPlace,
      drop: dropPlace,
      scheduledAt,
    })).catch(() => {});
  }, [dispatch, dropPlace, currentRide?.shareable, isShare, pickupPlace, scheduledAt, selectedType]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (pickupInput.trim().length < 3 || (pickupPlace && pickupPlace.name === pickupInput.trim())) {
        setPickupResults([]);
        return;
      }

      setSearching("pickup");
      api.searchPlaces({
        query: pickupInput.trim(),
        latitude: currentCoords?.latitude,
        longitude: currentCoords?.longitude,
      })
        .then(({ places }) => setPickupResults(places))
        .catch(() => setPickupResults([]))
        .finally(() => setSearching(null));
    }, 350);

    return () => clearTimeout(timeout);
  }, [currentCoords?.latitude, currentCoords?.longitude, pickupInput, pickupPlace]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (dropInput.trim().length < 3 || (dropPlace && dropPlace.name === dropInput.trim())) {
        setDropResults([]);
        return;
      }

      setSearching("drop");
      api.searchPlaces({
        query: dropInput.trim(),
        latitude: currentCoords?.latitude,
        longitude: currentCoords?.longitude,
      })
        .then(({ places }) => setDropResults(places))
        .catch(() => setDropResults([]))
        .finally(() => setSearching(null));
    }, 350);

    return () => clearTimeout(timeout);
  }, [currentCoords?.latitude, currentCoords?.longitude, dropInput, dropPlace]);

  const handleBook = () => {
    if (!pickupPlace || !dropPlace) {
      Alert.alert("Missing Info", "Please choose pickup and drop locations from search");
      return;
    }
    if (!hasAvailableDriver) {
      Alert.alert("No Driver Available", availability?.message || "No nearby online driver is available right now.");
      return;
    }

    dispatch(createRideBooking({
      rideType: selectedType,
      pickup: pickupPlace,
      drop: dropPlace,
      userId: user.id,
      isShare: isShare && currentRide?.shareable,
      sharedSeatsWanted: isShare && currentRide?.shareable ? sharedSeatsWanted : 0,
      paymentMethod,
      scheduledAt,
    }))
      .then(() => navigation.navigate("RideTracking"))
      .catch((bookingError) => Alert.alert("Booking Failed", bookingError.message || "Unable to create ride"));
  };

  const applyPlace = (type, place) => {
    if (type === "pickup") {
      setPickupPlace(place);
      setPickupInput(place.name);
      setPickupResults([]);
      setTimeout(() => {
        dropInputRef.current?.focus?.();
      }, 150);
      return;
    }

    setDropPlace(place);
    setDropInput(place.name);
    setDropResults([]);
  };

  const useCurrentLocation = async () => {
    if (!currentCoords) return;
    const place = await reverseGeocodeOnDevice(currentCoords);
    applyPlace("pickup", place);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Header title={`${currentRide.label} Booking`} subtitle="Step 2 of 2" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView
        style={styles.contentWrap}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={styles.scrollContent}
        >

        <View style={styles.section}>
          <Card elevated style={styles.vehicleSummaryCard}>
            <View style={[styles.vehicleIcon, { backgroundColor: currentRide.color + "18" }]}>
              <Ionicons name={currentRide.icon} size={28} color={currentRide.color} />
            </View>
            <View style={styles.vehicleSummaryInfo}>
              <Text style={styles.vehicleSummaryTitle}>{currentRide.label}</Text>
              <Text style={styles.vehicleSummaryText}>{currentRide.desc}</Text>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate("RideTypeSelection")} style={styles.changeVehicleBtn}>
              <Text style={styles.changeVehicleText}>Change</Text>
            </TouchableOpacity>
          </Card>
        </View>

        {/* Share Toggle */}
        {currentRide?.shareable && (
          <View style={styles.section}>
            <Card style={styles.shareCard}>
              <View style={styles.shareRow}>
                <View style={styles.shareLeft}>
                  <Ionicons name="people" size={22} color={COLORS.success} />
                  <View style={{ marginLeft: 12 }}>
                    <Text style={styles.shareTitle}>Share Ride</Text>
                    <Text style={styles.shareSub}>Save up to 40% by sharing with others</Text>
                  </View>
                </View>
                <Switch value={isShare} onValueChange={setIsShare} trackColor={{ false: COLORS.border, true: COLORS.success }} thumbColor={COLORS.white} />
              </View>
              {isShare && (
                <>
                  <View style={styles.savingBadge}>
                    <Text style={styles.savingText}>You save about ₹{sharedSavings} on this trip!</Text>
                  </View>
                  <View style={styles.shareCountWrap}>
                    <Text style={styles.shareCountLabel}>Looking for how many co-riders?</Text>
                    <View style={styles.shareCountRow}>
                      {[1, 2, 3].map((count) => (
                        <TouchableOpacity
                          key={count}
                          style={[styles.shareCountChip, sharedSeatsWanted === count && styles.shareCountChipActive]}
                          onPress={() => setSharedSeatsWanted(count)}
                        >
                          <Text style={[styles.shareCountText, sharedSeatsWanted === count && styles.shareCountTextActive]}>
                            {count} {count === 1 ? "person" : "people"}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </>
              )}
            </Card>
          </View>
        )}

        {/* Location Inputs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Locations</Text>
          <Card elevated>
            <SimpleField
              label="Pickup Location"
              placeholder="Search pickup point"
              value={pickupInput}
              onChangeText={(value) => { setPickupInput(value); setPickupPlace(null); }}
              autoCorrect={false}
              autoCapitalize="words"
              returnKeyType="search"
              leftIcon={<Ionicons name="ellipse" size={16} color={COLORS.success} />}
              rightIcon={searching === "pickup" ? <ActivityIndicator size="small" color={COLORS.primary} /> : null}
            />
            <View style={styles.locationActions}>
              <TouchableOpacity style={styles.locationButton} onPress={useCurrentLocation}>
                <Ionicons name="locate" size={14} color={COLORS.primary} />
                <Text style={styles.locationButtonText}>Use current location</Text>
              </TouchableOpacity>
            </View>
            {pickupResults.map((place) => (
              <TouchableOpacity key={place.id} style={styles.resultRow} onPress={() => applyPlace("pickup", place)}>
                <Ionicons name="location-outline" size={16} color={COLORS.primary} />
                <Text style={styles.resultText} numberOfLines={2}>{place.name}</Text>
              </TouchableOpacity>
            ))}
            <View style={styles.swapLine} />
            <SimpleField
              label="Drop Location"
              placeholder="Search destination"
              value={dropInput}
              onChangeText={(value) => { setDropInput(value); setDropPlace(null); }}
              inputRef={dropInputRef}
              autoCorrect={false}
              autoCapitalize="words"
              returnKeyType="search"
              leftIcon={<Ionicons name="location" size={16} color={COLORS.error} />}
              rightIcon={searching === "drop" ? <ActivityIndicator size="small" color={COLORS.primary} /> : null}
            />
            {dropResults.map((place) => (
              <TouchableOpacity key={place.id} style={styles.resultRow} onPress={() => applyPlace("drop", place)}>
                <Ionicons name="location-outline" size={16} color={COLORS.primary} />
                <Text style={styles.resultText} numberOfLines={2}>{place.name}</Text>
              </TouchableOpacity>
            ))}
          </Card>
        </View>

        {/* Popular Locations */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Popular Destinations</Text>
          <View style={styles.popularGrid}>
            {["Railway Station", "Airport", "Bus Stand", "Mall", "Hospital", "University"].map(loc => (
              <TouchableOpacity
                key={loc}
                style={styles.popularChip}
                onPress={() => {
                  setPickupResults([]);
                  setDropResults([]);
                  setDropPlace(null);
                  setDropInput(loc);
                  setTimeout(() => {
                    dropInputRef.current?.focus?.();
                  }, 50);
                }}
              >
                <Ionicons name="location" size={12} color={COLORS.primary} />
                <Text style={styles.popularText}>{loc}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment</Text>
          <Card elevated>
            <View style={styles.choiceRow}>
              {PAYMENT_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.choiceChip, paymentMethod === option.key && styles.choiceChipActive]}
                  onPress={() => setPaymentMethod(option.key)}
                >
                  <Ionicons
                    name={option.icon}
                    size={14}
                    color={paymentMethod === option.key ? COLORS.primary : COLORS.textSecondary}
                  />
                  <Text style={[styles.choiceText, paymentMethod === option.key && styles.choiceTextActive]}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Schedule</Text>
          <Card elevated>
            <View style={styles.choiceRow}>
              {SCHEDULE_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.choiceChip, scheduleKey === option.key && styles.choiceChipActive]}
                  onPress={() => setScheduleKey(option.key)}
                >
                  <Ionicons
                    name={option.key === "now" ? "flash" : "calendar"}
                    size={14}
                    color={scheduleKey === option.key ? COLORS.primary : COLORS.textSecondary}
                  />
                  <Text style={[styles.choiceText, scheduleKey === option.key && styles.choiceTextActive]}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {scheduledAt ? (
              <Text style={styles.scheduleNote}>
                Pickup time: {new Date(scheduledAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
              </Text>
            ) : (
              <Text style={styles.scheduleNote}>Instant trip request with nearest online driver</Text>
            )}
          </Card>
        </View>

        {/* Fare Summary */}
        <View style={styles.section}>
          <Card style={styles.fareCard} elevated>
            <Text style={styles.fareSummaryTitle}>Fare Summary</Text>
            <View style={styles.fareRow}><Text style={styles.fareKey}>Base fare</Text><Text style={styles.fareVal}>₹{fareInfo.base}</Text></View>
            <View style={styles.fareRow}><Text style={styles.fareKey}>Distance ({estDist || "--"} km)</Text><Text style={styles.fareVal}>₹{Math.round(fareInfo.perKm * estDist)}</Text></View>
            <View style={styles.fareRow}><Text style={styles.fareKey}>Surge ({surgeMultiplier.toFixed(2)}x)</Text><Text style={styles.fareVal}>₹{surgeAmount}</Text></View>
            <View style={styles.fareRow}><Text style={styles.fareKey}>Travel time</Text><Text style={styles.fareVal}>{estTime} min</Text></View>
            <View style={styles.fareRow}>
              <Text style={styles.fareKey}>Driver availability</Text>
              <Text style={[styles.fareVal, !hasAvailableDriver && styles.unavailableText]}>
                {hasAvailableDriver
                  ? currentQuote?.driver
                    ? `${currentQuote.driver.name} • ${currentQuote.driver.distanceKm} km away`
                    : availability?.message || "Nearby drivers have received your request"
                  : "No nearby online driver"}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.fareRow}><Text style={styles.fareTotalKey}>Total Estimate</Text><Text style={styles.fareTotalVal}>₹{estFare}</Text></View>
            <View style={styles.fareRow}><Text style={styles.fareKey}>Payment mode</Text><Text style={styles.fareVal}>{paymentMethod.toUpperCase()}</Text></View>
            <Text style={styles.fareNote}>{currentQuote ? "* Based on live OpenStreetMap route data" : "* Search both locations to load live route pricing"}</Text>
            {availability?.message ? <Text style={[styles.fareNote, !hasAvailableDriver && styles.unavailableText]}>{availability.message}</Text> : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </Card>
        </View>

        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.bookBtnWrap}>
        <Button
          title={loading ? "Loading live route..." : `Book ${currentRide?.label}${isShare ? " (Shared)" : ""} • ₹${estFare}`}
          onPress={handleBook}
          disabled={!currentQuote || loading || !hasAvailableDriver}
          size="lg"
          icon={<Ionicons name={currentRide?.icon || "car"} size={20} color={COLORS.white} />}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  contentWrap: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 140 },
  section: { paddingHorizontal: SPACING.md, marginTop: SPACING.md },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: COLORS.text, marginBottom: SPACING.sm },
  field: { marginBottom: SPACING.md },
  fieldLabel: { fontSize: 13, fontWeight: "700", color: COLORS.text, marginBottom: 8, letterSpacing: 0.2 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.inputBg,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  input: { flex: 1, fontSize: 15, color: COLORS.text },
  iconLeft: { marginRight: 10 },
  iconRight: { marginLeft: 10 },
  vehicleSummaryCard: { flexDirection: "row", alignItems: "center" },
  vehicleIcon: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  vehicleSummaryInfo: { flex: 1, marginLeft: 14 },
  vehicleSummaryTitle: { fontSize: 16, fontWeight: "800", color: COLORS.text },
  vehicleSummaryText: { fontSize: 12, color: COLORS.textSecondary, marginTop: 3 },
  changeVehicleBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  changeVehicleText: { fontSize: 12, fontWeight: "800", color: COLORS.primary },
  shareCard: {},
  shareRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  shareLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  shareTitle: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  shareSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  savingBadge: { backgroundColor: COLORS.success + "15", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginTop: 10 },
  savingText: { color: COLORS.success, fontWeight: "700", fontSize: 13 },
  shareCountWrap: { marginTop: 12 },
  shareCountLabel: { fontSize: 13, fontWeight: "700", color: COLORS.text, marginBottom: 8 },
  shareCountRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  shareCountChip: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: COLORS.white },
  shareCountChipActive: { borderColor: COLORS.success, backgroundColor: "#ECFDF5" },
  shareCountText: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary },
  shareCountTextActive: { color: COLORS.success },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choiceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  choiceChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + "12" },
  choiceText: { fontSize: 12, fontWeight: "700", color: COLORS.textSecondary },
  choiceTextActive: { color: COLORS.primary },
  scheduleNote: { fontSize: 12, color: COLORS.textSecondary, marginTop: 10, fontWeight: "600" },
  locationActions: { marginTop: -8, marginBottom: 8 },
  locationButton: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#EEF2FF", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  locationButtonText: { fontSize: 12, fontWeight: "700", color: COLORS.primary },
  resultRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
  resultText: { flex: 1, fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },
  swapLine: { height: 1, backgroundColor: COLORS.border, marginVertical: 4 },
  popularGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  popularChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: COLORS.white, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.border },
  popularText: { fontSize: 12, fontWeight: "600", color: COLORS.text },
  fareCard: {},
  fareSummaryTitle: { fontSize: 15, fontWeight: "800", color: COLORS.text, marginBottom: SPACING.sm },
  fareRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  fareKey: { fontSize: 14, color: COLORS.textSecondary },
  fareVal: { fontSize: 14, fontWeight: "600", color: COLORS.text },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 8 },
  fareTotalKey: { fontSize: 15, fontWeight: "800", color: COLORS.text },
  fareTotalVal: { fontSize: 18, fontWeight: "900", color: COLORS.primary },
  fareNote: { fontSize: 11, color: COLORS.textSecondary, marginTop: 6 },
  unavailableText: { color: COLORS.error },
  errorText: { fontSize: 12, color: COLORS.error, marginTop: 8, fontWeight: "600" },
  bookBtnWrap: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: COLORS.white, paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, paddingBottom: 28, shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 10 },
});
