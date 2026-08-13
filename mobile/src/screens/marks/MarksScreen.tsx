import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { AppTextInput, Card, ErrorView, LoadingView, PrimaryButton } from "../../components/Common";
import { colors, spacing } from "../../theme/theme";

interface Exam {
  id: number;
  exam_name: string;
  class_name?: string;
  section?: string;
}

interface Student {
  id: number;
  first_name: string;
  last_name?: string;
  admission_no: string;
  class_name?: string;
  section?: string;
}

interface Mark {
  id: number;
  student_id: number;
  exam_id: number;
  subject: string;
  marks_obtained: number;
  max_marks?: number;
}

export default function MarksScreen() {
  const [exams, setExams] = useState<Exam[] | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [examId, setExamId] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [maxMarks, setMaxMarks] = useState("100");
  const [pending, setPending] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [examList, studentList, markList] = await Promise.all([
        api.get<Exam[]>("/exams/"),
        api.get<Student[]>("/students/"),
        api.get<Mark[]>("/marks/"),
      ]);
      setExams(examList);
      setStudents(studentList);
      setMarks(markList);
      if (!examId && examList.length) setExamId(examList[0].id);
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load marks data.");
    }
  }, [examId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const selectedExam = exams?.find((e) => e.id === examId) || null;

  const classStudents = useMemo(() => {
    if (!selectedExam) return [];
    return students.filter((s) => {
      if (selectedExam.class_name && s.class_name?.toLowerCase() !== selectedExam.class_name.toLowerCase()) return false;
      if (selectedExam.section && s.section?.toLowerCase() !== selectedExam.section.toLowerCase()) return false;
      return true;
    });
  }, [students, selectedExam]);

  const marksByStudent = useMemo(() => {
    const map: Record<number, Mark> = {};
    marks
      .filter((m) => m.exam_id === examId && (!subject || m.subject === subject))
      .forEach((m) => {
        map[m.student_id] = m;
      });
    return map;
  }, [marks, examId, subject]);

  async function saveAll() {
    if (!examId || !subject.trim()) {
      Alert.alert("Missing info", "Select an exam and enter a subject.");
      return;
    }
    const entries = Object.entries(pending);
    if (!entries.length) {
      Alert.alert("Nothing to save", "Enter marks for at least one student.");
      return;
    }
    setSaving(true);
    try {
      for (const [studentIdStr, marksStr] of entries) {
        const studentId = Number(studentIdStr);
        const marksObtained = Number(marksStr);
        if (Number.isNaN(marksObtained)) continue;
        const existing = marksByStudent[studentId];
        if (existing) {
          await api.put(`/marks/${existing.id}`, { marks_obtained: marksObtained, max_marks: Number(maxMarks) || 100 });
        } else {
          await api.post("/marks/", {
            student_id: studentId,
            exam_id: examId,
            subject,
            marks_obtained: marksObtained,
            max_marks: Number(maxMarks) || 100,
          });
        }
      }
      setPending({});
      await load();
      Alert.alert("Saved", "Marks updated.");
    } catch (e) {
      Alert.alert("Error", e instanceof ApiError ? String(e.message) : "Could not save marks.");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!exams) return <LoadingView />;

  return (
    <View style={styles.container}>
      <View style={styles.filters}>
        <View style={styles.examPicker}>
          <FlatList
            horizontal
            data={exams}
            keyExtractor={(e) => String(e.id)}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <Text
                onPress={() => setExamId(item.id)}
                style={[styles.examChip, examId === item.id && styles.examChipActive]}
              >
                {item.exam_name}
              </Text>
            )}
          />
        </View>
        <View style={styles.row2}>
          <AppTextInput value={subject} onChangeText={setSubject} placeholder="Subject" style={{ flex: 1 }} />
          <AppTextInput
            value={maxMarks}
            onChangeText={setMaxMarks}
            placeholder="Max"
            keyboardType="numeric"
            style={{ width: 70 }}
          />
        </View>
      </View>

      {!subject.trim() ? (
        <ErrorView message="Enter a subject to enter marks." />
      ) : classStudents.length === 0 ? (
        <ErrorView message="No students found for this exam's class/section." />
      ) : (
        <FlatList
          data={classStudents}
          keyExtractor={(s) => String(s.id)}
          contentContainerStyle={{ padding: spacing(4) }}
          renderItem={({ item }) => {
            const existing = marksByStudent[item.id];
            const value = pending[item.id] ?? (existing ? String(existing.marks_obtained) : "");
            return (
              <Card style={styles.studentRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>
                    {item.first_name} {item.last_name || ""}
                  </Text>
                  <Text style={styles.muted}>{item.admission_no}</Text>
                </View>
                <AppTextInput
                  value={value}
                  onChangeText={(v) => setPending((prev) => ({ ...prev, [item.id]: v }))}
                  keyboardType="numeric"
                  placeholder="Marks"
                  style={styles.marksInput}
                />
              </Card>
            );
          }}
        />
      )}

      <View style={styles.footer}>
        <PrimaryButton title={`Save marks (${Object.keys(pending).length})`} onPress={saveAll} loading={saving} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  filters: { padding: spacing(4), gap: spacing(2) },
  examPicker: { marginBottom: spacing(2) },
  examChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(2),
    marginRight: spacing(2),
    color: colors.text,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  examChipActive: { backgroundColor: colors.primary, borderColor: colors.primary, color: "#fff" },
  row2: { flexDirection: "row", gap: spacing(2) },
  studentRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing(2.5) },
  name: { fontSize: 15, fontWeight: "700", color: colors.text },
  muted: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  marksInput: { width: 70, textAlign: "center" },
  footer: { padding: spacing(4), borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
});
