import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Card from "../../components/common/Card";
import Button from "../../components/common/Button";
import { COLORS, SPACING, BOOKING_STATUS } from "../../constants";
import { driverUpdateRideStatus } from "../../store/slices/driverSlice";

export default function DriverOtpScreen({ navigation, route }) {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.auth.user);
  const dashboard = useSelector((state) => state.driver.dashboard);
  const [enteredOtp, setEnteredOtp] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const rideIdFromParams = route?.params?.rideId || null;
  const ride = useMemo(() => {
    const rides = dashboard?.assignedRides || [];
    if (rideIdFromParams) {
      const byId = rides.find((item) => item.id === rideIdFromParams);
      if (byId) return byId;
    }
    return (
      dashboard?.activeRide ||
      rides.find((item) => item.status === BOOKING_STATUS.ARRIVED) ||
      rides.find((item) => item.status === BOOKING_STATUS.ACCEPTED) ||
      null
    );
  }, [dashboard?.activeRide, dashboard?.assignedRides, rideIdFromParams]);

  const handleVerifyOtp = async () => {
    if (!ride?.id) {
      Alert.alert("Ride Missing", "No active arrived ride found for OTP verification.");
      return;
    }
    if (enteredOtp.trim().length < 4) {
      Alert.alert("Invalid OTP", "Please enter the 4-digit OTP shared by the rider.");
      return;
    }

    setSubmitting(true);
    try {
      await dispatch(
        driverUpdateRideStatus(user.id, ride.id, BOOKING_STATUS.IN_PROGRESS, {
          otp: enteredOtp.trim(),
        })
      );
      Alert.alert("Ride Started", "OTP verified. Trip is now in progress.", [
        {
          text: "OK",
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error) {
      Alert.alert("OTP Verification Failed", error.message || "Please check OTP and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <View style={styles.container}>
          <View style={styles.headerRow}>
            <Button title="Back" onPress={() => navigation.goBack()} variant="outline" style={styles.backBtn} />
            <Text style={styles.title}>OTP Verification</Text>
            <View style={styles.backBtnPlaceholder} />
          </View>

          <Card elevated style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name="shield-checkmark" size={34} color={COLORS.primary} />
            </View>
            <Text style={styles.cardTitle}>Enter Rider OTP</Text>
            <Text style={styles.cardSub}>
              {ride?.pickup?.name && ride?.drop?.name
                ? `${ride.pickup.name} to ${ride.drop.name}`
                : "Verify rider OTP to start this trip"}
            </Text>

            <TextInput
              style={styles.otpField}
              placeholder="4-digit OTP"
              placeholderTextColor={COLORS.gray}
              value={enteredOtp}
              onChangeText={(value) => setEnteredOtp(value.replace(/[^0-9]/g, "").slice(0, 4))}
              keyboardType={Platform.OS === "android" ? "numeric" : "number-pad"}
              maxLength={4}
              returnKeyType="done"
              autoCorrect={false}
              autoCapitalize="none"
              textContentType="oneTimeCode"
              importantForAutofill="yes"
              selectTextOnFocus
              showSoftInputOnFocus
            />

            <View style={styles.actionRow}>
              <Button
                title={submitting ? "Verifying..." : "Verify OTP & Start Ride"}
                onPress={handleVerifyOtp}
                variant="success"
                style={{ flex: 1 }}
                disabled={submitting || enteredOtp.trim().length < 4}
              />
            </View>
          </Card>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  container: { flex: 1, padding: SPACING.md },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SPACING.md },
  backBtn: { minWidth: 84 },
  backBtnPlaceholder: { width: 84 },
  title: { fontSize: 20, fontWeight: "800", color: COLORS.text },
  card: { marginTop: SPACING.md, padding: SPACING.lg },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primary + "15",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: SPACING.sm,
  },
  cardTitle: { fontSize: 18, fontWeight: "800", color: COLORS.text, textAlign: "center" },
  cardSub: { fontSize: 13, color: COLORS.textSecondary, textAlign: "center", marginTop: 6, marginBottom: SPACING.md },
  otpField: {
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.white,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "android" ? 12 : 14,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 10,
    color: COLORS.text,
    textAlign: "center",
  },
  actionRow: { marginTop: SPACING.md },
});
