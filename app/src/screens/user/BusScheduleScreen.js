import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  Image,
  TouchableOpacity,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Header from "../../components/common/Header";
import Card from "../../components/common/Card";
import { COLORS, SPACING, RADIUS, SHADOWS } from "../../constants";
import { api } from "../../services/api";

export default function BusScheduleScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchSchedule();
  }, []);

  const fetchSchedule = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getBusSchedule();
      setSchedule(res?.schedule || null);
    } catch (err) {
      console.error("[BusSchedule] Failed to fetch:", err.message);
      setError("Unable to load bus schedule. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  const pdfDataUri = schedule?.pdfBase64
    ? `data:application/pdf;base64,${schedule.pdfBase64}`
    : null;

  const isWide = width >= 768;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Header
        title="Bus Schedule"
        subtitle="IIT Ropar Official Timings"
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, isWide && styles.scrollContentWide]}
      >
        {/* Info Banner */}
        <LinearGradient
          colors={["#10B981", "#059669"]}
          style={[styles.infoBanner, isWide && styles.infoBannerWide]}
        >
          <View style={styles.infoBannerIcon}>
            <Ionicons name="bus" size={28} color={COLORS.white} />
          </View>
          <View style={styles.infoBannerContent}>
            <Text style={styles.infoBannerTitle}>Official Bus Timings</Text>
            <Text style={styles.infoBannerSub}>
              View the latest bus schedule as published by IIT Ropar administration.
            </Text>
          </View>
        </LinearGradient>

        {loading ? (
          <Card style={styles.centerCard}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading schedule...</Text>
          </Card>
        ) : error ? (
          <Card style={styles.centerCard}>
            <Ionicons name="alert-circle" size={42} color={COLORS.error} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={fetchSchedule}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </Card>
        ) : !schedule ? (
          <Card style={styles.centerCard}>
            <Ionicons name="document-text-outline" size={52} color={COLORS.border} />
            <Text style={styles.emptyTitle}>No Schedule Available</Text>
            <Text style={styles.emptyText}>
              The bus schedule has not been uploaded yet. Please check back later or contact the administration.
            </Text>
          </Card>
        ) : (
          <>
            {/* Schedule Metadata */}
            <Card elevated style={styles.metaCard}>
              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Ionicons name="document-text" size={18} color={COLORS.primary} />
                  <Text style={styles.metaLabel}>{schedule.fileName || "bus_schedule.pdf"}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="time" size={18} color={COLORS.success} />
                  <Text style={styles.metaLabel}>
                    Updated{" "}
                    {schedule.uploadedAt
                      ? new Date(schedule.uploadedAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "Recently"}
                  </Text>
                </View>
              </View>
            </Card>

            {/* PDF Display */}
            {Platform.OS === "web" && pdfDataUri ? (
              <View style={[styles.pdfContainer, isWide && styles.pdfContainerWide]}>
                <iframe
                  src={pdfDataUri}
                  title="Bus Schedule"
                  style={{ width: "100%", height: "100%", border: "none" }}
                />
              </View>
            ) : pdfDataUri ? (
              <Card elevated style={styles.pdfCard}>
                <View style={styles.pdfPlaceholder}>
                  <Ionicons name="document-text" size={48} color={COLORS.primary} />
                  <Text style={styles.pdfPlaceholderTitle}>Bus Schedule PDF</Text>
                  <Text style={styles.pdfPlaceholderText}>
                    The schedule is available as a PDF document. View it using the button below.
                  </Text>
                </View>
              </Card>
            ) : (
              <Card style={styles.centerCard}>
                <Ionicons name="document-outline" size={42} color={COLORS.border} />
                <Text style={styles.emptyText}>Schedule data is not available for preview.</Text>
              </Card>
            )}

            {/* Quick Info Cards */}
            <View style={[styles.quickInfoGrid, isWide && styles.quickInfoGridWide]}>
              <Card elevated style={styles.quickCard}>
                <View style={[styles.quickIcon, { backgroundColor: "#DBEAFE" }]}>
                  <Ionicons name="information-circle" size={22} color={COLORS.primary} />
                </View>
                <Text style={styles.quickTitle}>Free for All</Text>
                <Text style={styles.quickDesc}>
                  Bus service is free for all IIT Ropar students and staff members.
                </Text>
              </Card>
              <Card elevated style={styles.quickCard}>
                <View style={[styles.quickIcon, { backgroundColor: "#DCFCE7" }]}>
                  <Ionicons name="navigate" size={22} color={COLORS.success} />
                </View>
                <Text style={styles.quickTitle}>Live Tracking</Text>
                <Text style={styles.quickDesc}>
                  Track your bus in real-time from the bus routes page.
                </Text>
              </Card>
            </View>
          </>
        )}

        <View style={{ height: SPACING.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.md },
  scrollContentWide: { maxWidth: 800, alignSelf: "center", width: "100%" },
  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    gap: 14,
  },
  infoBannerWide: { padding: SPACING.xl },
  infoBannerIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  infoBannerContent: { flex: 1 },
  infoBannerTitle: { fontSize: 18, fontWeight: "800", color: COLORS.white },
  infoBannerSub: { fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 4, lineHeight: 18 },
  centerCard: { alignItems: "center", paddingVertical: 60, gap: 12 },
  loadingText: { fontSize: 15, color: COLORS.textSecondary, fontWeight: "600" },
  errorText: { fontSize: 14, color: COLORS.error, textAlign: "center", fontWeight: "600" },
  retryBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  retryText: { color: COLORS.white, fontWeight: "700", fontSize: 14 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: COLORS.text, marginTop: 4 },
  emptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 280,
  },
  metaCard: { marginBottom: SPACING.md },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  metaLabel: { fontSize: 13, color: COLORS.textSecondary, fontWeight: "600" },
  pdfContainer: {
    height: 500,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
    ...SHADOWS.card,
  },
  pdfContainerWide: { height: 700 },
  pdfCard: { marginBottom: SPACING.md },
  pdfPlaceholder: { alignItems: "center", paddingVertical: 40, gap: 10 },
  pdfPlaceholderTitle: { fontSize: 16, fontWeight: "800", color: COLORS.text },
  pdfPlaceholderText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 260,
  },
  quickInfoGrid: { flexDirection: "row", gap: 12, marginTop: 4 },
  quickInfoGridWide: {},
  quickCard: { flex: 1, alignItems: "center", paddingVertical: SPACING.lg },
  quickIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  quickTitle: { fontSize: 14, fontWeight: "800", color: COLORS.text, textAlign: "center" },
  quickDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 16,
  },
});
