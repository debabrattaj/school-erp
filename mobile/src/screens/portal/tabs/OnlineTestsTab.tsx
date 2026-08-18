import React, { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../../api/client";
import { Badge, Card, EmptyView, ErrorView, LoadingView } from "../../../components/Common";
import { colors, spacing, type } from "../../../theme/theme";

interface PortalTest {
  id: number;
  subject?: string;
  title: string;
  description?: string;
  duration_minutes?: number;
  starts_at?: string;
  ends_at?: string;
  total_marks?: number;
  question_count?: number;
  is_open?: boolean;
  attempt_status?: string | null;
  score?: number | null;
  max_score?: number | null;
}

export default function OnlineTestsTab({ studentId }: { studentId: number }) {
  const [tests, setTests] = useState<PortalTest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setTests(await api.get<PortalTest[]>(`/portal/students/${studentId}/online-tests`));
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load online tests.");
    }
  }, [studentId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!tests) return <LoadingView />;
  if (!tests.length) return <EmptyView message="No online tests published yet." />;

  return (
    <FlatList
      data={tests}
      keyExtractor={(t) => String(t.id)}
      contentContainerStyle={{ padding: spacing(4) }}
      renderItem={({ item }) => {
        const graded = item.attempt_status === "Graded" || item.score != null;
        return (
          <Card style={{ marginBottom: spacing(2.5) }}>
            <View style={styles.header}>
              <Text style={styles.title}>{item.title}</Text>
              <Badge
                text={graded ? "Completed" : item.is_open ? "Open" : item.attempt_status || "Closed"}
                tone={graded ? "success" : item.is_open ? "warning" : "default"}
              />
            </View>
            <Text style={styles.meta}>
              {[
                item.subject,
                item.question_count != null ? `${item.question_count} questions` : null,
                item.total_marks != null ? `${item.total_marks} marks` : null,
                item.duration_minutes ? `${item.duration_minutes} min` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
            {graded && item.score != null ? (
              <Text style={styles.score}>
                Scored {item.score}
                {item.max_score != null ? ` / ${item.max_score}` : ""}
              </Text>
            ) : null}
            {/* Taking a test is web-only for now — the mobile app shows status and results. */}
            {item.is_open && !graded ? (
              <Text style={styles.hint}>Open this test on the web portal to attempt it.</Text>
            ) : null}
          </Card>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing(2) },
  title: { ...type.heading, color: colors.text, flex: 1 },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  description: { ...type.body, color: colors.text, marginTop: spacing(2) },
  score: { ...type.body, color: colors.success, fontWeight: "700", marginTop: spacing(2) },
  hint: { ...type.caption, color: colors.textMuted, marginTop: spacing(2), fontStyle: "italic" },
});
