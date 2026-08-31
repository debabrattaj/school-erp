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
  Row,
  SecondaryButton,
} from "../../components/Common";
import { useAuth } from "../../auth/AuthContext";
import { canAdminister } from "../../auth/types";
import { colors, spacing, type } from "../../theme/theme";

interface LeaveType {
  id: number;
  code: string;
  name: string;
  annual_quota: number;
  is_paid: boolean;
  allow_negative_balance: boolean;
  is_active: boolean;
  remarks?: string;
}

const emptyForm = { code: "", name: "", annualQuota: "", isPaid: true };

export default function TypesTab() {
  const { user } = useAuth();
  // Not a hardcoded role pair: the backend restricts this to Admin and
  // Principal by name for built-in roles, but authorizes custom roles by
  // their "staff_leave" manage grant — which the old check locked out.
  const canManage = canAdminister(user, "staff_leave");

  const [types, setTypes] = useState<LeaveType[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setTypes(await api.get<LeaveType[]>("/leave/types"));
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load leave types.");
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

  async function createType() {
    if (!form.code.trim() || !form.name.trim()) {
      Alert.alert("Missing details", "Code and name are required.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/leave/types", {
        code: form.code.trim(),
        name: form.name.trim(),
        annual_quota: Number(form.annualQuota) || 0,
        is_paid: form.isPaid,
      });
      resetForm();
      await load();
    } catch (e) {
      Alert.alert(
        "Could not create",
        e instanceof ApiError && typeof e.detail === "string" ? e.detail : "The server refused the request."
      );
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!types) return <LoadingView />;

  return (
    <FlatList
      data={types}
      keyExtractor={(t) => String(t.id)}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        canManage ? (
          <View>
            {adding ? (
              <Card style={{ marginBottom: spacing(3) }}>
                <Field label="Code" required>
                  <AppTextInput value={form.code} onChangeText={(v) => setForm((f) => ({ ...f, code: v }))} placeholder="e.g. CASUAL" autoCapitalize="characters" />
                </Field>
                <Field label="Name" required>
                  <AppTextInput value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="e.g. Casual Leave" />
                </Field>
                <Field label="Annual Quota (days)">
                  <AppTextInput
                    value={form.annualQuota}
                    onChangeText={(v) => setForm((f) => ({ ...f, annualQuota: v }))}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                </Field>
                <Field label="Paid?">
                  <Row style={{ gap: spacing(2) }}>
                    <Text onPress={() => setForm((f) => ({ ...f, isPaid: true }))} style={[styles.chip, form.isPaid && styles.chipActive]}>
                      Paid
                    </Text>
                    <Text onPress={() => setForm((f) => ({ ...f, isPaid: false }))} style={[styles.chip, !form.isPaid && styles.chipActive]}>
                      Unpaid
                    </Text>
                  </Row>
                </Field>
                <PrimaryButton title="Create leave type" onPress={createType} loading={saving} style={{ marginTop: spacing(2) }} />
                <SecondaryButton title="Cancel" onPress={resetForm} style={{ marginTop: spacing(2) }} />
              </Card>
            ) : (
              <PrimaryButton title="+ New leave type" onPress={() => setAdding(true)} style={{ marginBottom: spacing(3) }} />
            )}
          </View>
        ) : null
      }
      ListEmptyComponent={<EmptyView message="No leave types configured yet." />}
      renderItem={({ item }) => (
        <Card style={{ marginBottom: spacing(2.5) }}>
          <Row style={{ justifyContent: "space-between" }}>
            <Text style={styles.name}>{item.name}</Text>
            {!item.is_active ? <Badge text="Inactive" tone="danger" /> : null}
          </Row>
          <Text style={styles.meta}>
            {item.code} · {item.annual_quota} days/year · {item.is_paid ? "Paid" : "Unpaid"}
          </Text>
          {item.remarks ? <Text style={styles.remarks}>{item.remarks}</Text> : null}
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing(4) },
  name: { ...type.heading, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  remarks: { ...type.body, color: colors.text, marginTop: spacing(2) },
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
