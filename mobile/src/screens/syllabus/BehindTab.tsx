import React, { useCallback, useState } from "react";
import { FlatList, Text, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { Badge, Card, EmptyView, ErrorView, LoadingView, Row } from "../../components/Common";
import { colors, spacing, type } from "../../theme/theme";

interface BehindRow {
  class_subject_id: number;
  class_id: number;
  class_name?: string;
  section?: string;
  subject_name: string;
  academic_year: string;
  percent_covered: number;
  expected_percent?: number | null;
  worst_days_late: number;
  overdue_units: { title: string; days_late: number }[];
}

export default function BehindTab() {
  const [rows, setRows] = useState<BehindRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await api.get<BehindRow[]>("/syllabus/behind"));
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load the behind-schedule report.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!rows) return <LoadingView />;

  const sorted = [...rows].sort((a, b) => b.worst_days_late - a.worst_days_late);

  return (
    <FlatList
      data={sorted}
      keyExtractor={(r) => String(r.class_subject_id)}
      contentContainerStyle={styles.list}
      ListEmptyComponent={<EmptyView message="Nothing is behind schedule." />}
      renderItem={({ item }) => (
        <Card style={{ marginBottom: spacing(2.5) }}>
          <Row style={{ justifyContent: "space-between" }}>
            <Text style={styles.title}>
              {item.subject_name} —{" "}
              {[item.class_name, item.section].filter(Boolean).join(" ") || `Class #${item.class_id}`}
            </Text>
            <Badge text={`${item.worst_days_late}d late`} tone="danger" />
          </Row>
          <Text style={styles.meta}>
            {item.percent_covered}% covered
            {item.expected_percent != null ? ` · expected ${item.expected_percent}%` : ""} · {item.academic_year}
          </Text>
          {item.overdue_units.map((u, i) => (
            <Text key={i} style={styles.overdueUnit}>
              • {u.title} — {u.days_late}d late
            </Text>
          ))}
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing(4) },
  title: { ...type.heading, color: colors.text, flex: 1 },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  overdueUnit: { ...type.caption, color: colors.text, marginTop: spacing(1.5) },
});
