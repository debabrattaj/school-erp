import React, { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { AppTextInput, Card, EmptyView, ErrorView, Field, LoadingView, PrimaryButton, SecondaryButton } from "../../components/Common";
import { DatePicker } from "../../components/Pickers";
import RecordPicker, { PickerButton } from "../../components/RecordPicker";
import { useAcademicYear } from "../../modules/useAcademicYear";
import { colors, spacing, type } from "../../theme/theme";

interface ClassRecord {
  id: number;
  class_name: string;
  section: string;
  class_teacher?: string;
  room_no?: string;
}

interface Student {
  id: number;
  class_id?: number;
  class_name?: string;
  section?: string;
  first_name: string;
  last_name?: string;
  admission_no?: string;
  roll_no?: string;
  student_status?: string;
}

interface Subject {
  id: number;
  subject_name: string;
  subject_code?: string;
}

interface Teacher {
  id: number;
  name: string;
  department?: string;
}

interface ClassSubject {
  id: number;
  subject_id?: number;
  subject_name?: string;
  teacher_id?: number;
  academic_year: string;
  weekly_periods?: number;
}

interface Exam {
  id: number;
  exam_name: string;
}

interface ClassExamMapping {
  id: number;
  exam_id: number;
  academic_year: string;
  exam_date?: string;
  remarks?: string;
}

const TABS = ["Details", "Students", "Subjects", "Exams"] as const;
type Tab = (typeof TABS)[number];

export default function ClassDetailScreen({ route, navigation }: { route: any; navigation: any }) {
  const { id } = route.params;
  const classId = Number(id);
  const [tab, setTab] = useState<Tab>("Details");

  const [classRecord, setClassRecord] = useState<ClassRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setClassRecord(await api.get<ClassRecord>(`/classes/${classId}`));
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load this class.");
    }
  }, [classId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!classRecord) return <LoadingView />;

  return (
    <View style={styles.container}>
      <View style={styles.tabBarWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
          {TABS.map((t) => (
            <Pressable key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={{ flex: 1 }}>
        {tab === "Details" && <DetailsTab classRecord={classRecord} navigation={navigation} classId={classId} />}
        {tab === "Students" && <StudentsTab classRecord={classRecord} />}
        {tab === "Subjects" && <SubjectsTab classId={classId} />}
        {tab === "Exams" && <ExamsTab classId={classId} />}
      </View>
    </View>
  );
}

function DetailsTab({ classRecord, navigation, classId }: { classRecord: ClassRecord; navigation: any; classId: number }) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card>
        <DetailRow label="Class" value={classRecord.class_name} />
        <DetailRow label="Section" value={classRecord.section} />
        <DetailRow label="Class Teacher" value={classRecord.class_teacher || "—"} />
        <DetailRow label="Room" value={classRecord.room_no || "—"} />
      </Card>
      <PrimaryButton title="Edit class" onPress={() => navigation.navigate("classesForm", { id: classId })} style={{ marginTop: spacing(3) }} />
    </ScrollView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginBottom: spacing(3.5) }}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function studentLabel(s: Student) {
  return [s.first_name, s.last_name].filter(Boolean).join(" ");
}

function StudentsTab({ classRecord }: { classRecord: ClassRecord }) {
  const [students, setStudents] = useState<Student[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      // GET /students/ takes no filter parameters, so the narrowing has to
      // happen below, on class_id where the record carries one.
      setStudents(await api.get<Student[]>("/students/"));
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load students.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const classStudents = useMemo(() => {
    if (!students) return [];
    return students.filter((s) =>
      s.class_id ? s.class_id === classRecord.id : s.class_name === classRecord.class_name && s.section === classRecord.section
    );
  }, [students, classRecord]);

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!students) return <LoadingView />;

  return (
    <FlatList
      data={classStudents}
      keyExtractor={(s) => String(s.id)}
      contentContainerStyle={styles.content}
      ListHeaderComponent={<Text style={styles.count}>{classStudents.length} student{classStudents.length === 1 ? "" : "s"}</Text>}
      ListEmptyComponent={<EmptyView message="No students in this class yet." />}
      renderItem={({ item }) => (
        <Card style={{ marginBottom: spacing(2.5) }}>
          <Text style={styles.name}>{studentLabel(item)}</Text>
          <Text style={styles.meta}>
            {[item.admission_no, item.roll_no && `Roll ${item.roll_no}`, item.student_status].filter(Boolean).join(" · ")}
          </Text>
        </Card>
      )}
    />
  );
}

const emptySubjectForm = { subject: null as Subject | null, teacher: null as Teacher | null, academicYear: "", weeklyPeriods: "" };

function SubjectsTab({ classId }: { classId: number }) {
  // Read from the school's settings rather than a hardcoded literal, which went
  // stale the moment the school rolled over to a new year.
  const currentYear = useAcademicYear();
  const [mappings, setMappings] = useState<ClassSubject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptySubjectForm);
  const [pick, setPick] = useState<"subject" | "teacher" | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setMappings(await api.get<ClassSubject[]>("/class-subjects/", { class_id: classId }));
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load subjects.");
    }
  }, [classId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function submit() {
    if (!form.subject) {
      Alert.alert("Missing details", "Choose a subject.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/class-subjects/", {
        class_id: classId,
        subject_id: form.subject.id,
        subject_name: form.subject.subject_name,
        teacher_id: form.teacher?.id,
        academic_year: form.academicYear.trim() || currentYear || undefined,
        weekly_periods: form.weeklyPeriods ? Number(form.weeklyPeriods) : undefined,
      });
      setForm(emptySubjectForm);
      setAdding(false);
      await load();
    } catch (e) {
      Alert.alert("Could not add subject", e instanceof ApiError && typeof e.detail === "string" ? e.detail : "The server refused the request.");
    } finally {
      setSaving(false);
    }
  }

  function remove(m: ClassSubject) {
    Alert.alert("Remove this subject?", m.subject_name || "", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/class-subjects/${m.id}`);
            await load();
          } catch (e) {
            Alert.alert("Error", e instanceof ApiError ? String(e.message) : "Could not remove this subject.");
          }
        },
      },
    ]);
  }

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!mappings) return <LoadingView />;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={mappings}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            {adding ? (
              <Card style={{ marginBottom: spacing(3) }}>
                <Field label="Subject" required>
                  <PickerButton label="Subject" value={form.subject?.subject_name || null} onPress={() => setPick("subject")} />
                </Field>
                <Field label="Teacher">
                  <PickerButton label="Teacher" value={form.teacher?.name || null} onPress={() => setPick("teacher")} />
                </Field>
                <Field label="Academic year">
                  <AppTextInput
                    value={form.academicYear}
                    onChangeText={(v) => setForm((f) => ({ ...f, academicYear: v }))}
                    placeholder={currentYear || "e.g. 2026-27"}
                  />
                </Field>
                <Field label="Weekly periods">
                  <AppTextInput value={form.weeklyPeriods} onChangeText={(v) => setForm((f) => ({ ...f, weeklyPeriods: v }))} keyboardType="numeric" />
                </Field>
                <PrimaryButton title="Add subject" onPress={submit} loading={saving} style={{ marginTop: spacing(2) }} />
                <SecondaryButton title="Cancel" onPress={() => setAdding(false)} style={{ marginTop: spacing(2) }} />
              </Card>
            ) : (
              <PrimaryButton title="+ Add subject" onPress={() => setAdding(true)} style={{ marginBottom: spacing(3) }} />
            )}
          </View>
        }
        ListEmptyComponent={<EmptyView message="No subjects mapped to this class yet." />}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing(2.5) }}>
            <Text style={styles.name}>{item.subject_name}</Text>
            <Text style={styles.meta}>
              {item.academic_year}
              {item.weekly_periods ? ` · ${item.weekly_periods} periods/week` : ""}
            </Text>
            <SecondaryButton title="Remove" onPress={() => remove(item)} style={{ marginTop: spacing(2.5) }} />
          </Card>
        )}
      />

      <RecordPicker<Subject>
        visible={pick === "subject"}
        onClose={() => setPick(null)}
        title="Choose subject"
        endpoint="/subjects"
        labelFor={(s) => s.subject_name}
        subtitleFor={(s) => s.subject_code || ""}
        searchFields={["subject_name", "subject_code"]}
        onPick={(s) => setForm((f) => ({ ...f, subject: s }))}
      />
      <RecordPicker<Teacher>
        visible={pick === "teacher"}
        onClose={() => setPick(null)}
        title="Choose teacher"
        endpoint="/teachers"
        labelFor={(t) => t.name}
        subtitleFor={(t) => t.department || ""}
        searchFields={["name", "department"]}
        onPick={(t) => setForm((f) => ({ ...f, teacher: t }))}
      />
    </View>
  );
}

const emptyExamForm = { exam: null as Exam | null, academicYear: "", examDate: "", remarks: "" };

function ExamsTab({ classId }: { classId: number }) {
  const currentYear = useAcademicYear();
  const [mappings, setMappings] = useState<ClassExamMapping[] | null>(null);
  const [examNames, setExamNames] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyExamForm);
  const [pickExam, setPickExam] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [rows, exams] = await Promise.all([
        api.get<ClassExamMapping[]>("/class-exam-mappings/", { class_id: classId }),
        api.get<Exam[]>("/exams/"),
      ]);
      setMappings(rows);
      setExamNames(Object.fromEntries(exams.map((e) => [e.id, e.exam_name])));
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load exams.");
    }
  }, [classId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function submit() {
    if (!form.exam) {
      Alert.alert("Missing details", "Choose an exam.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/class-exam-mappings/", {
        class_id: classId,
        exam_id: form.exam.id,
        academic_year: form.academicYear.trim() || currentYear || undefined,
        exam_date: form.examDate || undefined,
        remarks: form.remarks.trim() || undefined,
      });
      setForm(emptyExamForm);
      setAdding(false);
      await load();
    } catch (e) {
      Alert.alert("Could not add exam", e instanceof ApiError && typeof e.detail === "string" ? e.detail : "The server refused the request.");
    } finally {
      setSaving(false);
    }
  }

  function remove(m: ClassExamMapping) {
    Alert.alert("Remove this exam mapping?", examNames[m.exam_id] || "", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/class-exam-mappings/${m.id}`);
            await load();
          } catch (e) {
            Alert.alert("Error", e instanceof ApiError ? String(e.message) : "Could not remove this mapping.");
          }
        },
      },
    ]);
  }

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!mappings) return <LoadingView />;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={mappings}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            {adding ? (
              <Card style={{ marginBottom: spacing(3) }}>
                <Field label="Exam" required>
                  <PickerButton label="Exam" value={form.exam?.exam_name || null} onPress={() => setPickExam(true)} />
                </Field>
                <Field label="Academic year">
                  <AppTextInput
                    value={form.academicYear}
                    onChangeText={(v) => setForm((f) => ({ ...f, academicYear: v }))}
                    placeholder={currentYear || "e.g. 2026-27"}
                  />
                </Field>
                <Field label="Exam date">
                  <DatePicker label="Exam date" value={form.examDate} onChange={(v) => setForm((f) => ({ ...f, examDate: v }))} />
                </Field>
                <Field label="Remarks">
                  <AppTextInput value={form.remarks} onChangeText={(v) => setForm((f) => ({ ...f, remarks: v }))} multiline />
                </Field>
                <PrimaryButton title="Add exam" onPress={submit} loading={saving} style={{ marginTop: spacing(2) }} />
                <SecondaryButton title="Cancel" onPress={() => setAdding(false)} style={{ marginTop: spacing(2) }} />
              </Card>
            ) : (
              <PrimaryButton title="+ Add exam" onPress={() => setAdding(true)} style={{ marginBottom: spacing(3) }} />
            )}
          </View>
        }
        ListEmptyComponent={<EmptyView message="No exams mapped to this class yet." />}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing(2.5) }}>
            <Text style={styles.name}>{examNames[item.exam_id] || `Exam #${item.exam_id}`}</Text>
            <Text style={styles.meta}>
              {item.academic_year}
              {item.exam_date ? ` · ${item.exam_date}` : ""}
            </Text>
            {item.remarks ? <Text style={styles.meta}>{item.remarks}</Text> : null}
            <SecondaryButton title="Remove" onPress={() => remove(item)} style={{ marginTop: spacing(2.5) }} />
          </Card>
        )}
      />

      <RecordPicker<Exam>
        visible={pickExam}
        onClose={() => setPickExam(false)}
        title="Choose exam"
        endpoint="/exams"
        labelFor={(e) => e.exam_name}
        searchFields={["exam_name"]}
        onPick={(e) => setForm((f) => ({ ...f, exam: e }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  tabBarWrap: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBar: { paddingHorizontal: spacing(2) },
  tab: {
    paddingVertical: spacing(3.5),
    paddingHorizontal: spacing(4),
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { ...type.label, color: colors.textMuted },
  tabTextActive: { color: colors.primary },
  content: { padding: spacing(4) },
  detailLabel: { ...type.caption, color: colors.textMuted, textTransform: "uppercase" },
  detailValue: { ...type.body, color: colors.text, marginTop: 2, fontSize: 16 },
  count: { ...type.caption, color: colors.textMuted, marginBottom: spacing(3) },
  name: { ...type.heading, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
});
