import React, { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, Text, View, StyleSheet } from "react-native";
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
import RecordPicker, { PickerButton } from "../../components/RecordPicker";
import { useAuth } from "../../auth/AuthContext";
import { canAdminister } from "../../auth/types";
import { colors, spacing, type } from "../../theme/theme";

interface Visitor {
  id: number;
  pass_no: string;
  visitor_name: string;
  phone?: string;
  purpose?: string;
  party_size: number;
  vehicle_number?: string;
  host_student?: string;
  host_teacher?: string;
  status: string;
  checked_in_at?: string;
  checked_out_at?: string;
  denied_reason?: string;
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
  if (status === "In") return "success";
  if (status === "Expected") return "warning";
  if (status === "Denied") return "danger";
  return "default";
}

const emptyForm = {
  visitorName: "",
  phone: "",
  idProof: "",
  purpose: "",
  partySize: "1",
  hostType: "none" as "none" | "student" | "teacher",
  host: null as Person | null,
  checkInNow: true,
};

export default function VisitorsTab() {
  const { user } = useAuth();
  // Registering a visitor, admitting one, checking them out and denying entry
  // are all desk-only on the backend (Admin/Principal, or a custom role with
  // gate_register:manage). Teachers can read the register but not work it, so
  // offering them these buttons only produced a 403 on tap.
  const canWorkDesk = canAdminister(user, "gate_register");

  const [onlyOnCampus, setOnlyOnCampus] = useState(true);
  const [visitors, setVisitors] = useState<Visitor[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [pickHost, setPickHost] = useState(false);
  const [saving, setSaving] = useState(false);

  const [denying, setDenying] = useState<Visitor | null>(null);
  const [denyLoading, setDenyLoading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setVisitors(
        await api.get<Visitor[]>(onlyOnCampus ? "/gate/visitors/on-campus" : "/gate/visitors")
      );
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load visitors.");
    }
  }, [onlyOnCampus]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function resetForm() {
    setForm(emptyForm);
    setAdding(false);
  }

  async function submitVisitor() {
    if (!form.visitorName.trim()) {
      Alert.alert("Missing details", "Visitor name is required.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/gate/visitors", {
        visitor_name: form.visitorName.trim(),
        phone: form.phone.trim() || undefined,
        id_proof_number: form.idProof.trim() || undefined,
        purpose: form.purpose.trim() || undefined,
        party_size: Number(form.partySize) || 1,
        host_student_id: form.hostType === "student" ? form.host?.id : undefined,
        host_teacher_id: form.hostType === "teacher" ? form.host?.id : undefined,
        check_in_now: form.checkInNow,
      });
      resetForm();
      await load();
    } catch (e) {
      Alert.alert(
        "Could not register visitor",
        e instanceof ApiError && typeof e.detail === "string" ? e.detail : "The server refused the request."
      );
    } finally {
      setSaving(false);
    }
  }

  async function checkIn(v: Visitor) {
    try {
      await api.post(`/gate/visitors/${v.id}/check-in`);
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof ApiError && typeof e.detail === "string" ? e.detail : "Could not check in this visitor.");
    }
  }

  async function checkOut(v: Visitor) {
    try {
      await api.post(`/gate/visitors/${v.id}/check-out`);
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof ApiError && typeof e.detail === "string" ? e.detail : "Could not check out this visitor.");
    }
  }

  async function runDeny(note: string) {
    if (!denying) return;
    setDenyLoading(true);
    try {
      await api.post(`/gate/visitors/${denying.id}/deny`, { note: note || undefined });
      setDenying(null);
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof ApiError && typeof e.detail === "string" ? e.detail : "Could not deny this visitor.");
    } finally {
      setDenyLoading(false);
    }
  }

  const hostEndpoint = form.hostType === "teacher" ? "/teachers" : "/students";
  const hostLabel = useMemo(() => {
    if (!form.host) return null;
    return form.host.name || [form.host.first_name, form.host.last_name].filter(Boolean).join(" ");
  }, [form.host]);

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!visitors) return <LoadingView />;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={visitors}
        keyExtractor={(v) => String(v.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <View style={styles.chipRow}>
              <Text onPress={() => setOnlyOnCampus(true)} style={[styles.chip, onlyOnCampus && styles.chipActive]}>
                On campus
              </Text>
              <Text onPress={() => setOnlyOnCampus(false)} style={[styles.chip, !onlyOnCampus && styles.chipActive]}>
                Today
              </Text>
            </View>

            {!canWorkDesk ? null : adding ? (
              <Card style={{ marginBottom: spacing(3) }}>
                <Field label="Visitor name" required>
                  <AppTextInput value={form.visitorName} onChangeText={(v) => setForm((f) => ({ ...f, visitorName: v }))} placeholder="Full name" />
                </Field>
                <Field label="Phone">
                  <AppTextInput value={form.phone} onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))} placeholder="Optional" keyboardType="phone-pad" />
                </Field>
                <Field label="ID proof number">
                  <AppTextInput value={form.idProof} onChangeText={(v) => setForm((f) => ({ ...f, idProof: v }))} placeholder="Optional" />
                </Field>
                <Field label="Purpose">
                  <AppTextInput value={form.purpose} onChangeText={(v) => setForm((f) => ({ ...f, purpose: v }))} placeholder="Optional" />
                </Field>
                <Field label="Party size">
                  <AppTextInput value={form.partySize} onChangeText={(v) => setForm((f) => ({ ...f, partySize: v }))} keyboardType="numeric" />
                </Field>
                <Field label="Visiting who?">
                  <Row style={{ gap: spacing(2), marginBottom: spacing(2) }}>
                    {(["none", "student", "teacher"] as const).map((ht) => (
                      <Text
                        key={ht}
                        onPress={() => setForm((f) => ({ ...f, hostType: ht, host: null }))}
                        style={[styles.chip, form.hostType === ht && styles.chipActive]}
                      >
                        {ht === "none" ? "Nobody specific" : ht === "student" ? "A student" : "A teacher"}
                      </Text>
                    ))}
                  </Row>
                  {form.hostType !== "none" ? (
                    <PickerButton label={form.hostType === "teacher" ? "Teacher" : "Student"} value={hostLabel} onPress={() => setPickHost(true)} />
                  ) : null}
                </Field>
                <Field label="Check in now?">
                  <Row style={{ gap: spacing(2) }}>
                    <Text onPress={() => setForm((f) => ({ ...f, checkInNow: true }))} style={[styles.chip, form.checkInNow && styles.chipActive]}>
                      Check in now
                    </Text>
                    <Text onPress={() => setForm((f) => ({ ...f, checkInNow: false }))} style={[styles.chip, !form.checkInNow && styles.chipActive]}>
                      Just register
                    </Text>
                  </Row>
                </Field>
                <PrimaryButton title="Register visitor" onPress={submitVisitor} loading={saving} style={{ marginTop: spacing(2) }} />
                <SecondaryButton title="Cancel" onPress={resetForm} style={{ marginTop: spacing(2) }} />
              </Card>
            ) : (
              <PrimaryButton title="+ Register visitor" onPress={() => setAdding(true)} style={{ marginBottom: spacing(3) }} />
            )}
          </View>
        }
        ListEmptyComponent={<EmptyView message="No visitors to show." />}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing(2.5) }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Text style={styles.name}>{item.visitor_name}</Text>
              <Badge text={item.status} tone={statusTone(item.status)} />
            </Row>
            <Text style={styles.meta}>
              {item.pass_no} · {item.party_size} {item.party_size === 1 ? "person" : "people"}
              {item.phone ? ` · ${item.phone}` : ""}
            </Text>
            {item.purpose ? <Text style={styles.meta}>{item.purpose}</Text> : null}
            {item.host_student || item.host_teacher ? (
              <Text style={styles.meta}>Visiting {item.host_student || item.host_teacher}</Text>
            ) : null}
            {item.denied_reason ? <Text style={styles.decisionNote}>Denied: {item.denied_reason}</Text> : null}

            {canWorkDesk && item.status === "Expected" ? (
              <Row style={{ gap: spacing(2), marginTop: spacing(3) }}>
                <SecondaryButton title="Check in" onPress={() => checkIn(item)} style={{ flex: 1 }} />
                <SecondaryButton title="Deny" onPress={() => setDenying(item)} style={{ flex: 1 }} />
              </Row>
            ) : null}
            {canWorkDesk && item.status === "In" ? (
              <SecondaryButton title="Check out" onPress={() => checkOut(item)} style={{ marginTop: spacing(3) }} />
            ) : null}
          </Card>
        )}
      />

      <RecordPicker<Person>
        visible={pickHost}
        onClose={() => setPickHost(false)}
        title={form.hostType === "teacher" ? "Choose teacher" : "Choose student"}
        endpoint={hostEndpoint}
        labelFor={(p) => p.name || [p.first_name, p.last_name].filter(Boolean).join(" ")}
        subtitleFor={(p) => p.admission_no || p.employee_no || ""}
        searchFields={form.hostType === "teacher" ? ["name", "employee_no"] : ["first_name", "last_name", "admission_no"]}
        onPick={(p) => setForm((f) => ({ ...f, host: p }))}
      />

      <PromptModal
        visible={!!denying}
        title="Deny entry?"
        confirmLabel="Deny"
        destructive
        loading={denyLoading}
        placeholder="Reason (optional)"
        onCancel={() => setDenying(null)}
        onConfirm={runDeny}
      />
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
  decisionNote: { ...type.caption, color: colors.danger, marginTop: spacing(1) },
});
