import React, { useCallback, useMemo, useState } from "react";
import { SectionList, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../../api/client";
import { EmptyView, ErrorView, LoadingView } from "../../../components/Common";
import { colors, radius, spacing, type } from "../../../theme/theme";

interface Entry {
  day_of_week: string;
  period_no: number;
  entry_type?: string;
  label?: string;
  start_time?: string;
  end_time?: string;
  subject?: string;
  teacher_name?: string;
  room?: string;
}

const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function TimetableTab({ studentId }: { studentId: number }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setEntries(await api.get<Entry[]>(`/portal/students/${studentId}/timetable`));
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load timetable.");
    }
  }, [studentId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const sections = useMemo(() => {
    const byDay = new Map<string, Entry[]>();
    for (const e of entries || []) {
      if (!byDay.has(e.day_of_week)) byDay.set(e.day_of_week, []);
      byDay.get(e.day_of_week)!.push(e);
    }
    return Array.from(byDay, ([title, data]) => ({ title, data })).sort(
      (a, b) => DAY_ORDER.indexOf(a.title) - DAY_ORDER.indexOf(b.title)
    );
  }, [entries]);

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!entries) return <LoadingView />;
  if (!entries.length) return <EmptyView message="No timetable published yet." />;

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item, i) => `${item.day_of_week}-${item.period_no}-${i}`}
      contentContainerStyle={{ padding: spacing(4) }}
      renderSectionHeader={({ section }) => <Text style={styles.day}>{section.title}</Text>}
      renderItem={({ item }) => {
        // Breaks and assemblies come through as non-"period" entries with a
        // label instead of a subject.
        const isBreak = item.entry_type && item.entry_type !== "period";
        return (
          <View style={[styles.row, isBreak && styles.breakRow]}>
            <View style={styles.periodBadge}>
              <Text style={styles.periodText}>{isBreak ? "—" : item.period_no}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.subject}>{isBreak ? item.label || "Break" : item.subject || "—"}</Text>
              <Text style={styles.meta}>
                {[
                  item.start_time && item.end_time ? `${item.start_time}–${item.end_time}` : null,
                  item.teacher_name,
                  item.room && `Room ${item.room}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  day: { ...type.overline, color: colors.primary, marginTop: spacing(4), marginBottom: spacing(2) },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing(3.5),
    marginBottom: spacing(2),
    borderWidth: 1,
    borderColor: colors.border,
  },
  breakRow: { backgroundColor: colors.surfaceAlt },
  periodBadge: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryTint,
    alignItems: "center",
    justifyContent: "center",
  },
  periodText: { ...type.caption, color: colors.primary, fontWeight: "800" },
  subject: { ...type.body, color: colors.text, fontWeight: "600" },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
});
