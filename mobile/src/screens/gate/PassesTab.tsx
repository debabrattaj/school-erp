import React, { useCallback, useState } from "react";
import { Alert, FlatList, Modal, Pressable, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import {
  AppTextInput,
  Badge,
  Card,
  EmptyView,
  ErrorView,
  Field,
  LoadingView,
  PrimaryButton,
  PromptModal,
  Row,
  SecondaryButton,
} from "../../components/Common";
import { TimePicker } from "../../components/Pickers";
import RecordPicker, { PickerButton } from "../../components/RecordPicker";
import { colors, elevation, radius, spacing, type } from "../../theme/theme";
import { todayISO } from "../../utils/dates";

interface GatePass {
  id: number;
  pass_no: string;
  pass_type: string;
  student?: string;
  teacher?: string;
  reason?: string;
  expected_return: boolean;
  expected_return_at?: string;
  status: string;
  decision_note?: string;
  collected_by_name?: string;
  overdue?: boolean;
}

interface Person {
  id: number;
  name?: string;
  first_name?: string;
  last_name?: string;
  admission_no?: string;
  employee_no?: string;
}

function statusTone(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "Returned") return "success";
  if (status === "Out") return "success";
  if (status === "Requested" || status === "Approved") return "warning";
  if (status === "Rejected" || status === "Cancelled") return "danger";
  return "default";
}

const emptyForm = { passType: "Student" as "Student" | "Staff", person: null as Person | null, reason: "", expectedReturn: false, returnTime: "" };


