import React, { useCallback, useState } from "react";
import { Alert, FlatList, Modal, Pressable, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { Badge, Card, EmptyView, ErrorView, LoadingView, Row, SecondaryButton } from "../../components/Common";
import { DatePicker } from "../../components/Pickers";
import { useAuth } from "../../auth/AuthContext";
import { canApprove as canApproveFor } from "../../auth/types";
import { colors, elevation, radius, spacing, type } from "../../theme/theme";
import { todayISO } from "../../utils/dates";

interface CoverSlot {
  id: number;
  cover_date: string;
  period_no: number;
  class_name?: string;
  section?: string;
  subject?: string;
  room?: string;
  absent_teacher_id: number;
  absent_teacher?: string;
  substitute_teacher_id?: number;
  substitute_teacher?: string;
  status: string;
  notes?: string;
}

interface Candidate {
  teacher_id: number;
  name: string;
  subject?: string;
  available: boolean;
  teaches_this_subject: boolean;
  unavailable_reason?: string;
}


export default function CoverTab() {
  const { user } = useAuth();
  // Not a hardcoded role pair: the backend restricts this to Admin and
  // Principal by name for built-in roles, but authorizes custom roles by
  // their "staff_leave" manage grant — which the old check locked out.
  const canAssign = canApproveFor(user, "staff_leave");

  const [date, setDate] = useState(todayISO());
  const [slots, setSlots] = useState<CoverSlot[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [candidateSlot, setCandidateSlot] = useState<CoverSlot | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSlots(await api.get<CoverSlot[]>("/leave/cover", { on_date: date }));
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load cover slots.");
    }
  }, [date]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function openCandidates(slot: CoverSlot) {
    setCandidateSlot(slot);
    setCandidates(null);
    setCandidatesError(null);
    try {
      setCandidates(await api.get<Candidate[]>(`/leave/cover/${slot.id}/candidates`));
    } catch (e) {
      setCandidatesError(e instanceof ApiError ? String(e.message) : "Failed to load candidates.");
    }
  }

  async function assign(candidate: Candidate) {
    if (!candidateSlot) return;
    setAssigning(true);
    try {
      await api.post(`/leave/cover/${candidateSlot.id}/assign`, { substitute_teacher_id: candidate.teacher_id });
      setCandidateSlot(null);
      await load();
    } catch (e) {
      Alert.alert(
        "Could not assign",
        e instanceof ApiError && typeof e.detail === "string" ? e.detail : "The server refused the request."
      );
    } finally {
      setAssigning(false);
    }
  }

  async function unassign(slot: CoverSlot) {
    try {
      await api.post(`/leave/cover/${slot.id}/unassign`);
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof ApiError ? String(e.message) : "Could not unassign this slot.");
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.dateRow}>
        <DatePicker label="Date" value={date} onChange={setDate} required />
      </View>

      {error ? (
        <ErrorView message={error} onRetry={load} />
      ) : !slots ? (
        <LoadingView />
      ) : (
        <FlatList
          data={slots}
          keyExtractor={(s) => String(s.id)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyView message="No cover slots for this date." />}
          renderItem={({ item }) => (
            <Card style={{ marginBottom: spacing(2.5) }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Text style={styles.title}>
                  Period {item.period_no} · {[item.class_name, item.section].filter(Boolean).join(" ")}
                </Text>
                <Badge text={item.status} tone={item.status === "Assigned" ? "success" : "warning"} />
              </Row>
              <Text style={styles.meta}>
                {[item.subject, item.room && `Room ${item.room}`].filter(Boolean).join(" · ")}
              </Text>
              <Text style={styles.meta}>Absent: {item.absent_teacher || `Teacher #${item.absent_teacher_id}`}</Text>
              {item.substitute_teacher ? <Text style={styles.substitute}>Covered by {item.substitute_teacher}</Text> : null}

              {canAssign ? (
                item.status === "Assigned" ? (
                  <SecondaryButton title="Unassign" onPress={() => unassign(item)} style={{ marginTop: spacing(3) }} />
                ) : (
                  <SecondaryButton title="Find substitute" onPress={() => openCandidates(item)} style={{ marginTop: spacing(3) }} />
                )
              ) : null}
            </Card>
          )}
        />
      )}

      <Modal visible={!!candidateSlot} transparent animationType="fade" onRequestClose={() => setCandidateSlot(null)}>
        <Pressable style={styles.backdrop} onPress={() => setCandidateSlot(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Choose a substitute</Text>
            {candidatesError ? (
              <ErrorView message={candidatesError} />
            ) : !candidates ? (
              <LoadingView />
            ) : (
              <FlatList
                data={[...candidates].sort((a, b) => Number(b.available) - Number(a.available))}
                keyExtractor={(c) => String(c.teacher_id)}
                style={{ maxHeight: 400 }}
                renderItem={({ item }) => (
                  <Pressable
                    disabled={!item.available || assigning}
                    onPress={() => assign(item)}
                    style={[styles.candidateRow, !item.available && styles.candidateRowDisabled]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.candidateName}>{item.name}</Text>
                      <Text style={styles.candidateMeta}>
                        {item.available
                          ? item.teaches_this_subject
                            ? "Teaches this subject"
                            : item.subject || "Available"
                          : item.unavailable_reason}
                      </Text>
                    </View>
                    {item.teaches_this_subject && item.available ? <Badge text="Best match" tone="success" /> : null}
                  </Pressable>
                )}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  dateRow: { padding: spacing(4), paddingBottom: 0 },
  list: { padding: spacing(4) },
  title: { ...type.heading, color: colors.text, flex: 1 },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  substitute: { ...type.body, color: colors.success, marginTop: spacing(2), fontWeight: "700" },

  backdrop: { flex: 1, backgroundColor: "rgba(20,21,43,0.45)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing(5),
    paddingBottom: spacing(8),
    ...elevation.lg,
  },
  sheetTitle: { ...type.heading, color: colors.text, marginBottom: spacing(3) },
  candidateRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing(3),
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  candidateRowDisabled: { opacity: 0.45 },
  candidateName: { ...type.body, color: colors.text, fontWeight: "600" },
  candidateMeta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
});
