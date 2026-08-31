import { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { Card, EmptyView, ErrorView, Field, LoadingView, PrimaryButton, SecondaryButton } from "../../components/Common";
import { DatePicker, OptionPicker } from "../../components/Pickers";
import { colors, radius, spacing, type } from "../../theme/theme";
import { todayISO } from "../../utils/dates";

const STATUSES = ["Present", "Absent", "Late", "Half Day", "Excused"];

interface ClassRecord {
  id: number;
  class_name: string;
  section?: string;
}

/** One row of `/attendance/roster` — a student plus whatever is already marked. */
interface RosterEntry {
  student_id: number;
  student_name: string;
  roll_no?: string | null;
  attendance_id?: number | null;
  status?: string | null;
  remarks?: string | null;
  source?: string | null;
}

export default function AttendanceScreen() {
  const [classes, setClasses] = useState<ClassRecord[] | null>(null);
  const [classesError, setClassesError] = useState<string | null>(null);
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(todayISO());

  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [pending, setPending] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  const loadClasses = useCallback(async () => {
    setClassesError(null);
    try {
      setClasses(await api.get<ClassRecord[]>("/classes/"));
    } catch (e) {
      setClassesError(e instanceof ApiError ? String(e.message) : "Failed to load classes.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadClasses();
    }, [loadClasses])
  );

  const selected = useMemo(
    () => (classes || []).find((c) => String(c.id) === classId) || null,
    [classes, classId]
  );

  /**
   * One request for exactly this class on exactly this day. The screen used to
   * download every student and every attendance row in the school on each
   * focus and filter them in JS, which does not survive a real roll.
   */
  const loadRoster = useCallback(async () => {
    if (!selected) {
      setRoster(null);
      return;
    }
    setLoadingRoster(true);
    setRosterError(null);
    try {
      const rows = await api.get<RosterEntry[]>("/attendance/roster", {
        class_id: selected.id,
        attendance_date: date,
        section: selected.section || undefined,
      });
      setRoster(rows);
    } catch (e) {
      setRoster(null);
      setRosterError(e instanceof ApiError ? String(e.message) : "Failed to load the class roster.");
    } finally {
      setLoadingRoster(false);
    }
  }, [selected, date]);

  useFocusEffect(
    useCallback(() => {
      loadRoster();
    }, [loadRoster])
  );

  const classOptions = useMemo(
    () =>
      (classes || []).map((c) => ({
        label: [c.class_name, c.section].filter(Boolean).join(" "),
        value: String(c.id),
      })),
    [classes]
  );

  const unmarkedCount = useMemo(
    () => (roster || []).filter((r) => !(pending[r.student_id] ?? r.status)).length,
    [roster, pending]
  );

  // Changing what is being marked discards the marks in flight — but only on a
  // deliberate change, never on a plain refocus, which used to silently throw
  // away a half-taken roll.
  function pickClass(next: string) {
    setClassId(next);
    setPending({});
  }

  function pickDate(next: string) {
    setDate(next);
    setPending({});
  }

  function setStatus(studentId: number, status: string) {
    setPending((prev) => ({ ...prev, [studentId]: status }));
  }

  /** Fills every row that has no status yet — the common case for a full class. */
  function markRestPresent() {
    if (!roster) return;
    setPending((prev) => {
      const next = { ...prev };
      roster.forEach((r) => {
        if (!(next[r.student_id] ?? r.status)) next[r.student_id] = "Present";
      });
      return next;
    });
  }

  /**
   * One `/attendance/bulk` call, not a request per student. The old loop issued
   * N sequential writes and, when one failed halfway, left the class half
   * marked with no indication of where it stopped. The bulk route also updates
   * an already-marked student instead of 400ing, which is what re-opening a
   * day's roll to fix a mistake needs.
   */
  async function saveAll() {
    const entries = Object.entries(pending);
    if (!entries.length) {
      Alert.alert("Nothing to save", "Pick a status for at least one student.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/attendance/bulk", {
        attendance_date: date,
        class_id: selected?.id,
        entries: entries.map(([studentId, status]) => ({ student_id: Number(studentId), status })),
      });
      setPending({});
      await loadRoster();
      Alert.alert("Saved", `Attendance recorded for ${entries.length} student${entries.length === 1 ? "" : "s"}.`);
    } catch (e) {
      Alert.alert("Error", e instanceof ApiError ? String(e.message) : "Could not save attendance.");
    } finally {
      setSaving(false);
    }
  }

  if (!classes && !classesError) return <LoadingView />;
  if (classesError && !classes) return <ErrorView message={classesError} onRetry={loadClasses} />;

  const pendingCount = Object.keys(pending).length;

  return (
    <View style={styles.container}>
      <View style={styles.filters}>
        <Field label="Class">
          <OptionPicker
            label="Class"
            options={classOptions}
            value={classId}
            onChange={pickClass}
            placeholder="Choose a class"
          />
        </Field>
        <Field label="Date">
          <DatePicker label="Date" value={date} onChange={pickDate} required />
        </Field>
      </View>

      {!selected ? (
        <EmptyView message="Choose a class to take its attendance." />
      ) : loadingRoster ? (
        <LoadingView />
      ) : rosterError ? (
        <ErrorView message={rosterError} onRetry={loadRoster} />
      ) : !roster?.length ? (
        <EmptyView message="No active students in this class." />
      ) : (
        <FlatList
          data={roster}
          keyExtractor={(r) => String(r.student_id)}
          contentContainerStyle={{ padding: spacing(4) }}
          ListHeaderComponent={
            unmarkedCount > 0 ? (
              <SecondaryButton
                title={`Mark remaining ${unmarkedCount} present`}
                onPress={markRestPresent}
                style={{ marginBottom: spacing(3) }}
              />
            ) : null
          }
          renderItem={({ item }) => {
            const current = pending[item.student_id] ?? item.status ?? "";
            const changed = pending[item.student_id] !== undefined;
            return (
              <Card style={{ marginBottom: spacing(2.5) }}>
                <Text style={styles.name}>
                  {item.student_name}
                  {item.roll_no ? <Text style={styles.muted}> (Roll {item.roll_no})</Text> : null}
                </Text>
                {item.source === "Biometric" && !changed ? (
                  <Text style={styles.source}>Marked from a biometric punch</Text>
                ) : null}
                <View style={styles.chipRow}>
                  {STATUSES.map((s) => (
                    <Pressable
                      key={s}
                      onPress={() => setStatus(item.student_id, s)}
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

      {selected && roster?.length ? (
        <View style={styles.footer}>
          <PrimaryButton
            title={pendingCount ? `Save attendance (${pendingCount})` : "Save attendance"}
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
  name: { ...type.body, fontWeight: "700", color: colors.text, marginBottom: spacing(2) },
  muted: { color: colors.textMuted, fontWeight: "400" },
  source: { ...type.caption, color: colors.textMuted, marginTop: -spacing(1), marginBottom: spacing(2) },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing(2) },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...type.caption, color: colors.text },
  chipTextActive: { color: colors.onPrimary },
  footer: { padding: spacing(4), borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
});
