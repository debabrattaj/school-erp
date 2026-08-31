import React, { useCallback, useState } from "react";
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
import { useAuth } from "../../auth/AuthContext";
import { canAdminister } from "../../auth/types";
import { colors, spacing, type } from "../../theme/theme";

interface Blocked {
  id: number;
  name: string;
  phone?: string;
  id_proof_number?: string;
  reason: string;
  blocked_by: string;
  is_active: boolean;
  lifted_note?: string;
}

const emptyForm = { name: "", phone: "", idProof: "", reason: "" };

export default function BlockedTab() {
  const { user } = useAuth();
  // Blocking someone and lifting a block are desk-only on the backend; readers
  // (Teachers) can see the list but not change it.
  const canWorkDesk = canAdminister(user, "gate_register");

  const [includeLifted, setIncludeLifted] = useState(false);
  const [blocked, setBlocked] = useState<Blocked[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [lifting, setLifting] = useState<Blocked | null>(null);
  const [liftLoading, setLiftLoading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setBlocked(await api.get<Blocked[]>("/gate/blocked", { include_lifted: includeLifted }));
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load the blocked list.");
    }
  }, [includeLifted]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function resetForm() {
    setForm(emptyForm);
    setAdding(false);
  }

  async function submitBlock() {
    if (!form.name.trim() || !form.reason.trim()) {
      Alert.alert("Missing details", "Name and reason are required.");
      return;
    }
    if (!form.phone.trim() && !form.idProof.trim()) {
      Alert.alert("Missing details", "A phone number or ID number is required to match this person at the gate.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/gate/blocked", {
        name: form.name.trim(),
        reason: form.reason.trim(),
        phone: form.phone.trim() || undefined,
        id_proof_number: form.idProof.trim() || undefined,
      });
      resetForm();
      await load();
    } catch (e) {
      Alert.alert(
        "Could not add block",
        e instanceof ApiError && typeof e.detail === "string" ? e.detail : "The server refused the request."
      );
    } finally {
      setSaving(false);
    }
  }

  async function runLift(note: string) {
    if (!lifting) return;
    setLiftLoading(true);
    try {
      await api.post(`/gate/blocked/${lifting.id}/lift`, { note: note || undefined });
      setLifting(null);
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof ApiError && typeof e.detail === "string" ? e.detail : "Could not lift this block.");
    } finally {
      setLiftLoading(false);
    }
  }

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!blocked) return <LoadingView />;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={blocked}
        keyExtractor={(b) => String(b.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <View style={styles.chipRow}>
              <Text onPress={() => setIncludeLifted(false)} style={[styles.chip, !includeLifted && styles.chipActive]}>
                Active
              </Text>
              <Text onPress={() => setIncludeLifted(true)} style={[styles.chip, includeLifted && styles.chipActive]}>
                Include lifted
              </Text>
            </View>

            {!canWorkDesk ? null : adding ? (
              <Card style={{ marginBottom: spacing(3) }}>
                <Field label="Name" required>
                  <AppTextInput value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Full name" />
                </Field>
                <Field label="Phone">
                  <AppTextInput value={form.phone} onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))} keyboardType="phone-pad" placeholder="Optional" />
                </Field>
                <Field label="ID proof number">
                  <AppTextInput value={form.idProof} onChangeText={(v) => setForm((f) => ({ ...f, idProof: v }))} placeholder="Optional" />
                </Field>
                <Field label="Reason" required>
                  <AppTextInput value={form.reason} onChangeText={(v) => setForm((f) => ({ ...f, reason: v }))} multiline />
                </Field>
                <PrimaryButton title="Add block" onPress={submitBlock} loading={saving} style={{ marginTop: spacing(2) }} />
                <SecondaryButton title="Cancel" onPress={resetForm} style={{ marginTop: spacing(2) }} />
              </Card>
            ) : (
              <PrimaryButton title="+ Block a visitor" onPress={() => setAdding(true)} style={{ marginBottom: spacing(3) }} />
            )}
          </View>
        }
        ListEmptyComponent={<EmptyView message="Nobody is blocked." />}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing(2.5) }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Text style={styles.name}>{item.name}</Text>
              {!item.is_active ? <Badge text="Lifted" tone="success" /> : <Badge text="Blocked" tone="danger" />}
            </Row>
            <Text style={styles.meta}>
              {[item.phone, item.id_proof_number].filter(Boolean).join(" · ")}
            </Text>
            <Text style={styles.reason}>{item.reason}</Text>
            <Text style={styles.meta}>Blocked by {item.blocked_by}</Text>
            {item.lifted_note ? <Text style={styles.decisionNote}>Lift note: {item.lifted_note}</Text> : null}

            {item.is_active ? (
              canWorkDesk ? (
                <SecondaryButton title="Lift block" onPress={() => setLifting(item)} style={{ marginTop: spacing(3) }} />
              ) : null
            ) : null}
          </Card>
        )}
      />

      <PromptModal
        visible={!!lifting}
        title="Lift this block?"
        confirmLabel="Lift block"
        placeholder="Note (optional)"
        loading={liftLoading}
        onCancel={() => setLifting(null)}
        onConfirm={runLift}
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
  reason: { ...type.body, color: colors.text, marginTop: spacing(2) },
  decisionNote: { ...type.caption, color: colors.textMuted, marginTop: spacing(1), fontStyle: "italic" },
});
