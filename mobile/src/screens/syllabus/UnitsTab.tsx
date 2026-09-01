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
  Row,
  SecondaryButton,
} from "../../components/Common";
import { DatePicker } from "../../components/Pickers";
import { useAuth } from "../../auth/AuthContext";
import { hasReviewerAccess } from "../../auth/types";
import { colors, elevation, radius, spacing, type } from "../../theme/theme";

interface Topic {
  id: number;
  unit_id: number;
  title: string;
  planned_periods: number;
  status: string;
  periods_taken?: number;
}

interface Unit {
  id: number;
  title: string;
  description?: string;
  planned_periods?: number;
  planned_start?: string;
  planned_end?: string;
  status: string;
  topics: Topic[];
  progress: { total_topics: number; completed_topics: number; percent: number };
}

const TOPIC_STATUSES = ["Pending", "In Progress", "Completed"];

function statusTone(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "Completed") return "success";
  if (status === "In Progress") return "warning";
  return "default";
}

const emptyUnitForm = { title: "", description: "", plannedPeriods: "", start: "", end: "" };
const emptyTopicForm = { title: "", plannedPeriods: "1" };

export default function UnitsTab({ classSubjectId }: { classSubjectId: number }) {
  const { user } = useAuth();
  // delete_unit/delete_topic are reviewer-only server-side (REVIEWERS =
  // ["Admin","Principal"]) even though Teacher's own permission map claims
  // "syllabus": "manage" -- see hasReviewerAccess()'s doc comment.
  const canDelete = hasReviewerAccess(user?.role, user?.permissions, "syllabus");

  const [units, setUnits] = useState<Unit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [unitForm, setUnitForm] = useState(emptyUnitForm);
  const [saving, setSaving] = useState(false);

  const [addingTopicFor, setAddingTopicFor] = useState<Unit | null>(null);
  const [topicForm, setTopicForm] = useState(emptyTopicForm);
  const [topicSaving, setTopicSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setUnits(await api.get<Unit[]>("/syllabus/units", { class_subject_id: classSubjectId }));
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load the syllabus.");
    }
  }, [classSubjectId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function submitUnit() {
    if (!unitForm.title.trim()) {
      Alert.alert("Missing details", "A unit title is required.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/syllabus/units", {
        class_subject_id: classSubjectId,
        title: unitForm.title.trim(),
        description: unitForm.description.trim() || undefined,
        planned_periods: unitForm.plannedPeriods ? Number(unitForm.plannedPeriods) : undefined,
        planned_start: unitForm.start || undefined,
        planned_end: unitForm.end || undefined,
      });
      setUnitForm(emptyUnitForm);
      setAdding(false);
      await load();
    } catch (e) {
      Alert.alert("Could not add unit", e instanceof ApiError && typeof e.detail === "string" ? e.detail : "The server refused the request.");
    } finally {
      setSaving(false);
    }
  }

  async function submitTopic() {
    if (!addingTopicFor || !topicForm.title.trim()) {
      Alert.alert("Missing details", "A topic title is required.");
      return;
    }
    setTopicSaving(true);
    try {
      await api.post(`/syllabus/units/${addingTopicFor.id}/topics`, {
        title: topicForm.title.trim(),
        planned_periods: Number(topicForm.plannedPeriods) || 1,
      });
      setAddingTopicFor(null);
      setTopicForm(emptyTopicForm);
      await load();
    } catch (e) {
      Alert.alert("Could not add topic", e instanceof ApiError && typeof e.detail === "string" ? e.detail : "The server refused the request.");
    } finally {
      setTopicSaving(false);
    }
  }

  async function markTopic(topic: Topic, status: string) {
    try {
      await api.post(`/syllabus/topics/${topic.id}/mark`, { status });
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof ApiError && typeof e.detail === "string" ? e.detail : "Could not update this topic.");
    }
  }

  function deleteUnit(unit: Unit) {
    Alert.alert("Delete this unit?", unit.title, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/syllabus/units/${unit.id}`);
            await load();
          } catch (e) {
            Alert.alert("Error", e instanceof ApiError && typeof e.detail === "string" ? e.detail : "Could not delete this unit.");
          }
        },
      },
    ]);
  }

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!units) return <LoadingView />;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={units}
        keyExtractor={(u) => String(u.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            {adding ? (
              <Card style={{ marginBottom: spacing(3) }}>
                <Field label="Title" required>
                  <AppTextInput value={unitForm.title} onChangeText={(v) => setUnitForm((f) => ({ ...f, title: v }))} placeholder="e.g. Algebra Basics" />
                </Field>
                <Field label="Description">
                  <AppTextInput value={unitForm.description} onChangeText={(v) => setUnitForm((f) => ({ ...f, description: v }))} multiline />
                </Field>
                <Field label="Planned periods">
                  <AppTextInput value={unitForm.plannedPeriods} onChangeText={(v) => setUnitForm((f) => ({ ...f, plannedPeriods: v }))} keyboardType="numeric" />
                </Field>
                <Row style={{ gap: spacing(3) }}>
                  <View style={{ flex: 1 }}>
                    <Field label="Planned start">
                      <DatePicker label="Planned start" value={unitForm.start} onChange={(v) => setUnitForm((f) => ({ ...f, start: v }))} />
                    </Field>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field label="Planned end">
                      <DatePicker label="Planned end" value={unitForm.end} onChange={(v) => setUnitForm((f) => ({ ...f, end: v }))} />
                    </Field>
                  </View>
                </Row>
                <PrimaryButton title="Add unit" onPress={submitUnit} loading={saving} style={{ marginTop: spacing(2) }} />
                <SecondaryButton title="Cancel" onPress={() => setAdding(false)} style={{ marginTop: spacing(2) }} />
              </Card>
            ) : (
              <PrimaryButton title="+ New unit" onPress={() => setAdding(true)} style={{ marginBottom: spacing(3) }} />
            )}
          </View>
        }
        ListEmptyComponent={<EmptyView message="No syllabus units yet." />}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing(3) }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Text style={styles.unitTitle}>{item.title}</Text>
              <Badge text={item.status} tone={statusTone(item.status)} />
            </Row>
            <Text style={styles.meta}>
              {item.progress.percent}% covered · {item.progress.completed_topics}/{item.progress.total_topics} topics
              {item.planned_end ? ` · due ${item.planned_end}` : ""}
            </Text>
            {item.description ? <Text style={styles.description}>{item.description}</Text> : null}

            {item.topics.map((t) => (
              <View key={t.id} style={styles.topicRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.topicTitle}>{t.title}</Text>
                  <Row style={{ gap: spacing(1.5), marginTop: spacing(1.5), flexWrap: "wrap" }}>
                    {TOPIC_STATUSES.map((s) => (
                      <Text
                        key={s}
                        onPress={() => markTopic(t, s)}
                        style={[styles.topicChip, t.status === s && styles.topicChipActive]}
                      >
                        {s}
                      </Text>
                    ))}
                  </Row>
                </View>
              </View>
            ))}

            <Row style={{ gap: spacing(2), marginTop: spacing(3) }}>
              <SecondaryButton title="+ Topic" onPress={() => setAddingTopicFor(item)} style={{ flex: 1 }} />
              {canDelete ? <SecondaryButton title="Delete unit" onPress={() => deleteUnit(item)} style={{ flex: 1 }} /> : null}
            </Row>
          </Card>
        )}
      />

      <Modal visible={!!addingTopicFor} transparent animationType="fade" onRequestClose={() => setAddingTopicFor(null)}>
        <Pressable style={styles.backdrop} onPress={() => setAddingTopicFor(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Add topic to {addingTopicFor?.title}</Text>
            <Field label="Title" required>
              <AppTextInput value={topicForm.title} onChangeText={(v) => setTopicForm((f) => ({ ...f, title: v }))} placeholder="e.g. Linear equations" />
            </Field>
            <Field label="Planned periods">
              <AppTextInput value={topicForm.plannedPeriods} onChangeText={(v) => setTopicForm((f) => ({ ...f, plannedPeriods: v }))} keyboardType="numeric" />
            </Field>
            <Row style={{ gap: spacing(3) }}>
              <SecondaryButton title="Cancel" onPress={() => setAddingTopicFor(null)} style={{ flex: 1 }} />
              <PrimaryButton title="Add" onPress={submitTopic} loading={topicSaving} style={{ flex: 1 }} />
            </Row>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing(4) },
  unitTitle: { ...type.heading, color: colors.text, flex: 1 },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  description: { ...type.body, color: colors.text, marginTop: spacing(2) },
  topicRow: {
    flexDirection: "row",
    paddingVertical: spacing(2.5),
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing(3),
  },
  topicTitle: { ...type.body, color: colors.text, fontWeight: "600" },
  topicChip: {
    ...type.caption,
    color: colors.textMuted,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 999,
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1),
    overflow: "hidden",
  },
  topicChipActive: { backgroundColor: colors.primary, color: colors.onPrimary },

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
});
