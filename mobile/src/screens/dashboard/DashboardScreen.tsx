import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { ErrorView, LoadingView } from "../../components/Common";
import { colors, elevation, radius, spacing, type } from "../../theme/theme";
import { useAuth } from "../../auth/AuthContext";

interface Summary {
  total_students?: number;
  active_students?: number;
  total_teachers?: number;
  total_classes?: number;
  total_collection?: number;
  total_due?: number;
  collection_percentage?: number;
  today_attendance_total?: number;
  today_present?: number;
  [key: string]: unknown;
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileValue, accent ? { color: accent } : null]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.get<Summary>("/dashboard/summary");
      setSummary(data);
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load dashboard.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!summary) return <LoadingView />;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>
          {user?.account?.name || user?.account?.account_code || "Your school"}
        </Text>
        <Text style={styles.welcome}>Welcome back, {(user?.name || "").split(" ")[0]}</Text>
      </View>

      <Text style={styles.sectionLabel}>AT A GLANCE</Text>
      <View style={styles.grid}>
        <StatTile label="Total students" value={summary.total_students ?? "—"} />
        <StatTile label="Active students" value={summary.active_students ?? "—"} />
        <StatTile label="Teachers" value={summary.total_teachers ?? "—"} />
        <StatTile label="Classes" value={summary.total_classes ?? "—"} />
      </View>

      <Text style={styles.sectionLabel}>FEES</Text>
      <View style={styles.grid}>
        <StatTile
          label="Fee collected"
          accent={colors.success}
          value={summary.total_collection != null ? `₹${summary.total_collection}` : "—"}
        />
        <StatTile
          label="Fee due"
          accent={colors.danger}
          value={summary.total_due != null ? `₹${summary.total_due}` : "—"}
        />
        <StatTile
          label="Collection %"
          value={summary.collection_percentage != null ? `${summary.collection_percentage}%` : "—"}
        />
        <StatTile
          label="Present today"
          value={
            summary.today_present != null && summary.today_attendance_total != null
              ? `${summary.today_present}/${summary.today_attendance_total}`
              : "—"
          }
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(4), paddingBottom: spacing(10) },

  hero: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    paddingHorizontal: spacing(5),
    paddingVertical: spacing(6),
    marginBottom: spacing(2),
    ...elevation.md,
  },
  eyebrow: { ...type.overline, color: colors.primaryBorder, marginBottom: spacing(1.5) },
  welcome: { ...type.title, color: colors.onPrimary },

  sectionLabel: {
    ...type.overline,
    color: colors.textFaint,
    marginTop: spacing(5),
    marginBottom: spacing(2.5),
  },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing(3) },
  tile: {
    flexGrow: 1,
    flexBasis: "46%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing(4),
    borderWidth: 1,
    borderColor: colors.border,
    ...elevation.sm,
  },
  tileValue: { ...type.title, fontSize: 26, lineHeight: 32, color: colors.text },
  tileLabel: { ...type.caption, color: colors.textMuted, marginTop: spacing(1), fontWeight: "500" },
});
