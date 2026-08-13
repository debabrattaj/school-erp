import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../../api/client";
import { Card, ErrorView, LoadingView } from "../../../components/Common";
import { colors, spacing } from "../../../theme/theme";
import { StudentSummary, studentDisplayName } from "../../../modules/portalTypes";

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

export default function ProfileTab({ studentId }: { studentId: number }) {
  const [data, setData] = useState<StudentSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.get<StudentSummary>(`/portal/students/${studentId}/summary`);
      setData(res);
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load profile.");
    }
  }, [studentId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!data) return <LoadingView />;

  const { student, guardian, current_enrollment } = data;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card>
        <Text style={styles.name}>{studentDisplayName(student)}</Text>
        <Row label="Admission No" value={student.admission_no} />
        <Row label="Status" value={student.student_status} />
        <Row label="House" value={student.house} />
      </Card>

      <Text style={styles.sectionTitle}>Current Enrollment</Text>
      <Card>
        <Row label="Academic Year" value={current_enrollment?.academic_year || data.current_academic_year} />
        <Row label="Class" value={current_enrollment?.class_name} />
        <Row label="Section" value={current_enrollment?.section} />
        <Row label="Roll No" value={current_enrollment?.roll_no} />
      </Card>

      {guardian && (
        <>
          <Text style={styles.sectionTitle}>Guardians</Text>
          <Card>
            <Row label="Father" value={guardian.father_name} />
            <Row label="Mother" value={guardian.mother_name} />
            <Row label="Guardian" value={guardian.guardian_name} />
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(4) },
  name: { fontSize: 20, fontWeight: "800", color: colors.text, marginBottom: spacing(3) },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.textMuted, marginTop: spacing(4), marginBottom: spacing(2), textTransform: "uppercase" },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing(2) },
  label: { color: colors.textMuted, fontSize: 14 },
  value: { color: colors.text, fontSize: 14, fontWeight: "600" },
});