export default function PassesTab() {
  const [stillOut, setStillOut] = useState(true);
  const [passes, setPasses] = useState<GatePass[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [pickPerson, setPickPerson] = useState(false);
  const [saving, setSaving] = useState(false);

  const [decision, setDecision] = useState<{ pass: GatePass; kind: "approve" | "reject" | "cancel" } | null>(null);
  const [deciding, setDeciding] = useState(false);

  const [releasing, setReleasing] = useState<GatePass | null>(null);
  const [release, setRelease] = useState({ name: "", relation: "", phone: "", idProof: "" });
  const [releaseSaving, setReleaseSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPasses(await api.get<GatePass[]>(stillOut ? "/gate/passes/still-out" : "/gate/passes"));
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load gate passes.");
    }
  }, [stillOut]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function resetForm() {
    setForm(emptyForm);
    setAdding(false);
  }

  async function submitPass() {
    if (!form.person) {
      Alert.alert("Missing details", `Choose a ${form.passType === "Staff" ? "staff member" : "student"}.`);
      return;
    }
    setSaving(true);
    try {
      await api.post("/gate/passes", {
        pass_type: form.passType,
        student_id: form.passType === "Student" ? form.person.id : undefined,
        teacher_id: form.passType === "Staff" ? form.person.id : undefined,
        reason: form.reason.trim() || undefined,
        expected_return: form.expectedReturn,
        expected_return_at: form.expectedReturn && form.returnTime ? `${todayISO()}T${form.returnTime}:00` : undefined,
      });
      resetForm();
      await load();
    } catch (e) {
      Alert.alert(
        "Could not create pass",
        e instanceof ApiError && typeof e.detail === "string" ? e.detail : "The server refused the request."
      );
    } finally {
      setSaving(false);
    }
  }

  async function runDecision(note: string) {
    if (!decision) return;
    setDeciding(true);
    try {
      await api.post(`/gate/passes/${decision.pass.id}/${decision.kind}`, { note: note || undefined });
      setDecision(null);
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof ApiError && typeof e.detail === "string" ? e.detail : "The server refused the request.");
    } finally {
      setDeciding(false);
    }
  }

  async function submitRelease() {
    if (!releasing) return;
    setReleaseSaving(true);
    try {
      await api.post(`/gate/passes/${releasing.id}/release`, {
        collected_by_name: release.name.trim() || undefined,
        collected_by_relation: release.relation.trim() || undefined,
        collected_by_phone: release.phone.trim() || undefined,
        collected_by_id_proof: release.idProof.trim() || undefined,
      });
      setReleasing(null);
      setRelease({ name: "", relation: "", phone: "", idProof: "" });
      await load();
    } catch (e) {
      Alert.alert("Could not release", e instanceof ApiError && typeof e.detail === "string" ? e.detail : "The server refused the request.");
    } finally {
      setReleaseSaving(false);
    }
  }

  async function recordReturn(p: GatePass) {
    try {
      await api.post(`/gate/passes/${p.id}/return`);
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof ApiError && typeof e.detail === "string" ? e.detail : "Could not record their return.");
    }
  }

  const personEndpoint = form.passType === "Staff" ? "/teachers" : "/students";

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!passes) return <LoadingView />;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={passes}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <View style={styles.chipRow}>
              <Text onPress={() => setStillOut(true)} style={[styles.chip, stillOut && styles.chipActive]}>
                Still out
              </Text>
              <Text onPress={() => setStillOut(false)} style={[styles.chip, !stillOut && styles.chipActive]}>
                Today
              </Text>
            </View>

            {adding ? (
              <Card style={{ marginBottom: spacing(3) }}>
                <Field label="Pass for">
                  <Row style={{ gap: spacing(2) }}>
                    {(["Student", "Staff"] as const).map((pt) => (
                      <Text
                        key={pt}
                        onPress={() => setForm((f) => ({ ...f, passType: pt, person: null }))}
                        style={[styles.chip, form.passType === pt && styles.chipActive]}
                      >
                        {pt}
                      </Text>
                    ))}
                  </Row>
                </Field>
                <Field label={form.passType} required>
                  <PickerButton
                    label={form.passType}
                    value={form.person ? form.person.name || [form.person.first_name, form.person.last_name].filter(Boolean).join(" ") : null}
                    onPress={() => setPickPerson(true)}
                  />
                </Field>
                <Field label="Reason">
                  <AppTextInput value={form.reason} onChangeText={(v) => setForm((f) => ({ ...f, reason: v }))} placeholder="Optional" multiline />
                </Field>
                <Field label="Expected back today?">
                  <Row style={{ gap: spacing(2) }}>
                    <Text onPress={() => setForm((f) => ({ ...f, expectedReturn: true }))} style={[styles.chip, form.expectedReturn && styles.chipActive]}>
                      Yes
                    </Text>
                    <Text onPress={() => setForm((f) => ({ ...f, expectedReturn: false, returnTime: "" }))} style={[styles.chip, !form.expectedReturn && styles.chipActive]}>
                      No
                    </Text>
                  </Row>
                </Field>
                {form.expectedReturn ? (
                  <Field label="Expected back at">
                    <TimePicker label="Expected back at" value={form.returnTime} onChange={(v) => setForm((f) => ({ ...f, returnTime: v }))} />
                  </Field>
                ) : null}
                <PrimaryButton title="Create pass" onPress={submitPass} loading={saving} style={{ marginTop: spacing(2) }} />
                <SecondaryButton title="Cancel" onPress={resetForm} style={{ marginTop: spacing(2) }} />
              </Card>
            ) : (
              <PrimaryButton title="+ New gate pass" onPress={() => setAdding(true)} style={{ marginBottom: spacing(3) }} />
            )}
          </View>
        }
        ListEmptyComponent={<EmptyView message="No gate passes to show." />}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing(2.5) }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Text style={styles.name}>{item.student || item.teacher || item.pass_no}</Text>
              <Badge text={item.overdue ? "Overdue" : item.status} tone={item.overdue ? "danger" : statusTone(item.status)} />
            </Row>
            <Text style={styles.meta}>
              {item.pass_no} · {item.pass_type}
              {item.expected_return_at ? ` · back by ${item.expected_return_at.slice(11, 16)}` : ""}
            </Text>
            {item.reason ? <Text style={styles.meta}>{item.reason}</Text> : null}
            {item.collected_by_name ? <Text style={styles.meta}>Collected by {item.collected_by_name}</Text> : null}
            {item.decision_note ? <Text style={styles.decisionNote}>Note: {item.decision_note}</Text> : null}

            {item.status === "Requested" ? (
              <Row style={{ gap: spacing(2), marginTop: spacing(3) }}>
                <SecondaryButton title="Approve" onPress={() => setDecision({ pass: item, kind: "approve" })} style={{ flex: 1 }} />
                <SecondaryButton title="Reject" onPress={() => setDecision({ pass: item, kind: "reject" })} style={{ flex: 1 }} />
              </Row>
            ) : null}
            {item.status === "Approved" ? (
              <SecondaryButton title="Release" onPress={() => setReleasing(item)} style={{ marginTop: spacing(3) }} />
            ) : null}
            {item.status === "Out" ? (
              <SecondaryButton title="Record return" onPress={() => recordReturn(item)} style={{ marginTop: spacing(3) }} />
            ) : null}
            {item.status === "Requested" || item.status === "Approved" ? (
              <SecondaryButton title="Cancel pass" onPress={() => setDecision({ pass: item, kind: "cancel" })} style={{ marginTop: spacing(2) }} />
            ) : null}
          </Card>
        )}
      />

      <RecordPicker<Person>
        visible={pickPerson}
        onClose={() => setPickPerson(false)}
        title={form.passType === "Staff" ? "Choose staff member" : "Choose student"}
        endpoint={personEndpoint}
        labelFor={(p) => p.name || [p.first_name, p.last_name].filter(Boolean).join(" ")}
        subtitleFor={(p) => p.admission_no || p.employee_no || ""}
        searchFields={form.passType === "Staff" ? ["name", "employee_no"] : ["first_name", "last_name", "admission_no"]}
        onPick={(p) => setForm((f) => ({ ...f, person: p }))}
      />

      <PromptModal
        visible={!!decision}
        title={decision?.kind === "approve" ? "Approve this pass?" : decision?.kind === "reject" ? "Reject this pass?" : "Cancel this pass?"}
        confirmLabel={decision?.kind === "approve" ? "Approve" : decision?.kind === "reject" ? "Reject" : "Cancel pass"}
        destructive={decision?.kind !== "approve"}
        loading={deciding}
        onCancel={() => setDecision(null)}
        onConfirm={runDecision}
      />

      <Modal visible={!!releasing} transparent animationType="fade" onRequestClose={() => setReleasing(null)}>
        <Pressable style={styles.backdrop} onPress={() => setReleasing(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Release {releasing?.student || releasing?.teacher}</Text>
            {releasing?.pass_type === "Student" ? (
              <Text style={styles.sheetHint}>A named collector is required to release a student.</Text>
            ) : null}
            <Field label="Collected by">
              <AppTextInput value={release.name} onChangeText={(v) => setRelease((r) => ({ ...r, name: v }))} placeholder="Name" />
            </Field>
            <Field label="Relation">
              <AppTextInput value={release.relation} onChangeText={(v) => setRelease((r) => ({ ...r, relation: v }))} placeholder="e.g. Father, Self" />
            </Field>
            <Field label="Phone">
              <AppTextInput value={release.phone} onChangeText={(v) => setRelease((r) => ({ ...r, phone: v }))} keyboardType="phone-pad" placeholder="Optional" />
            </Field>
            <Field label="ID proof">
              <AppTextInput value={release.idProof} onChangeText={(v) => setRelease((r) => ({ ...r, idProof: v }))} placeholder="Optional" />
            </Field>
            <Row style={{ gap: spacing(3) }}>
              <SecondaryButton title="Cancel" onPress={() => setReleasing(null)} style={{ flex: 1 }} />
              <PrimaryButton title="Release" onPress={submitRelease} loading={releaseSaving} style={{ flex: 1 }} />
            </Row>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing(4) },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing(2), marginBottom: spacing(3) },
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
  name: { ...type.heading, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  decisionNote: { ...type.caption, color: colors.textMuted, marginTop: spacing(1), fontStyle: "italic" },

  backdrop: { flex: 1, backgroundColor: "rgba(20,21,43,0.45)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing(5),
    paddingBottom: spacing(8),
    ...elevation.lg,
  },
  sheetTitle: { ...type.heading, color: colors.text, marginBottom: spacing(1) },
  sheetHint: { ...type.caption, color: colors.textMuted, marginBottom: spacing(3) },
});
