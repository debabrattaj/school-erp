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
import { DatePicker } from "../../components/Pickers";
import { useAuth } from "../../auth/AuthContext";
import { canApprove as canApproveFor } from "../../auth/types";
import { colors, spacing, type } from "../../theme/theme";
import { todayISO } from "../../utils/dates";

interface Plan {
  id: number;
  plan_date: string;
  period_no?: number;
  title: string;
  teacher?: string;
  topic?: string;
  status: string;
  review_status?: string;
  objectives?: string;
  homework?: string;
  delivery_note?: string;
}

function statusTone(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "Delivered") return "success";
  if (status === "Planned") return "warning";
  if (status === "Deferred" || status === "Cancelled") return "danger";
  return "default";
}

function reviewTone(status?: string): "default" | "success" | "warning" | "danger" {
  if (status === "Approved") return "success";
  if (status === "Changes Requested") return "danger";
  return "default";
}


// Built per-open, not once at module load: a session left running overnight
// would otherwise default tomorrow's plan to yesterday's date.
const emptyForm = () => ({ planDate: todayISO(), title: "", objectives: "", homework: "" });

export default function LessonPlansTab({ classSubjectId }: { classSubjectId: number }) {
  const { user } = useAuth();
  // Not a hardcoded role pair: the backend restricts this to Admin and
  // Principal by name for built-in roles, but authorizes custom roles by
  // their "syllabus" manage grant — which the old check locked out.
  const canReview = canApproveFor(user, "syllabus");

  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [reviewing, setReviewing] = useState<Plan | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPlans(await api.get<Plan[]>("/syllabus/lesson-plans", { class_subject_id: classSubjectId }));
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load lesson plans.");
    }
  }, [classSubjectId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function submitPlan() {
    if (!form.title.trim()) {
      Alert.alert("Missing details", "A lesson title is required.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/syllabus/lesson-plans", {
        class_subject_id: classSubjectId,
        plan_date: form.planDate,
        title: form.title.trim(),
        objectives: form.objectives.trim() || undefined,
        homework: form.homework.trim() || undefined,
      });
      setForm(emptyForm());
      setAdding(false);
      await load();
    } catch (e) {
      Alert.alert("Could not create plan", e instanceof ApiError && typeof e.detail === "string" ? e.detail : "The server refused the request.");
    } finally {
      setSaving(false);
    }
  }

  async function deliver(plan: Plan) {
    try {
      await api.post(`/syllabus/lesson-plans/${plan.id}/deliver`, {});
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof ApiError && typeof e.detail === "string" ? e.detail : "Could not mark this lesson delivered.");
    }
  }

  async function defer(plan: Plan) {
    try {
      await api.post(`/syllabus/lesson-plans/${plan.id}/defer`, {});
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof ApiError && typeof e.detail === "string" ? e.detail : "Could not defer this lesson.");
    }
  }

  async function runReview(note: string) {
    if (!reviewing) return;
    setReviewLoading(true);
    try {
      await api.post(`/syllabus/lesson-plans/${reviewing.id}/review`, { review_status: "Approved", note: note || undefined });
      setReviewing(null);
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof ApiError && typeof e.detail === "string" ? e.detail : "Could not review this lesson plan.");
    } finally {
      setReviewLoading(false);
    }
  }

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!plans) return <LoadingView />;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={plans}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            {adding ? (
              <Card style={{ marginBottom: spacing(3) }}>
                <Field label="Date" required>
                  <DatePicker label="Date" value={form.planDate} onChange={(v) => setForm((f) => ({ ...f, planDate: v }))} required />
                </Field>
                <Field label="Title" required>
                  <AppTextInput value={form.title} onChangeText={(v) => setForm((f) => ({ ...f, title: v }))} placeholder="e.g. Introduction to fractions" />
                </Field>
                <Field label="Objectives">
                  <AppTextInput value={form.objectives} onChangeText={(v) => setForm((f) => ({ ...f, objectives: v }))} multiline />
                </Field>
                <Field label="Homework">
                  <AppTextInput value={form.homework} onChangeText={(v) => setForm((f) => ({ ...f, homework: v }))} multiline />
                </Field>
                <PrimaryButton title="Add lesson plan" onPress={submitPlan} loading={saving} style={{ marginTop: spacing(2) }} />
                <SecondaryButton title="Cancel" onPress={() => setAdding(false)} style={{ marginTop: spacing(2) }} />
              </Card>
            ) : (
              <PrimaryButton title="+ New lesson plan" onPress={() => setAdding(true)} style={{ marginBottom: spacing(3) }} />
            )}
          </View>
        }
        ListEmptyComponent={<EmptyView message="No lesson plans yet." />}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing(2.5) }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Text style={styles.title}>{item.title}</Text>
              <Badge text={item.status} tone={statusTone(item.status)} />
            </Row>
            <Text style={styles.meta}>
              {item.plan_date}
              {item.period_no ? ` · Period ${item.period_no}` : ""}
              {item.topic ? ` · ${item.topic}` : ""}
            </Text>
            {item.objectives ? <Text style={styles.body}>{item.objectives}</Text> : null}
            {item.review_status ? <Badge text={`Review: ${item.review_status}`} tone={reviewTone(item.review_status)} /> : null}

            {item.status === "Planned" ? (
              <Row style={{ gap: spacing(2), marginTop: spacing(3) }}>
                <SecondaryButton title="Delivered" onPress={() => deliver(item)} style={{ flex: 1 }} />
                <SecondaryButton title="Defer" onPress={() => defer(item)} style={{ flex: 1 }} />
              </Row>
            ) : null}
            {canReview && item.review_status === "Pending" ? (
              <SecondaryButton title="Approve" onPress={() => setReviewing(item)} style={{ marginTop: spacing(2) }} />
            ) : null}
          </Card>
        )}
      />

      <PromptModal
        visible={!!reviewing}
        title="Approve this lesson plan?"
        confirmLabel="Approve"
        placeholder="Note (optional)"
        loading={reviewLoading}
        onCancel={() => setReviewing(null)}
        onConfirm={runReview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing(4) },
  title: { ...type.heading, color: colors.text, flex: 1 },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  body: { ...type.body, color: colors.text, marginTop: spacing(2), marginBottom: spacing(2) },
});
