import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { ErrorView, LoadingView } from "../../components/Common";
import { colors, spacing } from "../../theme/theme";
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

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
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
      <Text style={styles.welcome}>Welcome, {user?.name}</Text>
      <Text style={styles.schoolName}>{user?.account?.name || user?.account?.account_code}</Text>

      <View style={styles.grid}>
        <StatTile label="Total students" value={summary.total_students ?? "—"} />
        <StatTile label="Active students" value={summary.active_students ?? "—"} />
        <StatTile label="Teachers" value={summary.total_teachers ?? "—"} />
        <StatTile label="Classes" value={summary.total_classes ?? "—"} />
        <StatTile label="Fee collected" value={summary.total_collection != null ? `₹${summary.total_collection}` : "—"} />
        <StatTile label="Fee due" value={summary.total_due != null ? `₹${summary.total_due}` : "—"} />
        <StatTile label="Collection %" value={summary.collection_percentage != null ? `${summary.collection_percentage}%` : "—"} />
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
  container: { padding: spacing(4) },
  welcome: { fontSize: 20, fontWeight: "800", color: colors.text },
  schoolName: { fontSize: 14, color: colors.textMuted, marginBottom: spacing(4) },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing(3) },
  tile: {
    width: "47%",
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing(4),
    borderWidth: 1,
    borderColor: colors.border,
  },
  tileValue: { fontSize: 24, fontWeight: "800", color: colors.primaryDark },
  tileLabel: { fontSize: 13, color: colors.textMuted, marginTop: spacing(1) },
});
