
import React, { useState, useRef } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useDispatch, useSelector } from "react-redux";
import { loginUser } from "../../store/slices/authSlice";
import Button from "../../components/common/Button";
import Input from "../../components/common/Input";
import { COLORS, SPACING } from "../../constants";
import { SafeAreaView } from "react-native-safe-area-context";

export default function LoginScreen({ navigation }) {
  const dispatch = useDispatch();
  const { loading, error } = useSelector(s => s.auth);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = () => {
    if (!email || !password) {
      Alert.alert("Error", "Please fill all fields");
      return;
    }
    dispatch(loginUser(email.trim().toLowerCase(), password));
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "none"}
        >
          <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.topBg}>
            <View style={styles.logoRow}>
              <View style={styles.iconCircle}>
                <Ionicons name="car" size={32} color={COLORS.white} />
              </View>
              <Text style={styles.appName}>Ghoomo</Text>
            </View>
            <Text style={styles.greeting}>Welcome Back!</Text>
            <Text style={styles.sub}>Sign in to continue your journey</Text>
          </LinearGradient>

          <View style={styles.formCard}>
            <Input
              label="Email Address"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              leftIcon={<Ionicons name="mail" size={20} color={COLORS.gray} />}
            />
            <Input
              label="Password"
              placeholder="Enter password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              leftIcon={<Ionicons name="lock-closed" size={20} color={COLORS.gray} />}
            />
            {error && <Text style={styles.error}>{error}</Text>}

            <Button title="Sign In" onPress={handleLogin} loading={loading} style={{ marginTop: 8 }} />

            <View style={styles.divider}>
              <View style={styles.divLine} />
              <Text style={styles.divText}>Demo Accounts</Text>
              <View style={styles.divLine} />
            </View>

            <View style={styles.demoGrid}>
              {[
                { label: "User", email: "rahul@ghoomo.com", icon: "person" },
                { label: "Driver", email: "driver@ghoomo.com", icon: "car-sport" },
                { label: "Bus Driver", email: "busdriver@ghoomo.com", icon: "bus" },
                { label: "Admin", email: "admin@ghoomo.com", icon: "shield" },
              ].map(d => (
                <TouchableOpacity key={d.email} style={styles.demoBtn} onPress={() => { setEmail(d.email); setPassword(d.label === "Admin" ? "admin123" : "123456"); }}>
                  <Ionicons name={d.icon} size={18} color={COLORS.primary} />
                  <Text style={styles.demoLabel}>{d.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity onPress={() => navigation.navigate("Register")} style={styles.registerRow}>
              <Text style={styles.registerText}>Don't have an account? </Text>
              <Text style={styles.registerLink}>Register</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.primary },
  scroll: { flexGrow: 1 },
  topBg: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl, paddingBottom: SPACING.xxl + 20 },
  logoRow: { flexDirection: "row", alignItems: "center", marginBottom: SPACING.lg },
  iconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center", marginRight: 12 },
  appName: { fontSize: 28, fontWeight: "900", color: COLORS.white, letterSpacing: 1 },
  greeting: { fontSize: 28, fontWeight: "800", color: COLORS.white, marginBottom: 6 },
  sub: { fontSize: 15, color: "rgba(255,255,255,0.8)" },
  formCard: { backgroundColor: COLORS.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.lg, marginTop: -24, flex: 1, minHeight: 400 },
  error: { color: COLORS.error, fontSize: 13, textAlign: "center", marginBottom: 8, fontWeight: "500" },
  divider: { flexDirection: "row", alignItems: "center", marginVertical: SPACING.md },
  divLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  divText: { marginHorizontal: 12, fontSize: 12, color: COLORS.textSecondary, fontWeight: "600" },
  demoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: SPACING.md },
  demoBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: COLORS.grayLight, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.border },
  demoLabel: { fontSize: 13, fontWeight: "600", color: COLORS.primary },
  registerRow: { flexDirection: "row", justifyContent: "center", marginTop: SPACING.md, paddingBottom: SPACING.md },
  registerText: { fontSize: 14, color: COLORS.textSecondary },
  registerLink: { fontSize: 14, color: COLORS.primary, fontWeight: "700" },
});
