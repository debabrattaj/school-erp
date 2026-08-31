import React, { useCallback, useState } from "react";
import { Alert, FlatList, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { AppTextInput, Card, EmptyView, ErrorView, Field, LoadingView, PrimaryButton, Row, SecondaryButton } from "../../components/Common";
import RecordPicker, { PickerButton } from "../../components/RecordPicker";
import { colors, spacing, type } from "../../theme/theme";

interface Enrollment {
  id: number;
  device_id?: number;
  device_user_id: string;
  student_id?: number;
  teacher_id?: number;
  is_active: boolean;
}

interface Person {
  id: number;
  name?: string;
  first_name?: string;
  last_name?: string;
  admission_no?: string;
  employee_no?: string;
}

interface Device {
  id: number;
  name: string;
}

function personLabel(p?: Person) {
  if (!p) return undefined;
  return p.name || [p.first_name, p.last_name].filter(Boolean).join(" ");
}

const emptyForm = { deviceUserId: "", personType: "student" as "student" | "teacher", person: null as Person | null };

export default function EnrollmentsTab() {
  const [enrollments, setEnrollments] = useState<Enrollment[] | null>(null);
  const [students, setStudents] = useState<Record<number, Person>>({});
  const [teachers, setTeachers] = useState<Record<number, Person>>({});
  const [devices, setDevices] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [pick, setPick] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [rows, studentList, teacherList, deviceList] = await Promise.all([
        api.get<Enrollment[]>("/biometric/enrollments"),
        api.get<Person[]>("/students/"),
        api.get<Person[]>("/teachers/"),
        api.get<Device[]>("/biometric/devices"),
      ]);
      setEnrollments(rows);
      setStudents(Object.fromEntries(studentList.map((s) => [s.id, s])));
      setTeachers(Object.fromEntries(teacherList.map((t) => [t.id, t])));
      setDevices(Object.fromEntries(deviceList.map((d) => [d.id, d.name])));
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load enrollments.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function resetForm() {
    setForm(emptyForm);
    setAdding(false);
  }

  async function submit() {
    if (!form.deviceUserId.trim() || !form.person) {
      Alert.alert("Missing details", "Provide the device user id and pick a person.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/biometric/enrollments", {
        device_user_id: form.deviceUserId.trim(),
        student_id: form.personType === "student" ? form.person.id : undefined,
        teacher_id: form.personType === "teacher" ? form.person.id : undefined,
      });
      resetForm();
      await load();
    } catch (e) {
      Alert.alert("Could not enroll", e instanceof ApiError && typeof e.detail === "string" ? e.detail : "The server refused the request.");
    } finally {
      setSaving(false);
    }
  }

  function remove(row: Enrollment) {
    Alert.alert("Remove this enrollment?", row.device_user_id, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/biometric/enrollments/${row.id}`);
            await load();
          } catch (e) {
            Alert.alert("Error", e instanceof ApiError ? String(e.message) : "Could not remove this enrollment.");
          }
        },
      },
    ]);
  }

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!enrollments) return <LoadingView />;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={enrollments}
        keyExtractor={(e) => String(e.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            {adding ? (
              <Card style={{ marginBottom: spacing(3) }}>
                <Field label="Device user id" required>
                  <AppTextInput value={form.deviceUserId} onChangeText={(v) => setForm((f) => ({ ...f, deviceUserId: v }))} placeholder="ID as stored on the device" />
                </Field>
                <Field label="Person">
                  <Row style={{ gap: spacing(2), marginBottom: spacing(2) }}>
                    {(["student", "teacher"] as const).map((pt) => (
                      <Text
                        key={pt}
                        onPress={() => setForm((f) => ({ ...f, personType: pt, person: null }))}
                        style={[styles.chip, form.personType === pt && styles.chipActive]}
                      >
                        {pt === "student" ? "Student" : "Teacher"}
                      </Text>
                    ))}
                  </Row>
                  <PickerButton label={form.personType} value={personLabel(form.person || undefined) || null} onPress={() => setPick(true)} />
                </Field>
                <PrimaryButton title="Add enrollment" onPress={submit} loading={saving} style={{ marginTop: spacing(2) }} />
                <SecondaryButton title="Cancel" onPress={resetForm} style={{ marginTop: spacing(2) }} />
              </Card>
            ) : (
              <PrimaryButton title="+ New enrollment" onPress={() => setAdding(true)} style={{ marginBottom: spacing(3) }} />
            )}
          </View>
        }
        ListEmptyComponent={<EmptyView message="No enrollments yet." />}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing(2.5) }}>
            <Text style={styles.name}>
              {item.student_id ? personLabel(students[item.student_id]) || `Student #${item.student_id}` : personLabel(teachers[item.teacher_id!]) || `Teacher #${item.teacher_id}`}
            </Text>
            <Text style={styles.meta}>
              Device user id {item.device_user_id}
              {item.device_id ? ` · ${devices[item.device_id] || `Device #${item.device_id}`}` : " · Any device"}
            </Text>
            <SecondaryButton title="Remove" onPress={() => remove(item)} style={{ marginTop: spacing(2.5) }} />
          </Card>
        )}
      />

      <RecordPicker<Person>
        visible={pick}
        onClose={() => setPick(false)}
        title={form.personType === "teacher" ? "Choose teacher" : "Choose student"}
        endpoint={form.personType === "teacher" ? "/teachers" : "/students"}
        labelFor={(p) => personLabel(p) || `#${p.id}`}
        subtitleFor={(p) => p.admission_no || p.employee_no || ""}
        searchFields={form.personType === "teacher" ? ["name", "employee_no"] : ["first_name", "last_name", "admission_no"]}
        onPick={(p) => setForm((f) => ({ ...f, person: p }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing(4) },
  name: { ...type.heading, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  chip: {
    ...type.caption,
    color: colors.textMuted,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 999,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
    overflow: "hidden",
  },
  chipActive: { backgroundColor: colors.primary, color: colors.onPrimary },
});
