import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useDispatch, useSelector } from "react-redux";
import { SafeAreaView } from "react-native-safe-area-context";
import { logoutUser } from "../../store/slices/authSlice";
import Card from "../../components/common/Card";
import { COLORS, SPACING } from "../../constants";

export default function DriverProfileScreen() {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.auth.user);
  const dashboard = useSelector((state) => state.driver.dashboard);
  const driverProfile = dashboard?.driver || user || {};

  const stats = useMemo(() => {
    const completed = dashboard?.completedRides || [];
    const completedCount = completed.filter((ride) => ride.status === "completed").length;
    const totalEarnings = completed.reduce((sum, ride) => sum + Number(ride.fare || 0), 0);
    return { completedCount, totalEarnings };
  }, [dashboard?.completedRides]);

  const handleLogout = () => {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => dispatch(logoutUser()) },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.banner}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.name?.[0]?.toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{driverProfile?.name || user?.name}</Text>
          <Text style={styles.sub}>{driverProfile?.email || user?.email}</Text>
          <Text style={styles.meta}>{driverProfile?.phone || user?.phone || "Phone not available"}</Text>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statVal}>{stats.completedCount}</Text>
              <Text style={styles.statLabel}>Completed</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statVal}>₹{stats.totalEarnings}</Text>
              <Text style={styles.statLabel}>Earnings</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statVal}>{dashboard?.stats?.ridesToday || 0}</Text>
              <Text style={styles.statLabel}>Today</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Driver Details</Text>
          <Card elevated>
            <View style={styles.infoRow}>
              <Ionicons name="car-sport" size={18} color={COLORS.primary} />
              <Text style={styles.infoText}>{driverProfile?.vehicleNo || "Vehicle not set"}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Ionicons name="speedometer" size={18} color={COLORS.success} />
              <Text style={styles.infoText}>{(driverProfile?.vehicleType || "driver").toUpperCase()}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Ionicons name="star" size={18} color="#F59E0B" />
              <Text style={styles.infoText}>{driverProfile?.rating || user?.rating || 0} rating</Text>
            </View>
          </Card>
        </View>

        <View style={styles.section}>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Ionicons name="log-out" size={20} color={COLORS.error} />
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  banner: { padding: SPACING.lg, alignItems: "center", paddingBottom: SPACING.xl },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(255,255,255,0.3)", alignItems: "center", justifyContent: "center", marginBottom: 12, borderWidth: 3, borderColor: "rgba(255,255,255,0.5)" },
  avatarText: { fontSize: 32, fontWeight: "900", color: COLORS.white },
  name: { fontSize: 22, fontWeight: "800", color: COLORS.white, marginBottom: 4 },
  sub: { fontSize: 14, color: "rgba(255,255,255,0.85)", marginBottom: 4 },
  meta: { fontSize: 13, color: "rgba(255,255,255,0.78)", marginBottom: SPACING.lg },
  statsRow: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 16, paddingVertical: 14, paddingHorizontal: 20, gap: 20 },
  stat: { alignItems: "center", flex: 1 },
  statVal: { fontSize: 18, fontWeight: "900", color: COLORS.white },
  statLabel: { fontSize: 11, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  statDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.3)" },
  section: { padding: SPACING.md },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: COLORS.textSecondary, marginBottom: SPACING.sm, letterSpacing: 0.5, textTransform: "uppercase" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  infoText: { fontSize: 14, color: COLORS.text, fontWeight: "600" },
  divider: { height: 1, backgroundColor: COLORS.border },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: COLORS.error + "15", borderRadius: 14, paddingVertical: 16, marginTop: 8, marginBottom: 40 },
  logoutText: { fontSize: 16, fontWeight: "700", color: COLORS.error },
});
