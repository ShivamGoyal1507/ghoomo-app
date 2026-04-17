
import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, StatusBar } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useDispatch, useSelector } from "react-redux";
import { SafeAreaView } from "react-native-safe-area-context";
import { COLORS, FARES, RADIUS, SHADOWS, SPACING } from "../../constants";
import { setUserFooterMode } from "../../store/slices/navigationPreferencesSlice";

const { width } = Dimensions.get("window");
const isTablet = width >= 768;
const serviceCardWidth = isTablet
  ? (width - SPACING.md * 2 - 36) / 4
  : (width - SPACING.md * 2 - 12) / 2;

const SERVICES = [
  { id: "bike", label: "Bike", icon: "bicycle", color: "#FF6B35", gradient: ["#FF6B35", "#FF8C60"], screen: "BookRide", params: { rideType: "bike" }, mode: "shared" },
  { id: "auto", label: "Auto", icon: "car-sport", color: "#F59E0B", gradient: ["#F59E0B", "#FCD34D"], screen: "BookRide", params: { rideType: "auto" }, mode: "shared" },
  { id: "cab", label: "Cab", icon: "car", color: "#6C63FF", gradient: ["#6C63FF", "#8B84FF"], screen: "BookRide", params: { rideType: "cab" }, mode: "shared" },
  { id: "bus", label: "College Bus", icon: "bus", color: "#10B981", gradient: ["#10B981", "#34D399"], screen: "CollegeBusHome", params: {}, mode: "bus" },
];

export default function HomeScreen({ navigation }) {
  const dispatch = useDispatch();
  const user = useSelector(s => s.auth.user);
  const activeBooking = useSelector(s => s.booking.activeBooking);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";

  const handleServicePress = (service) => {
    dispatch(setUserFooterMode(service.mode || "shared"));
    navigation.navigate(service.screen, service.params);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar barStyle="dark-content" />
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <LinearGradient colors={["#EEF4FF", "#F8FAFC"]} style={styles.header}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.greeting}>{greeting}</Text>
              <Text style={styles.userName}>{user?.name?.split(" ")[0]}</Text>
              <Text style={styles.headerSub}>Book rides, buses, and campus travel from one place.</Text>
            </View>
            <TouchableOpacity style={styles.profileBtn} onPress={() => navigation.navigate("Profile")}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{user?.name?.[0]?.toUpperCase()}</Text>
              </View>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.searchBar} onPress={() => navigation.navigate("RideTypeSelection")} activeOpacity={0.9}>
            <Ionicons name="search" size={18} color={COLORS.gray} />
            <Text style={styles.searchText}>Where do you want to go?</Text>
            <Ionicons name="arrow-forward" size={16} color={COLORS.grayDark} />
          </TouchableOpacity>
        </LinearGradient>

        {/* Active Booking Alert */}
        {activeBooking && (
          <TouchableOpacity onPress={() => navigation.navigate("RideTracking")} style={styles.activeAlert}>
            <LinearGradient colors={[COLORS.success, "#059669"]} style={styles.alertGrad}>
              <Ionicons name="car" size={20} color={COLORS.white} />
              <Text style={styles.alertText}>Active ride in progress • Tap to track</Text>
              <Ionicons name="chevron-forward" size={18} color={COLORS.white} />
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Services */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Book a Ride</Text>
          <View style={styles.servicesGrid}>
            {SERVICES.map(s => (
              <TouchableOpacity key={s.id} style={[styles.serviceCard, { width: serviceCardWidth }]} onPress={() => handleServicePress(s)} activeOpacity={0.9}>
                <LinearGradient colors={s.gradient} style={styles.serviceGradient}>
                  <Ionicons name={s.icon} size={28} color={COLORS.white} />
                </LinearGradient>
                <Text style={styles.serviceLabel}>{s.label}</Text>
                {s.id !== "bus" && (
                  <Text style={styles.serviceFare}>₹{FARES[s.id]?.base}+ base</Text>
                )}
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
  scroll: { flex: 1 },
  header: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: SPACING.xl },
  headerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: SPACING.md },
  greeting: { fontSize: 14, color: COLORS.textSecondary, fontWeight: "700" },
  userName: { fontSize: 28, fontWeight: "900", color: COLORS.text },
  headerSub: { fontSize: 14, color: COLORS.textSecondary, marginTop: 6, maxWidth: 260, lineHeight: 20 },
  profileBtn: {},
  avatar: {
    width: 50,
    height: 50,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.soft,
  },
  avatarText: { fontSize: 18, fontWeight: "900", color: COLORS.primary },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.soft,
  },
  searchText: { flex: 1, fontSize: 15, color: COLORS.grayDark, fontWeight: "500" },
  activeAlert: { margin: SPACING.md, borderRadius: RADIUS.md, overflow: "hidden" },
  alertGrad: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  alertText: { flex: 1, color: COLORS.white, fontWeight: "700", fontSize: 14 },
  section: { paddingHorizontal: SPACING.md, marginTop: SPACING.lg },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: COLORS.text, marginBottom: SPACING.md },
  servicesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  serviceCard: {
    alignItems: "flex-start",
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.soft,
  },
  serviceGradient: { width: 62, height: 62, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  serviceLabel: { fontSize: 14, fontWeight: "800", color: COLORS.text, textAlign: "left" },
  serviceFare: { fontSize: 11, color: COLORS.textSecondary, marginTop: 4, fontWeight: "600" },
  quickRow: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  quickBtn: {
    alignItems: "center",
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.soft,
  },
  quickIcon: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  quickLabel: { fontSize: 12, fontWeight: "600", color: COLORS.text },
  promoBanner: { borderRadius: RADIUS.lg, padding: SPACING.lg, flexDirection: "row", justifyContent: "space-between", alignItems: "center", ...SHADOWS.soft },
  promoTitle: { fontSize: 20, fontWeight: "800", color: COLORS.white, marginBottom: 4 },
  promoSub: { fontSize: 13, color: "rgba(255,255,255,0.85)", maxWidth: 180 },
});
