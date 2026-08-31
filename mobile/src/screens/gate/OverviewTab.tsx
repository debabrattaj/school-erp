import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { Card, ErrorView, LoadingView } from "../../components/Common";
import { colors, radius, spacing, type } from "../../theme/theme";

interface Summary {
  date: string;
  visitors_today: number;
  visitors_on_campus: number;
  students_out: number;
  staff_out: number;
  overdue_returns: number;
  active_blocks: number;
}

const TILES: { key: Exclude<keyof Summary, "date">; label: string; danger?: boolean }[] = [
  { key: "visitors_on_campus", label: "Visitors on campus" },
  { key: "visitors_today", label: "Visitors today" },
  { key: "students_out", label: "Students out" },
  { key: "staff_out", label: "Staff out" },
  { key: "overdue_returns", label: "Overdue returns", danger: true },
  { key: "active_blocks", label: "Active blocks", danger: true },
];

export default function OverviewTab() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSummary(await api.get<Summary>("/gate/summary"));
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load gate summary.");
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
    <ScrollView contentContainerStyle={styles.grid}>
      {TILES.map((t) => (
        <Card key={t.key} style={styles.tile}>
          <Text style={[styles.value, t.danger && summary[t.key] > 0 && styles.valueDanger]}>
            {summary[t.key]}
          </Text>
          <Text style={styles.label}>{t.label}</Text>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grid: { padding: spacing(4), flexDirection: "row", flexWrap: "wrap", gap: spacing(3) },
  tile: { width: "47%", alignItems: "flex-start", borderRadius: radius.lg },
  value: { ...type.display, color: colors.text },
  valueDanger: { color: colors.danger },
  label: { ...type.caption, color: colors.textMuted, marginTop: spacing(1) },
});
