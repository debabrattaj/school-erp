import React, { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../../api/client";
import { Badge, Card, ErrorView, LoadingView } from "../../../components/Common";
import { colors, spacing } from "../../../theme/theme";
import { AttendanceResponse } from "../../../modules/portalTypes";

function statusTone(status?: string): "success" | "danger" | "warning" | "default" {
  if (status === "Present") return "success";
  if (status === "Absent") return "danger";
  if (status === "Late" || status === "Half Day") return "warning";
  return "default";
}

export default function AttendanceTab({ studentId }: { studentId: number }) {
  const [data, setData] = useState<AttendanceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get<AttendanceResponse>(`/portal/students/${studentId}/attendance`);
      setData(res);
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load attendance.");
    }
  }, [studentId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!data) return <LoadingView />;

  return (
    <FlatList
      data={data.records}
      keyExtractor={(_, i) => String(i)}
      contentContainerStyle={{ padding: spacing(4) }}
      ListHeaderComponent={
        <Card style={{ marginBottom: spacing(4) }}>
          <View style={styles.summaryRow}>
            <Text style={styles.percentage}>{data.attendance_percentage != null ? `${data.attendance_percentage}%` : "—"}</Text>
            <Text style={styles.muted}>{data.total_days} days recorded</Text>
          </View>
          <View style={styles.countsRow}>
            <Text style={styles.countText}>Present: {data.counts.Present ?? 0}</Text>
            <Text style={styles.countText}>Absent: {data.counts.Absent ?? 0}</Text>
            <Text style={styles.countText}>Late: {data.counts.Late ?? 0}</Text>
            <Text style={styles.countText}>Half Day: {data.counts["Half Day"] ?? 0}</Text>
          </View>
        </Card>
      }
      renderItem={({ item }) => (
        <View style={styles.logRow}>
          <Text style={styles.date}>{item.date}</Text>
          <Badge text={item.status || "—"} tone={statusTone(item.status)} />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  summaryRow: { alignItems: "center", marginBottom: spacing(3) },
  percentage: { fontSize: 32, fontWeight: "800", color: colors.primaryDark },
  muted: { color: colors.textMuted, fontSize: 13 },
  countsRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: spacing(2) },
  countText: { fontSize: 13, color: colors.text },
  logRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing(3),
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  date: { color: colors.text, fontSize: 14 },
});
