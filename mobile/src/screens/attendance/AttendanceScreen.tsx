import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { AppTextInput, Card, ErrorView, LoadingView, PrimaryButton } from "../../components/Common";
import { colors, spacing } from "../../theme/theme";
import { todayISO } from "../../utils/dates";

const STATUSES = ["Present", "Absent", "Late", "Half Day", "Excused"];

interface Student {
  id: number;
  first_name: string;
  last_name?: string;
  admission_no: string;
  class_name?: string;
  section?: string;
}

interface AttendanceRecord {
  id: number;
  student_id: number;
  attendance_date: string;
  status: string;
}


export default function AttendanceScreen() {
  const [students, setStudents] = useState<Student[] | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [classFilter, setClassFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [date, setDate] = useState(todayISO());
  const [pending, setPending] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [studentList, attendanceList] = await Promise.all([
        api.get<Student[]>("/students/"),
        api.get<AttendanceRecord[]>("/attendance/"),
      ]);
      setStudents(studentList);
      setRecords(attendanceList);
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load attendance data.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filteredStudents = useMemo(() => {
    if (!students) return [];
    return students.filter((s) => {
      if (classFilter && s.class_name?.toLowerCase() !== classFilter.toLowerCase()) return false;
      if (sectionFilter && s.section?.toLowerCase() !== sectionFilter.toLowerCase()) return false;
      return true;
    });
  }, [students, classFilter, sectionFilter]);

  const recordsByStudent = useMemo(() => {
    const map: Record<number, AttendanceRecord> = {};
    records
      .filter((r) => r.attendance_date === date)
      .forEach((r) => {
        map[r.student_id] = r;
      });
    return map;
  }, [records, date]);

  function setStatus(studentId: number, status: string) {
    setPending((prev) => ({ ...prev, [studentId]: status }));
  }

  async function saveAll() {
    const entries = Object.entries(pending);
    if (!entries.length) {
      Alert.alert("Nothing to save", "Pick a status for at least one student.");
      return;
    }
    setSaving(true);
    try {
      for (const [studentIdStr, status] of entries) {
        const studentId = Number(studentIdStr);
        const existing = recordsByStudent[studentId];
        if (existing) {
          await api.put(`/attendance/${existing.id}`, { status });
        } else {
          await api.post("/attendance/", { student_id: studentId, attendance_date: date, status });
        }
      }
      setPending({});
      await load();
      Alert.alert("Saved", "Attendance updated.");
    } catch (e) {
      Alert.alert("Error", e instanceof ApiError ? String(e.message) : "Could not save attendance.");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!students) return <LoadingView />;

  return (
    <View style={styles.container}>
      <View style={styles.filters}>
        <AppTextInput
          value={classFilter}
          onChangeText={setClassFilter}
          placeholder="Class (e.g. 5)"
          style={styles.filterInput}
        />
        <AppTextInput
          value={sectionFilter}
          onChangeText={setSectionFilter}
          placeholder="Section (e.g. A)"
          style={styles.filterInput}
        />
        <AppTextInput value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" style={styles.filterInput} />
      </View>

      {filteredStudents.length === 0 ? (
        <ErrorView message="No students match this class/section." />
      ) : (
        <FlatList
          data={filteredStudents}
          keyExtractor={(s) => String(s.id)}
          contentContainerStyle={{ padding: spacing(4) }}
          renderItem={({ item }) => {
            const current = pending[item.id] ?? recordsByStudent[item.id]?.status ?? "";
            return (
              <Card style={{ marginBottom: spacing(2.5) }}>
                <Text style={styles.name}>
                  {item.first_name} {item.last_name || ""} <Text style={styles.muted}>({item.admission_no})</Text>
                </Text>
                <View style={styles.chipRow}>
                  {STATUSES.map((s) => (
                    <Pressable
                      key={s}
                      onPress={() => setStatus(item.id, s)}
                      style={[styles.chip, current === s && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, current === s && styles.chipTextActive]}>{s}</Text>
                    </Pressable>
                  ))}
                </View>
              </Card>
            );
          }}
        />
      )}

      <View style={styles.footer}>
        <PrimaryButton title={`Save attendance (${Object.keys(pending).length})`} onPress={saveAll} loading={saving} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  filters: { flexDirection: "row", padding: spacing(4), gap: spacing(2) },
  filterInput: { flex: 1 },
  name: { fontSize: 15, fontWeight: "700", color: colors.text, marginBottom: spacing(2) },
  muted: { color: colors.textMuted, fontWeight: "400" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing(2) },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: "600", color: colors.text },
  chipTextActive: { color: "#fff" },
  footer: { padding: spacing(4), borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
});
