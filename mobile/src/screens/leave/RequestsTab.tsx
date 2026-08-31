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
import { DatePicker, OptionPicker } from "../../components/Pickers";
import RecordPicker, { PickerButton } from "../../components/RecordPicker";
import { useAuth } from "../../auth/AuthContext";
import { canApprove as canApproveFor } from "../../auth/types";
import { colors, spacing, type } from "../../theme/theme";

interface LeaveType {
  id: number;
  name: string;
  is_active: boolean;
}

interface Teacher {
  id: number;
  name: string;
  employee_no?: string;
  department?: string;
}

interface LeaveRequest {
  id: number;
  teacher_id: number;
  teacher_name?: string;
  leave_type_id: number;
  leave_type?: string;
  from_date: string;
  to_date: string;
  days: number;
  is_half_day: boolean;
  reason?: string;
  status: string;
  decided_by?: string;
  decision_note?: string;
}

const STATUS_FILTERS = ["All", "Requested", "Approved", "Rejected", "Cancelled"];

function statusTone(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "Approved") return "success";
  if (status === "Requested") return "warning";
  if (status === "Rejected" || status === "Cancelled") return "danger";
  return "default";
}

const emptyForm = { teacher: null as Teacher | null, leaveTypeId: "", from: "", to: "", isHalfDay: false, reason: "" };

