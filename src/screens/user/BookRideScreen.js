
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
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useDispatch, useSelector } from "react-redux";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { createRideBooking, fetchRideQuote } from "../../store/slices/bookingSlice";
import Header from "../../components/common/Header";
import Input from "../../components/common/Input";
import Button from "../../components/common/Button";
import Card from "../../components/common/Card";
import { COLORS, SPACING, FARES } from "../../constants";
import { api } from "../../services/api";

const RIDE_OPTIONS = [
  { type: "bike", label: "Bike", icon: "bicycle", color: "#FF6B35", desc: "Fast & affordable", shareable: false },
  { type: "auto", label: "Auto", icon: "car-sport", color: "#F59E0B", desc: "Comfortable 3-wheeler", shareable: true },
  { type: "cab", label: "Cab", icon: "car", color: "#6C63FF", desc: "AC cab, premium ride", shareable: true },
];

export default function BookRideScreen({ navigation, route }) {
  const dispatch = useDispatch();
  const scrollRef = useRef(null);
  const dropInputRef = useRef(null);
  const user = useSelector(s => s.auth.user);
  const { currentQuote, loading, error } = useSelector(s => s.booking);
  const { rideType: initType = "cab" } = route.params || {};
  const [selectedType, setSelectedType] = useState(initType);
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

  const currentRide = RIDE_OPTIONS.find(r => r.type === selectedType);
  const fareKey = isShare && currentRide?.shareable ? selectedType + "Share" : selectedType;
  const fareInfo = FARES[fareKey] || FARES[selectedType];
  const estimate = currentQuote?.estimate;
  const availability = currentQuote?.availability;
  const hasAvailableDriver = Boolean(currentQuote?.availability?.available);
  const estDist = estimate?.distanceKm || 0;
  const estFare = estimate?.fare || fareInfo.base;
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

      try {
        const { place } = await api.reverseGeocode(coords);
        if (!mounted) return;
        setPickupPlace(place);
        setPickupInput(place.name);
      } catch (_error) {
        if (!mounted) return;
        setPickupPlace(coords);
      }
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
    })).catch(() => {});
  }, [dispatch, dropPlace, currentRide?.shareable, isShare, pickupPlace, selectedType]);

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
      Alert.alert("Missing Info", "Please choose pickup and drop from the live map search");
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
    }))
      .then(() => navigation.navigate("RideTracking"))
      .catch((bookingError) => Alert.alert("Booking Failed", bookingError.message || "Unable to create ride"));
  };

  const applyPlace = (type, place) => {
    Keyboard.dismiss();
    if (type === "pickup") {
      setPickupPlace(place);
      setPickupInput(place.name);
      setPickupResults([]);
      setTimeout(() => {
        dropInputRef.current?.focus?.();
        scrollRef.current?.scrollTo?.({ y: 340, animated: true });
      }, 150);
      return;
    }

    setDropPlace(place);
    setDropInput(place.name);
    setDropResults([]);
  };

  const useCurrentLocation = async () => {
    if (!currentCoords) return;
    try {
      const { place } = await api.reverseGeocode(currentCoords);
      applyPlace("pickup", place);
    } catch (_error) {
      applyPlace("pickup", {
        name: "Current Location",
        ...currentCoords,
      });
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Header title="Book a Ride" onBack={() => navigation.goBack()} />
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
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "none"}
        contentContainerStyle={styles.scrollContent}
      >

        {/* Ride Type Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Choose Vehicle</Text>
          {RIDE_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.type}
              style={[styles.rideCard, selectedType === opt.type && styles.rideCardActive]}
              onPress={() => { setSelectedType(opt.type); if (!opt.shareable) setIsShare(false); }}
              activeOpacity={0.8}
            >
              <View style={[styles.rideIcon, { backgroundColor: opt.color + "20" }]}>
                <Ionicons name={opt.icon} size={26} color={opt.color} />
              </View>
              <View style={styles.rideInfo}>
                <Text style={styles.rideLabel}>{opt.label}</Text>
                <Text style={styles.rideDesc}>{opt.desc}</Text>
              </View>
              <View style={styles.rideFareCol}>
                <Text style={styles.rideFare}>₹{Math.round(FARES[opt.type].base + FARES[opt.type].perKm * Math.max(estDist, 1))}</Text>
                <Text style={styles.rideEta}>~{estTime} min</Text>
              </View>
              {selectedType === opt.type && (
                <View style={styles.checkMark}>
                  <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} />
                </View>
              )}
            </TouchableOpacity>
          ))}
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
                    <Text style={styles.savingText}>You save ₹{estFare - Math.round(FARES[fareKey]?.base + FARES[fareKey]?.perKm * estDist)} on this trip!</Text>
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
            <Input
              label="Pickup Location"
              placeholder="Search pickup point"
              value={pickupInput}
              onChangeText={(value) => { setPickupInput(value); setPickupPlace(null); }}
              onFocus={() => setDropResults([])}
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
            <Input
              label="Drop Location"
              placeholder="Search destination"
              value={dropInput}
              onChangeText={(value) => { setDropInput(value); setDropPlace(null); }}
              inputRef={dropInputRef}
              onFocus={() => {
                setPickupResults([]);
                setTimeout(() => {
                  scrollRef.current?.scrollTo?.({ y: 340, animated: true });
                }, 50);
              }}
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

        {/* Fare Summary */}
        <View style={styles.section}>
          <Card style={styles.fareCard} elevated>
            <Text style={styles.fareSummaryTitle}>Fare Summary</Text>
            <View style={styles.fareRow}><Text style={styles.fareKey}>Base fare</Text><Text style={styles.fareVal}>₹{fareInfo.base}</Text></View>
            <View style={styles.fareRow}><Text style={styles.fareKey}>Distance ({estDist || "--"} km)</Text><Text style={styles.fareVal}>₹{Math.round(fareInfo.perKm * estDist)}</Text></View>
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
  rideCard: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.white, borderRadius: 14, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 2, borderColor: COLORS.border },
  rideCardActive: { borderColor: COLORS.primary, backgroundColor: "#F5F3FF" },
  rideIcon: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  rideInfo: { flex: 1, marginLeft: 12 },
  rideLabel: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  rideDesc: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  rideFareCol: { alignItems: "flex-end" },
  rideFare: { fontSize: 16, fontWeight: "800", color: COLORS.text },
  rideEta: { fontSize: 11, color: COLORS.textSecondary },
  checkMark: { position: "absolute", top: 8, right: 8 },
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
