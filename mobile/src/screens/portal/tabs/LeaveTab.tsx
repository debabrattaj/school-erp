import React, { useCallback, useState } from "react";
import { Alert, FlatList, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../../api/client";
import { AppTextInput, Badge, Card, EmptyView, ErrorView, Field, LoadingView, PrimaryButton, Row, SecondaryButton } from "../../../components/Common";
import { DatePicker } from "../../../components/Pickers";
import { colors, spacing, type } from "../../../theme/theme";

interface LeaveRequest {
  id: number;
  from_date: string;
  to_date: string;
  reason?: string;
  status: string;
  requested_by: string;
  decision_note?: string;
}

function statusTone(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "Approved") return "success";
  if (status === "Requested") return "warning";
  if (status === "Rejected") return "danger";
  return "default";
}

const emptyForm = { from: "", to: "", reason: "" };

export default function LeaveTab({ studentId }: { studentId: number }) {
  const [requests, setRequests] = useState<LeaveRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRequests(await api.get<LeaveRequest[]>(`/portal/students/${studentId}/leave-requests`));
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load leave requests.");
    }
  }, [studentId]);

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
    if (!form.from || !form.to) {
      Alert.alert("Missing details", "Pick a from and to date.");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/portal/students/${studentId}/leave-requests`, {
        from_date: form.from,
        to_date: form.to,
        reason: form.reason.trim() || undefined,
      });
      resetForm();
      await load();
    } catch (e) {
      Alert.alert(
        "Could not submit",
        e instanceof ApiError && typeof e.detail === "string" ? e.detail : "The server refused the request."
      );
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!requests) return <LoadingView />;

  return (
    <FlatList
      data={requests}
      keyExtractor={(r) => String(r.id)}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View>
          {adding ? (
            <Card style={{ marginBottom: spacing(3) }}>
              <Row style={{ gap: spacing(3) }}>
                <View style={{ flex: 1 }}>
                  <Field label="From" required>
                    <DatePicker label="From" value={form.from} onChange={(v) => setForm((f) => ({ ...f, from: v }))} required />
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="To" required>
                    <DatePicker label="To" value={form.to} onChange={(v) => setForm((f) => ({ ...f, to: v }))} required />
                  </Field>
                </View>
              </Row>
              <Field label="Reason">
                <AppTextInput
                  value={form.reason}
                  onChangeText={(v) => setForm((f) => ({ ...f, reason: v }))}
                  placeholder="Optional"
                  multiline
                />
              </Field>
              <PrimaryButton title="Submit request" onPress={submit} loading={saving} style={{ marginTop: spacing(2) }} />
              <SecondaryButton title="Cancel" onPress={resetForm} style={{ marginTop: spacing(2) }} />
            </Card>
          ) : (
            <PrimaryButton title="+ Request leave" onPress={() => setAdding(true)} style={{ marginBottom: spacing(3) }} />
          )}
        </View>
      }
      ListEmptyComponent={<EmptyView message="No leave requests yet." />}
      renderItem={({ item }) => (
        <Card style={{ marginBottom: spacing(2.5) }}>
          <Row style={{ justifyContent: "space-between" }}>
            <Text style={styles.dates}>
              {item.from_date} → {item.to_date}
            </Text>
            <Badge text={item.status} tone={statusTone(item.status)} />
          </Row>
          {item.reason ? <Text style={styles.reason}>{item.reason}</Text> : null}
          {item.decision_note ? <Text style={styles.decisionNote}>Note: {item.decision_note}</Text> : null}
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing(4) },
  dates: { ...type.heading, color: colors.text },
  reason: { ...type.body, color: colors.text, marginTop: spacing(2) },
  decisionNote: { ...type.caption, color: colors.textMuted, marginTop: spacing(1), fontStyle: "italic" },
});
