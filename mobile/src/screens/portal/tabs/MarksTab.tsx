import React, { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../../api/client";
import { Card, EmptyView, ErrorView, LoadingView, PrimaryButton } from "../../../components/Common";
import { colors, spacing } from "../../../theme/theme";
import { MarksResponse } from "../../../modules/portalTypes";
import { downloadAndShare } from "../../../api/files";
import { showAlert } from "../../../utils/alert";

export default function MarksTab({ studentId }: { studentId: number }) {
  const [data, setData] = useState<MarksResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get<MarksResponse>(`/portal/students/${studentId}/marks`);
      setData(res);
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load marks.");
    }
  }, [studentId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!data) return <LoadingView />;
  if (!data.exams.length) return <EmptyView message="No exam results yet." />;

  async function downloadResult(releaseId: number, examName?: string, version?: number) {
    setDownloading(releaseId);
    try {
      const safe = (examName || "result").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
      await downloadAndShare(`/portal/students/${studentId}/results/${releaseId}/pdf`, `${safe}-v${version || 1}.pdf`);
    } catch (e) {
      showAlert("Download failed", e instanceof ApiError ? String(e.message) : "Could not download this result.");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <FlatList
      data={data.exams}
      keyExtractor={(_, i) => String(i)}
      contentContainerStyle={{ padding: spacing(4) }}
      renderItem={({ item }) => (
        <Card style={{ marginBottom: spacing(3) }}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.examName}>{item.exam_name}</Text>
              {item.version ? <Text style={styles.version}>Published version {item.version}</Text> : null}
            </View>
            {item.percentage != null && <Text style={styles.percentage}>{item.percentage}%</Text>}
          </View>
          {item.subjects.map((s, idx) => (
            <View key={idx} style={styles.subjectRow}>
              <Text style={styles.subjectName}>{s.subject}</Text>
              <Text style={styles.subjectMarks}>
                {s.assessment_status && s.assessment_status !== "Scored"
                  ? s.assessment_status
                  : `${s.marks_obtained}/${s.max_marks}${s.grade ? ` (${s.grade})` : ""}`}
              </Text>
            </View>
          ))}
          {item.total_obtained != null && (
            <View style={styles.totalRow}>
              <Text style={styles.totalText}>Total</Text>
              <Text style={styles.totalText}>
                {item.total_obtained}/{item.total_max}
              </Text>
            </View>
          )}
          {item.release_id ? (
            <PrimaryButton
              title="Download report card PDF"
              onPress={() => downloadResult(item.release_id!, item.exam_name, item.version)}
              loading={downloading === item.release_id}
              style={{ marginTop: spacing(3) }}
            />
          ) : null}
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing(3) },
  examName: { fontSize: 16, fontWeight: "700", color: colors.text },
  version: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  percentage: { fontSize: 16, fontWeight: "700", color: colors.primaryDark },
  subjectRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing(1.5) },
  subjectName: { color: colors.text, fontSize: 14 },
  subjectMarks: { color: colors.textMuted, fontSize: 14 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing(2),
    paddingTop: spacing(2),
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalText: { fontWeight: "700", color: colors.text },
});
