
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity, TextInput, ActivityIndicator } from "react-native";
import { Ionicons, AntDesign } from "@expo/vector-icons";
import { useDispatch, useSelector } from "react-redux";
import { registerUser, googleSignIn } from "../../store/slices/authSlice";
import { fetchBusRoutes } from "../../store/slices/busRoutesSlice";
import Button from "../../components/common/Button";
import { COLORS, SPACING } from "../../constants";
import { SafeAreaView } from "react-native-safe-area-context";
import { useGoogleAuthRequest } from "../../services/firebaseAuth";

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

function SimpleField({
  label,
  leftIcon,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  autoCorrect,
  textContentType,
  maxLength,
  inputMode,
  editable = true,
}) {
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.inputWrap, !editable && styles.inputDisabled]}>
        {leftIcon ? <View style={styles.icon}>{leftIcon}</View> : null}
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={COLORS.gray}
          value={value ?? ""}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          textContentType={textContentType}
          maxLength={maxLength}
          inputMode={inputMode}
          editable={editable}
        />
      </View>
    </View>
  );
}

export default function RegisterScreen({ navigation }) {
  const dispatch = useDispatch();
  const { loading, error, isAuthenticated, user } = useSelector(s => s.auth);
  const liveRoutes = useSelector((state) => state.busRoutes.routes);
  const availableRoutes = liveRoutes;
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showGoogleSignUpModal, setShowGoogleSignUpModal] = useState(false);
  const [selectedRoleForGoogle, setSelectedRoleForGoogle] = useState("user");
  const { promptAsync } = useGoogleAuthRequest();
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

  // Watch for auth state changes for debugging
  useEffect(() => {
    console.log("[RegisterScreen] Auth state updated - isAuthenticated:", isAuthenticated, "user:", user?.email, "loading:", loading, "error:", error);
    if (error) {
      console.log("[RegisterScreen] Registration error:", error);
      Alert.alert("Registration Failed", error);
    }
  }, [isAuthenticated, user, loading, error]);

  // Explicitly watch for successful registration
  useEffect(() => {
    if (isAuthenticated && user) {
      console.log("[RegisterScreen] ✓ SUCCESS: User authenticated, navigating to role page. User:", {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      });
    }
  }, [isAuthenticated, user?.id]);

  const handleGoogleSignUp = async () => {
    if (!promptAsync) {
      Alert.alert("Error", "Google sign-up is not available at the moment");
      return;
    }

    setGoogleLoading(true);
    try {
      dispatch(googleSignIn(promptAsync, selectedRoleForGoogle));
      setShowGoogleSignUpModal(false);
    } catch (err) {
      Alert.alert("Error", err.message || "Google sign-up failed");
    } finally {
      setGoogleLoading(false);
    }
  };

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
      if (form.vehicleType === "bus" && availableRoutes.length === 0) {
        Alert.alert("Routes Unavailable", "Bus routes are not available right now. Please try again later.");
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
      <View style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <View style={styles.bgOrb} pointerEvents="none" />
            <View style={styles.bgOrbAlt} pointerEvents="none" />
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.9}>
              <Ionicons name="arrow-back" size={18} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.heroTitle}>Create account</Text>
            <Text style={styles.heroSub}>Set up your profile to start booking rides and bus seats.</Text>
          </View>
          <View style={styles.formCard}>
            <Text style={styles.sectionTitle}>Quick Sign Up</Text>
            <TouchableOpacity
              style={[styles.googleButton, googleLoading && styles.googleButtonDisabled]}
              onPress={() => setShowGoogleSignUpModal(true)}
              disabled={googleLoading}
              activeOpacity={0.8}
            >
              {googleLoading ? (
                <ActivityIndicator color={COLORS.text} size="small" />
              ) : (
                <>
                  <AntDesign name="google" size={20} color="#EA4335" />
                  <Text style={styles.googleButtonText}>Sign up with Google</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.dividerContainer}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>Or fill details below</Text>
              <View style={styles.divider} />
            </View>

            <Text style={styles.sectionTitle}>Choose Role</Text>
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
            <SimpleField
              label="Full Name"
              placeholder="Your full name"
              value={form.name}
              onChangeText={v => update("name", v)}
              autoCapitalize="words"
              textContentType="name"
              leftIcon={<Ionicons name="person" size={20} color={COLORS.gray} />}
            />
            <SimpleField
              label="Email"
              placeholder="you@example.com"
              value={form.email}
              onChangeText={v => update("email", v)}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              leftIcon={<Ionicons name="mail" size={20} color={COLORS.gray} />}
            />
            <SimpleField
              label="Phone"
              placeholder="10-digit mobile number"
              value={form.phone}
              onChangeText={v => update("phone", String(v || "").replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={10}
              textContentType="telephoneNumber"
              leftIcon={<Ionicons name="call" size={20} color={COLORS.gray} />}
            />
            <SimpleField
              label="City"
              placeholder="Your city"
              value={form.city}
              onChangeText={v => update("city", v)}
              autoCapitalize="words"
              leftIcon={<Ionicons name="business" size={20} color={COLORS.gray} />}
            />
            <SimpleField
              label="Emergency Contact"
              placeholder="Emergency mobile number"
              value={form.emergencyContact}
              onChangeText={v => update("emergencyContact", String(v || "").replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={10}
              textContentType="telephoneNumber"
              leftIcon={<Ionicons name="medkit" size={20} color={COLORS.gray} />}
            />

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
                <SimpleField
                  label="Vehicle Number"
                  placeholder="PB-01-AB-1234"
                  value={form.vehicleNo}
                  onChangeText={v => update("vehicleNo", String(v || "").toUpperCase())}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  leftIcon={<Ionicons name="car-sport" size={20} color={COLORS.gray} />}
                />
                <SimpleField
                  label="License Number"
                  placeholder="Driver license number"
                  value={form.licenseNumber}
                  onChangeText={v => update("licenseNumber", String(v || "").toUpperCase())}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  leftIcon={<Ionicons name="card" size={20} color={COLORS.gray} />}
                />
                {form.vehicleType === "bus" ? (
                  <>
                    <Text style={styles.inlineLabel}>Bus Route</Text>
                    {availableRoutes.length === 0 ? (
                      <View style={styles.routeEmpty}>
                        <Ionicons name="alert-circle" size={18} color={COLORS.warning} />
                        <Text style={styles.routeEmptyText}>No bus routes are available yet. Please contact an admin.</Text>
                      </View>
                    ) : (
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
                    )}
                  </>
                ) : null}
              </>
            ) : null}

            {form.role === "admin" ? (
              <>
                <Text style={styles.sectionTitle}>Admin Details</Text>
                <SimpleField
                  label="Employee ID"
                  placeholder="Official employee ID"
                  value={form.employeeId}
                  onChangeText={v => update("employeeId", String(v || "").toUpperCase())}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  leftIcon={<Ionicons name="id-card" size={20} color={COLORS.gray} />}
                />
                <SimpleField
                  label="Organization"
                  placeholder="Company or institution name"
                  value={form.organization}
                  onChangeText={v => update("organization", v)}
                  autoCapitalize="words"
                  leftIcon={<Ionicons name="briefcase" size={20} color={COLORS.gray} />}
                />
              </>
            ) : null}

            <Text style={styles.sectionTitle}>Security</Text>
            <SimpleField
              label="Password"
              placeholder="Create a password"
              value={form.password}
              onChangeText={v => update("password", v)}
              secureTextEntry
              textContentType="newPassword"
              autoCapitalize="none"
              leftIcon={<Ionicons name="lock-closed" size={20} color={COLORS.gray} />}
            />
            <SimpleField
              label="Confirm Password"
              placeholder="Re-enter password"
              value={form.confirm}
              onChangeText={v => update("confirm", v)}
              secureTextEntry
              textContentType="newPassword"
              autoCapitalize="none"
              leftIcon={<Ionicons name="lock-closed" size={20} color={COLORS.gray} />}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button title={`Create ${form.role.charAt(0).toUpperCase() + form.role.slice(1)} Account`} onPress={handleRegister} loading={loading} variant="success" style={{ marginTop: 8 }} />
          </View>
        </ScrollView>
      </View>

      {showGoogleSignUpModal && (
        <View style={styles.modalOverlay} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => !googleLoading && setShowGoogleSignUpModal(false)}
            disabled={googleLoading}
          />
          <View style={styles.modalContent} pointerEvents="auto">
            <ScrollView
              showsVerticalScrollIndicator={true}
              contentContainerStyle={styles.modalScrollContent}
              scrollEnabled={true}
            >
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => !googleLoading && setShowGoogleSignUpModal(false)}
                disabled={googleLoading}
              >
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>

              <Text style={styles.modalTitle}>Select Your Role</Text>
              <Text style={styles.modalSubtitle}>Choose how you want to use Ghoomo</Text>

              <View style={styles.roleSelectGrid}>
                {ROLE_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.key}
                    style={[
                      styles.roleSelectCard,
                      selectedRoleForGoogle === option.key && styles.roleSelectCardActive,
                    ]}
                    onPress={() => !googleLoading && setSelectedRoleForGoogle(option.key)}
                    disabled={googleLoading}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.roleSelectIcon, selectedRoleForGoogle === option.key && styles.roleSelectIconActive]}>
                      <Ionicons
                        name={option.icon}
                        size={24}
                        color={selectedRoleForGoogle === option.key ? COLORS.white : COLORS.primary}
                      />
                    </View>
                    <Text style={styles.roleSelectLabel}>{option.label}</Text>
                    <Text style={styles.roleSelectHelp}>{option.help}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Button
                title="Continue with Google"
                onPress={handleGoogleSignUp}
                loading={googleLoading}
                variant="success"
                style={{ marginTop: 16 }}
              />
              <Button
                title="Cancel"
                onPress={() => setShowGoogleSignUpModal(false)}
                disabled={googleLoading}
                style={{ marginTop: 12, backgroundColor: COLORS.border }}
              />
            </ScrollView>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.grayLight },
  scroll: { flexGrow: 1, paddingBottom: SPACING.xxl },
  hero: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl + 4, paddingBottom: SPACING.md, overflow: "hidden" },
  bgOrb: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "#DBEAFE",
    top: -70,
    right: -60,
  },
  bgOrbAlt: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "#F1F5F9",
    bottom: -40,
    left: -30,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.md,
  },
  heroTitle: { fontSize: 26, fontWeight: "900", color: COLORS.text },
  heroSub: { fontSize: 14, color: COLORS.textSecondary, marginTop: 6, maxWidth: 320 },
  formCard: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: SPACING.lg,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: COLORS.text, marginBottom: 12, marginTop: 6 },
  field: { marginBottom: SPACING.md },
  label: { fontSize: 13, fontWeight: "700", color: COLORS.text, marginBottom: 8, letterSpacing: 0.2 },
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
  inputDisabled: { opacity: 0.7 },
  icon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, color: COLORS.text },
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
  routeEmpty: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFF7ED", padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#FED7AA" },
  routeEmptyText: { flex: 1, fontSize: 12, color: "#9A3412", fontWeight: "600" },
  error: { color: COLORS.error, fontSize: 13, textAlign: "center", marginBottom: 8, fontWeight: "500" },
  dividerContainer: { flexDirection: "row", alignItems: "center", marginVertical: SPACING.md, gap: 12 },
  divider: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: "500" },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#DCDCDC",
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: SPACING.sm,
  },
  googleButtonDisabled: { opacity: 0.6 },
  googleButtonText: { fontSize: 15, fontWeight: "600", color: COLORS.text },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    justifyContent: "flex-end",
    pointerEvents: "box-none",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    zIndex: 0,
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: SPACING.lg,
    maxHeight: "80%",
    zIndex: 1,
  },
  modalScrollContent: {
    paddingBottom: SPACING.xl,
  },
  modalClose: {
    alignSelf: "flex-end",
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.inputBg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.md,
  },
  modalTitle: { fontSize: 20, fontWeight: "800", color: COLORS.text, marginBottom: 6 },
  modalSubtitle: { fontSize: 14, color: COLORS.textSecondary, marginBottom: SPACING.lg },
  roleSelectGrid: { gap: 12, marginBottom: SPACING.lg },
  roleSelectCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    padding: 16,
    backgroundColor: COLORS.white,
    alignItems: "center",
  },
  roleSelectCardActive: { borderColor: COLORS.primary, backgroundColor: "#EEF2FF" },
  roleSelectIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF",
    marginBottom: 10,
  },
  roleSelectIconActive: { backgroundColor: COLORS.primary },
  roleSelectLabel: { fontSize: 16, fontWeight: "700", color: COLORS.text, marginBottom: 4 },
  roleSelectHelp: { fontSize: 12, color: COLORS.textSecondary },
});
