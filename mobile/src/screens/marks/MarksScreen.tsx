import { useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { showAlert } from "../../utils/alert";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import {
  AppTextInput,
  Card,
  EmptyView,
  ErrorView,
  Field,
  LoadingView,
  PrimaryButton,
} from "../../components/Common";
import { OptionPicker } from "../../components/Pickers";
import { colors, spacing, type } from "../../theme/theme";

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
  /** The backend column is `subject_name`; older payloads used `subject`. */
  subject_name?: string;
  subject?: string;
  marks_obtained: number;
  max_marks?: number;
  total_marks?: number;
}

function markSubject(m: Mark) {
  return m.subject_name ?? m.subject ?? "";
}

function markTotal(m: Mark) {
  return m.total_marks ?? m.max_marks;
}

function studentName(s: Student) {
  return [s.first_name, s.last_name].filter(Boolean).join(" ");
}

export default function MarksScreen() {
  const [exams, setExams] = useState<Exam[] | null>(null);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [examId, setExamId] = useState("");
  const [subject, setSubject] = useState("");
  const [maxMarks, setMaxMarks] = useState("100");

  const [students, setStudents] = useState<Student[] | null>(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  /**
   * Exams and the subject vocabulary only. The class roll and its marks are
   * fetched per exam below — this screen used to pull every student and every
   * mark in the school and re-pull all of it each time a different exam chip
   * was tapped.
   */
  const loadShell = useCallback(async () => {
    setError(null);
    try {
      const [examList, subjectMeta] = await Promise.all([
        api.get<Exam[]>("/exams/"),
        // The backend rejects a subject outside this list with a 400, so the
        // field is a picker over it rather than the free text it was.
        api.get<{ subjects?: string[] }>("/marks/metadata/subjects").catch(() => ({ subjects: [] })),
      ]);
      setExams(examList);
      setSubjects(subjectMeta?.subjects || []);
      setExamId((prev) => prev || (examList.length ? String(examList[0].id) : ""));
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load exams.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadShell();
    }, [loadShell])
  );

  const selectedExam = useMemo(
    () => (exams || []).find((e) => String(e.id) === examId) || null,
    [exams, examId]
  );

  const loadSheet = useCallback(async () => {
    if (!selectedExam) {
      setStudents(null);
      setMarks([]);
      return;
    }
    setLoadingSheet(true);
    setSheetError(null);
    try {
      const [studentList, markList] = await Promise.all([
        // Narrowed to the exam's own class and section rather than pulling the
        // whole student table and filtering it here.
        api.get<Student[]>("/students/", {
          class_name: selectedExam.class_name || undefined,
          section: selectedExam.section || undefined,
          student_status: "Active",
        }),
        api.get<Mark[]>("/marks/", { exam_id: selectedExam.id }),
      ]);
      setStudents(studentList);
      setMarks(markList);
    } catch (e) {
      setStudents(null);
      setSheetError(e instanceof ApiError ? String(e.message) : "Failed to load the marks sheet.");
    } finally {
      setLoadingSheet(false);
    }
  }, [selectedExam]);

  useFocusEffect(
    useCallback(() => {
      loadSheet();
    }, [loadSheet])
  );

  const examOptions = useMemo(
    () =>
      (exams || []).map((e) => ({
        label: e.exam_name,
        value: String(e.id),
        subtitle: [e.class_name, e.section].filter(Boolean).join(" ") || undefined,
      })),
    [exams]
  );

  const subjectOptions = useMemo(() => subjects.map((s) => ({ label: s, value: s })), [subjects]);

  const classStudents = useMemo(() => {
    if (!selectedExam || !students) return [];
    // The server has already narrowed these; this is a backstop for an exam
    // that carries no class, where the request could not filter.
    return students.filter((s) => {
      if (selectedExam.class_name && s.class_name?.toLowerCase() !== selectedExam.class_name.toLowerCase()) return false;
      if (selectedExam.section && s.section?.toLowerCase() !== selectedExam.section.toLowerCase()) return false;
      return true;
    });
  }, [students, selectedExam]);

  const marksByStudent = useMemo(() => {
    const map: Record<number, Mark> = {};
    marks
      .filter((m) => !subject || markSubject(m).toLowerCase() === subject.toLowerCase())
      .forEach((m) => {
        map[m.student_id] = m;
      });
    return map;
  }, [marks, subject]);

  function pickExam(next: string) {
    setExamId(next);
    setPending({});
  }

  function pickSubject(next: string) {
    setSubject(next);
    setPending({});
  }

  async function saveAll() {
    const total = Number(maxMarks);
    if (!selectedExam || !subject) {
      showAlert("Missing info", "Select an exam and a subject.");
      return;
    }
    if (!Number.isFinite(total) || total <= 0) {
      showAlert("Invalid total", "Max marks must be a number greater than zero.");
      return;
    }

    const entries = Object.entries(pending).filter(([, v]) => v.trim() !== "");
    if (!entries.length) {
      showAlert("Nothing to save", "Enter marks for at least one student.");
      return;
    }

    // The backend rejects these with a 400 one row at a time; catching them here
    // means the whole sheet isn't half-saved before the first bad row is found.
    const invalid = entries.filter(([, v]) => {
      const n = Number(v);
      return !Number.isFinite(n) || n < 0 || n > total;
    });
    if (invalid.length) {
      showAlert(
        "Marks out of range",
        `${invalid.length} entr${invalid.length === 1 ? "y is" : "ies are"} not a number between 0 and ${total}.`
      );
      return;
    }

    setSaving(true);
    const failures: string[] = [];
    for (const [studentIdStr, raw] of entries) {
      const studentId = Number(studentIdStr);
      const obtained = Number(raw);
      const existing = marksByStudent[studentId];
      try {
        if (existing) {
          await api.put(`/marks/${existing.id}`, { marks_obtained: obtained, total_marks: total });
        } else {
          await api.post("/marks/", {
            student_id: studentId,
            exam_id: selectedExam.id,
            subject_name: subject,
            marks_obtained: obtained,
            total_marks: total,
          });
        }
      } catch (e) {
        // One bad row must not abandon the rest of the sheet — the old loop
        // threw on the first failure and left the teacher guessing which
        // students had saved.
        const name = classStudents.find((s) => s.id === studentId);
        failures.push(`${name ? studentName(name) : `#${studentId}`}: ${e instanceof ApiError ? e.message : "failed"}`);
      }
    }
    setSaving(false);

    setPending({});
    await loadSheet();

    if (failures.length) {
      showAlert(
        `Saved ${entries.length - failures.length} of ${entries.length}`,
        failures.slice(0, 6).join("\n") + (failures.length > 6 ? `\n…and ${failures.length - 6} more.` : "")
      );
    } else {
      showAlert("Saved", `Marks recorded for ${entries.length} student${entries.length === 1 ? "" : "s"}.`);
    }
  }

  if (!exams && !error) return <LoadingView />;
  if (error && !exams) return <ErrorView message={error} onRetry={loadShell} />;

  const pendingCount = Object.keys(pending).filter((k) => (pending[Number(k)] ?? "").trim() !== "").length;

  return (
    <View style={styles.container}>
      <View style={styles.filters}>
        <Field label="Exam">
          <OptionPicker
            label="Exam"
            options={examOptions}
            value={examId}
            onChange={pickExam}
            placeholder="Choose an exam"
          />
        </Field>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field label="Subject">
              <OptionPicker
                label="Subject"
                options={subjectOptions}
                value={subject}
                onChange={pickSubject}
                placeholder="Choose a subject"
              />
            </Field>
          </View>
          <View style={{ width: 92 }}>
            <Field label="Out of">
              <AppTextInput
                value={maxMarks}
                onChangeText={setMaxMarks}
                keyboardType="numeric"
                placeholder="100"
                style={{ textAlign: "center" }}
              />
            </Field>
          </View>
        </View>
      </View>

      {!selectedExam ? (
        <EmptyView message="Choose an exam to enter marks." />
      ) : !subject ? (
        <EmptyView message="Choose a subject to enter marks." />
      ) : loadingSheet ? (
        <LoadingView />
      ) : sheetError ? (
        <ErrorView message={sheetError} onRetry={loadSheet} />
      ) : classStudents.length === 0 ? (
        <EmptyView message="No students found for this exam's class and section." />
      ) : (
        <FlatList
          data={classStudents}
          keyExtractor={(s) => String(s.id)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: spacing(4) }}
          renderItem={({ item }) => {
            const existing = marksByStudent[item.id];
            const value = pending[item.id] ?? (existing ? String(existing.marks_obtained) : "");
            return (
              <Card style={styles.studentRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{studentName(item)}</Text>
                  <Text style={styles.muted}>
                    {item.admission_no}
                    {existing ? ` · saved ${existing.marks_obtained}/${markTotal(existing) ?? "?"}` : ""}
                  </Text>
                </View>
                <AppTextInput
                  value={value}
                  onChangeText={(v) => setPending((prev) => ({ ...prev, [item.id]: v }))}
                  keyboardType="numeric"
                  placeholder="—"
                  style={styles.marksInput}
                />
              </Card>
            );
          }}
        />
      )}

      {selectedExam && subject && classStudents.length > 0 ? (
        <View style={styles.footer}>
          <PrimaryButton
            title={pendingCount ? `Save marks (${pendingCount})` : "Save marks"}
            onPress={saveAll}
            loading={saving}
            disabled={pendingCount === 0}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  filters: { paddingHorizontal: spacing(4), paddingTop: spacing(4) },
  row: { flexDirection: "row", gap: spacing(3) },
  studentRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing(2.5) },
  name: { ...type.body, fontWeight: "700", color: colors.text },
  muted: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  marksInput: { width: 76, textAlign: "center" },
  footer: { padding: spacing(4), borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
});
