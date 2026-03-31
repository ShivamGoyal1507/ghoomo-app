
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useDispatch, useSelector } from "react-redux";
import { registerUser } from "../../store/slices/authSlice";
import { fetchBusRoutes } from "../../store/slices/busRoutesSlice";
import Button from "../../components/common/Button";
import Input from "../../components/common/Input";
import Header from "../../components/common/Header";
import { BUS_ROUTES, COLORS, SPACING } from "../../constants";
import { SafeAreaView } from "react-native-safe-area-context";

const ROLE_OPTIONS = [
  { key: "user", label: "User", icon: "person", help: "Book rides and buses" },
  { key: "driver", label: "Driver", icon: "car", help: "Drive bike, auto, cab, or bus" },
  { key: "admin", label: "Admin", icon: "shield-checkmark", help: "Manage the platform" },
];

const DRIVER_TYPES = [
  { key: "bike", label: "Bike" },
  { key: "auto", label: "Auto" },
  { key: "cab", label: "Cab" },
  { key: "bus", label: "Bus" },
];

export default function RegisterScreen({ navigation }) {
  const dispatch = useDispatch();
  const { loading, error } = useSelector(s => s.auth);
  const liveRoutes = useSelector((state) => state.busRoutes.routes);
  const availableRoutes = liveRoutes.length ? liveRoutes : BUS_ROUTES;
  const [form, setForm] = useState({
    role: "user",
    name: "",
    email: "",
    phone: "",
    city: "",
    emergencyContact: "",
    vehicleType: "cab",
    vehicleNo: "",
    licenseNumber: "",
    busRoute: "",
    employeeId: "",
    organization: "",
    password: "",
    confirm: "",
  });

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    dispatch(fetchBusRoutes()).catch(() => {});
  }, [dispatch]);

  const handleRegister = () => {
    if (!form.name || !form.email || !form.phone || !form.city || !form.emergencyContact || !form.password) {
      Alert.alert("Error", "Please fill all required details");
      return;
    }
    if (form.password !== form.confirm) {
      Alert.alert("Error", "Passwords do not match");
      return;
    }

    if (form.role === "driver") {
      if (!form.vehicleType || !form.vehicleNo || !form.licenseNumber) {
        Alert.alert("Error", "Drivers must provide vehicle and license details");
        return;
      }
      if (form.vehicleType === "bus" && !form.busRoute) {
        Alert.alert("Error", "Bus drivers must select a route");
        return;
      }
    }

    if (form.role === "admin" && (!form.employeeId || !form.organization)) {
      Alert.alert("Error", "Admins must provide employee ID and organization");
      return;
    }

    dispatch(registerUser({
      role: form.role,
      name: form.name,
      email: form.email,
      phone: form.phone,
      city: form.city,
      emergencyContact: form.emergencyContact,
      vehicleType: form.role === "driver" ? form.vehicleType : undefined,
      vehicleNo: form.role === "driver" ? form.vehicleNo : undefined,
      licenseNumber: form.role === "driver" ? form.licenseNumber : undefined,
      busRoute: form.role === "driver" && form.vehicleType === "bus" ? form.busRoute : undefined,
      employeeId: form.role === "admin" ? form.employeeId : undefined,
      organization: form.role === "admin" ? form.organization : undefined,
      password: form.password,
    }));
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "none"}
        >
          <LinearGradient colors={[COLORS.accent, "#22C55E"]} style={styles.topBg}>
            <Header title="Create Account" onBack={() => navigation.goBack()} transparent />
            <Text style={styles.sub}>Choose your role and fill the important account details</Text>
          </LinearGradient>
          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>Register As</Text>
            <View style={styles.roleGrid}>
              {ROLE_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.roleCard, form.role === option.key && styles.roleCardActive]}
                  onPress={() => update("role", option.key)}
                  activeOpacity={0.85}
                >
                  <View style={[styles.roleIcon, form.role === option.key && styles.roleIconActive]}>
                    <Ionicons name={option.icon} size={18} color={form.role === option.key ? COLORS.white : COLORS.primary} />
                  </View>
                  <Text style={styles.roleLabel}>{option.label}</Text>
                  <Text style={styles.roleHelp}>{option.help}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Basic Details</Text>
            <Input label="Full Name" placeholder="Your full name" value={form.name} onChangeText={v => update("name", v)} leftIcon={<Ionicons name="person" size={20} color={COLORS.gray} />} />
            <Input label="Email" placeholder="you@example.com" value={form.email} onChangeText={v => update("email", v)} keyboardType="email-address" leftIcon={<Ionicons name="mail" size={20} color={COLORS.gray} />} />
            <Input label="Phone" placeholder="10-digit mobile number" value={form.phone} onChangeText={v => update("phone", v)} keyboardType="phone-pad" leftIcon={<Ionicons name="call" size={20} color={COLORS.gray} />} />
            <Input label="City" placeholder="Your city" value={form.city} onChangeText={v => update("city", v)} leftIcon={<Ionicons name="business" size={20} color={COLORS.gray} />} />
            <Input label="Emergency Contact" placeholder="Emergency mobile number" value={form.emergencyContact} onChangeText={v => update("emergencyContact", v)} keyboardType="phone-pad" leftIcon={<Ionicons name="medkit" size={20} color={COLORS.gray} />} />

            {form.role === "driver" ? (
              <>
                <Text style={styles.sectionTitle}>Driver Details</Text>
                <Text style={styles.inlineLabel}>Vehicle Type</Text>
                <View style={styles.optionRow}>
                  {DRIVER_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type.key}
                      style={[styles.pill, form.vehicleType === type.key && styles.pillActive]}
                      onPress={() => update("vehicleType", type.key)}
                    >
                      <Text style={[styles.pillText, form.vehicleType === type.key && styles.pillTextActive]}>{type.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Input label="Vehicle Number" placeholder="PB-01-AB-1234" value={form.vehicleNo} onChangeText={v => update("vehicleNo", v)} leftIcon={<Ionicons name="car-sport" size={20} color={COLORS.gray} />} />
                <Input label="License Number" placeholder="Driver license number" value={form.licenseNumber} onChangeText={v => update("licenseNumber", v)} leftIcon={<Ionicons name="card" size={20} color={COLORS.gray} />} />
                {form.vehicleType === "bus" ? (
                  <>
                    <Text style={styles.inlineLabel}>Bus Route</Text>
                    <View style={styles.optionRow}>
                      {availableRoutes.map((route) => (
                        <TouchableOpacity
                          key={route.id}
                          style={[styles.routeChoice, form.busRoute === route.id && styles.routeChoiceActive]}
                          onPress={() => update("busRoute", route.id)}
                        >
                          <Text style={styles.routeChoiceTitle}>{route.name}</Text>
                          <Text style={styles.routeChoiceText}>{route.from} -> {route.to}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                ) : null}
              </>
            ) : null}

            {form.role === "admin" ? (
              <>
                <Text style={styles.sectionTitle}>Admin Details</Text>
                <Input label="Employee ID" placeholder="Official employee ID" value={form.employeeId} onChangeText={v => update("employeeId", v)} leftIcon={<Ionicons name="id-card" size={20} color={COLORS.gray} />} />
                <Input label="Organization" placeholder="Company or institution name" value={form.organization} onChangeText={v => update("organization", v)} leftIcon={<Ionicons name="briefcase" size={20} color={COLORS.gray} />} />
              </>
            ) : null}

            <Text style={styles.sectionTitle}>Security</Text>
            <Input label="Password" placeholder="Create a password" value={form.password} onChangeText={v => update("password", v)} secureTextEntry leftIcon={<Ionicons name="lock-closed" size={20} color={COLORS.gray} />} />
            <Input label="Confirm Password" placeholder="Re-enter password" value={form.confirm} onChangeText={v => update("confirm", v)} secureTextEntry leftIcon={<Ionicons name="lock-closed" size={20} color={COLORS.gray} />} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button title={`Create ${form.role.charAt(0).toUpperCase() + form.role.slice(1)} Account`} onPress={handleRegister} loading={loading} variant="success" style={{ marginTop: 8 }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.accent },
  scroll: { flexGrow: 1 },
  topBg: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl + 20 },
  sub: { fontSize: 15, color: "rgba(255,255,255,0.85)", marginBottom: SPACING.md, paddingHorizontal: 4 },
  formCard: { backgroundColor: COLORS.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.lg, marginTop: -24, flex: 1 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: COLORS.text, marginBottom: 12, marginTop: 6 },
  roleGrid: { gap: 10, marginBottom: SPACING.md },
  roleCard: { borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.border, padding: 14, backgroundColor: COLORS.white },
  roleCardActive: { borderColor: COLORS.primary, backgroundColor: "#EEF2FF" },
  roleIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "#EEF2FF", marginBottom: 8 },
  roleIconActive: { backgroundColor: COLORS.primary },
  roleLabel: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  roleHelp: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
  inlineLabel: { fontSize: 13, fontWeight: "700", color: COLORS.text, marginBottom: 8 },
  optionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: SPACING.md },
  pill: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.grayLight },
  pillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pillText: { fontSize: 13, fontWeight: "700", color: COLORS.textSecondary },
  pillTextActive: { color: COLORS.white },
  routeChoice: { width: "100%", borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, padding: 12, backgroundColor: COLORS.grayLight },
  routeChoiceActive: { borderColor: COLORS.primary, backgroundColor: "#EEF2FF" },
  routeChoiceTitle: { fontSize: 13, fontWeight: "800", color: COLORS.text },
  routeChoiceText: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
  error: { color: COLORS.error, fontSize: 13, textAlign: "center", marginBottom: 8, fontWeight: "500" },
});