export default function RequestsTab() {
  const { user } = useAuth();
  // Not a hardcoded role pair: the backend restricts this to Admin and
  // Principal by name for built-in roles, but authorizes custom roles by
  // their "staff_leave" manage grant — which the old check locked out.
  const canApprove = canApproveFor(user, "staff_leave");

  const [requests, setRequests] = useState<LeaveRequest[] | null>(null);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("All");

  const [adding, setAdding] = useState(false);
  const [pickTeacher, setPickTeacher] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [decision, setDecision] = useState<{ request: LeaveRequest; kind: "approve" | "reject" | "cancel" } | null>(
    null
  );
  const [deciding, setDeciding] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [reqs, leaveTypes] = await Promise.all([
        api.get<LeaveRequest[]>("/leave/requests", statusFilter !== "All" ? { status: statusFilter } : undefined),
        api.get<LeaveType[]>("/leave/types"),
      ]);
      setRequests(reqs);
      setTypes(leaveTypes);
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load leave requests.");
    }
  }, [statusFilter]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const typeOptions = useMemo(
    () => types.filter((t) => t.is_active).map((t) => ({ label: t.name, value: String(t.id) })),
    [types]
  );

  function resetForm() {
    setForm(emptyForm);
    setAdding(false);
  }

  async function submitRequest() {
    if (!form.teacher || !form.leaveTypeId || !form.from || !form.to) {
      Alert.alert("Missing details", "Pick a teacher, leave type and date range.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/leave/requests", {
        teacher_id: form.teacher.id,
        leave_type_id: Number(form.leaveTypeId),
        from_date: form.from,
        to_date: form.to,
        is_half_day: form.isHalfDay,
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

  async function runDecision(note: string) {
    if (!decision) return;
    setDeciding(true);
    try {
      const path =
        decision.kind === "approve"
          ? `/leave/requests/${decision.request.id}/approve`
          : decision.kind === "reject"
          ? `/leave/requests/${decision.request.id}/reject`
          : `/leave/requests/${decision.request.id}/cancel`;
      await api.post(path, { note: note || undefined });
      setDecision(null);
      await load();
    } catch (e) {
      Alert.alert(
        "Could not update",
        e instanceof ApiError && typeof e.detail === "string" ? e.detail : "The server refused the request."
      );
    } finally {
      setDeciding(false);
    }
  }

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!requests) return <LoadingView />;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={requests}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <View style={styles.chipRow}>
              {STATUS_FILTERS.map((s) => (
                <Text
                  key={s}
                  onPress={() => setStatusFilter(s)}
                  style={[styles.filterChip, statusFilter === s && styles.filterChipActive]}
                >
                  {s}
                </Text>
              ))}
            </View>

            {adding ? (
              <Card style={{ marginBottom: spacing(3) }}>
                <Field label="Teacher" required>
                  <PickerButton
                    label="Teacher"
                    value={form.teacher ? `${form.teacher.name}${form.teacher.employee_no ? ` · ${form.teacher.employee_no}` : ""}` : null}
                    onPress={() => setPickTeacher(true)}
                  />
                </Field>
                <Field label="Leave Type" required>
                  <OptionPicker
                    label="Leave Type"
                    options={typeOptions}
                    value={form.leaveTypeId}
                    onChange={(v) => setForm((f) => ({ ...f, leaveTypeId: v }))}
                    required
                  />
                </Field>
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
                <Field label="Half day?">
                  <Row style={{ gap: spacing(2) }}>
                    <Text
                      onPress={() => setForm((f) => ({ ...f, isHalfDay: false }))}
                      style={[styles.filterChip, !form.isHalfDay && styles.filterChipActive]}
                    >
                      Full day
                    </Text>
                    <Text
                      onPress={() => setForm((f) => ({ ...f, isHalfDay: true }))}
                      style={[styles.filterChip, form.isHalfDay && styles.filterChipActive]}
                    >
                      Half day
                    </Text>
                  </Row>
                </Field>
                <Field label="Reason">
                  <AppTextInput
                    value={form.reason}
                    onChangeText={(v) => setForm((f) => ({ ...f, reason: v }))}
                    placeholder="Optional"
                    multiline
                  />
                </Field>
                <PrimaryButton title="Submit request" onPress={submitRequest} loading={saving} style={{ marginTop: spacing(2) }} />
                <SecondaryButton title="Cancel" onPress={resetForm} style={{ marginTop: spacing(2) }} />
              </Card>
            ) : (
              <PrimaryButton title="+ New leave request" onPress={() => setAdding(true)} style={{ marginBottom: spacing(3) }} />
            )}
          </View>
        }
        ListEmptyComponent={<EmptyView message="No leave requests found." />}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing(2.5) }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Text style={styles.name}>{item.teacher_name || `Teacher #${item.teacher_id}`}</Text>
              <Badge text={item.status} tone={statusTone(item.status)} />
            </Row>
            <Text style={styles.meta}>
              {item.leave_type || "Leave"} · {item.from_date} → {item.to_date} · {item.days} day{item.days === 1 ? "" : "s"}
              {item.is_half_day ? " (half day)" : ""}
            </Text>
            {item.reason ? <Text style={styles.reason}>{item.reason}</Text> : null}
            {item.decision_note ? <Text style={styles.decisionNote}>Note: {item.decision_note}</Text> : null}

            {item.status === "Requested" && canApprove ? (
              <Row style={{ gap: spacing(2), marginTop: spacing(3) }}>
                <SecondaryButton title="Approve" onPress={() => setDecision({ request: item, kind: "approve" })} style={{ flex: 1 }} />
                <SecondaryButton title="Reject" onPress={() => setDecision({ request: item, kind: "reject" })} style={{ flex: 1 }} />
              </Row>
            ) : null}
            {item.status !== "Cancelled" && item.status !== "Rejected" ? (
              <SecondaryButton
                title="Cancel request"
                onPress={() => setDecision({ request: item, kind: "cancel" })}
                style={{ marginTop: spacing(2) }}
              />
            ) : null}
          </Card>
        )}
      />

      <RecordPicker<Teacher>
        visible={pickTeacher}
        onClose={() => setPickTeacher(false)}
        title="Choose teacher"
        endpoint="/teachers"
        labelFor={(t) => t.name}
        subtitleFor={(t) => [t.employee_no, t.department].filter(Boolean).join(" · ")}
        searchFields={["name", "employee_no", "department"]}
        onPick={(t) => setForm((f) => ({ ...f, teacher: t }))}
      />

      <PromptModal
        visible={!!decision}
        title={
          decision?.kind === "approve"
            ? "Approve leave request?"
            : decision?.kind === "reject"
            ? "Reject leave request?"
            : "Cancel leave request?"
        }
        message={decision?.kind === "approve" ? "Deducts the balance and raises cover for classes missed." : undefined}
        confirmLabel={decision?.kind === "approve" ? "Approve" : decision?.kind === "reject" ? "Reject" : "Cancel request"}
        destructive={decision?.kind === "reject" || decision?.kind === "cancel"}
        loading={deciding}
        onCancel={() => setDecision(null)}
        onConfirm={runDecision}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing(4) },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing(2), marginBottom: spacing(3) },
  filterChip: {
    ...type.caption,
    color: colors.textMuted,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 999,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
    overflow: "hidden",
  },
  filterChipActive: { backgroundColor: colors.primary, color: colors.onPrimary },
  name: { ...type.heading, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  reason: { ...type.body, color: colors.text, marginTop: spacing(2) },
  decisionNote: { ...type.caption, color: colors.textMuted, marginTop: spacing(1), fontStyle: "italic" },
});
