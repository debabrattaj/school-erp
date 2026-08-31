import React, { useCallback, useState } from "react";
import { ScrollView, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { Badge, Card, ErrorView, LoadingView, Row, SectionLabel } from "../../components/Common";
import { colors, radius, spacing, type } from "../../theme/theme";

interface Coverage {
  units: number;
  units_completed: number;
  percent_covered: number;
  on_schedule: boolean | null;
  expected_percent?: number | null;
  subject_name?: string;
  academic_year?: string;
  overdue_units: { unit_id: number; title: string; planned_end: string; days_late: number; percent: number }[];
}

export default function CoverageTab({ classSubjectId }: { classSubjectId: number }) {
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setCoverage(await api.get<Coverage>("/syllabus/coverage", { class_subject_id: classSubjectId }));
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load coverage.");
    }
  }, [classSubjectId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!coverage) return <LoadingView />;

  const scheduleTone = coverage.on_schedule === null ? "default" : coverage.on_schedule ? "success" : "danger";
  const scheduleLabel = coverage.on_schedule === null ? "No dates set" : coverage.on_schedule ? "On schedule" : "Behind schedule";

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <Text style={styles.percent}>{coverage.percent_covered}%</Text>
          <Badge text={scheduleLabel} tone={scheduleTone} />
        </Row>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${Math.min(100, coverage.percent_covered)}%` }]} />
          {coverage.expected_percent != null ? (
            <View style={[styles.barExpected, { left: `${Math.min(100, coverage.expected_percent)}%` }]} />
          ) : null}
        </View>
        <Text style={styles.meta}>
          {coverage.units_completed}/{coverage.units} units completed
          {coverage.expected_percent != null ? ` · expected ${coverage.expected_percent}% by now` : ""}
        </Text>
      </Card>

      {coverage.overdue_units.length > 0 ? (
        <View style={{ marginTop: spacing(4) }}>
          <SectionLabel>Overdue units</SectionLabel>
          {coverage.overdue_units.map((u) => (
            <Card key={u.unit_id} style={{ marginBottom: spacing(2.5) }}>
              <Text style={styles.unitTitle}>{u.title}</Text>
              <Text style={styles.meta}>
                Due {u.planned_end} · {u.days_late} day{u.days_late === 1 ? "" : "s"} late · {u.percent}% done
              </Text>
            </Card>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing(4) },
  percent: { ...type.display, color: colors.text },
  barTrack: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    marginTop: spacing(3),
    overflow: "visible",
  },
  barFill: { height: 10, borderRadius: radius.pill, backgroundColor: colors.primary },
  barExpected: {
    position: "absolute",
    top: -3,
    width: 2,
    height: 16,
    backgroundColor: colors.text,
  },
  meta: { ...type.caption, color: colors.textMuted, marginTop: spacing(2) },
  unitTitle: { ...type.heading, color: colors.text },
});
