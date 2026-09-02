import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../../api/client";
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
} from "../../../components/Common";
import PhotoField from "../../../components/PhotoField";
import { resolveFileUrl } from "../../../utils/files";
import { showAlert } from "../../../utils/alert";
import { Linking } from "react-native";
import { colors, spacing, type } from "../../../theme/theme";
import { todayISO } from "../../../utils/dates";

/** The portal's own upload route: it exists only where the school has the LMS. */
const PORTAL_UPLOAD_ENDPOINT = "/uploads/portal";

interface Submission {
  id: number;
  status: string;
  content?: string;
  attachment_url?: string;
  submitted_at?: string;
  submitted_by?: string;
  is_late?: boolean;
  marks_awarded?: number | null;
  feedback?: string;
}

interface Assignment {
  id: number;
  subject?: string;
  title: string;
  description?: string;
  due_date?: string;
  attachment_url?: string;
  teacher_name?: string;
  max_marks?: number | null;
  // Present only where the school has the LMS; homework is a notice board
  // without it.
  accepts_submissions?: boolean;
  can_submit?: boolean;
  submission?: Submission | null;
}

interface Draft {
  content?: string;
  attachment_url?: string;
}

function dueTone(due?: string): "danger" | "warning" | "default" {
  if (!due) return "default";
  const today = todayISO();
  if (due < today) return "danger";
  return due === today ? "warning" : "default";
}

export default function HomeworkTab({ studentId }: { studentId: number }) {
  const [items, setItems] = useState<Assignment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Keyed by assignment id, so switching between assignments does not lose
  // what has been typed for another.
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [submittingId, setSubmittingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await api.get<Assignment[]>(`/portal/students/${studentId}/homework`));
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load homework.");
    }
  }, [studentId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function updateDraft(assignmentId: number, field: keyof Draft, value: string) {
    setDrafts((prev) => ({ ...prev, [assignmentId]: { ...(prev[assignmentId] || {}), [field]: value } }));
  }

  async function submit(assignmentId: number) {
    const draft = drafts[assignmentId] || {};
    const content = (draft.content || "").trim();
    const attachmentUrl = (draft.attachment_url || "").trim();
    if (!content && !attachmentUrl) {
      showAlert("Nothing to submit", "Type an answer or attach a photo of your work.");
      return;
    }

    setSubmittingId(assignmentId);
    try {
      await api.post(`/portal/students/${studentId}/homework/${assignmentId}/submit`, {
        content: content || null,
        attachment_url: attachmentUrl || null,
      });
      setDrafts((prev) => ({ ...prev, [assignmentId]: {} }));
      await load();
    } catch (e) {
      showAlert(
        "Could not submit",
        e instanceof ApiError && typeof e.detail === "string" ? e.detail : "The server refused the submission."
      );
    } finally {
      setSubmittingId(null);
    }
  }

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!items) return <LoadingView />;
  if (!items.length) return <EmptyView message="No homework assigned yet." />;

  return (
    <FlatList
      data={items}
      keyExtractor={(a) => String(a.id)}
      contentContainerStyle={{ padding: spacing(4) }}
      renderItem={({ item }) => {
        const draft = drafts[item.id] || {};
        const submission = item.submission;
        return (
          <Card style={{ marginBottom: spacing(2.5) }}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.meta}>
              {[item.subject, item.teacher_name].filter(Boolean).join(" · ")}
              {item.max_marks != null ? ` · out of ${item.max_marks}` : ""}
            </Text>
            {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
            <Row style={{ gap: spacing(2) }}>
              {item.due_date ? <Badge text={`Due ${item.due_date}`} tone={dueTone(item.due_date)} /> : null}
              {submission?.is_late ? <Badge text="Late" tone="danger" /> : null}
              {submission?.status === "Graded" ? <Badge text="Graded" tone="success" /> : null}
              {submission?.status === "Submitted" ? <Badge text="Handed in" tone="success" /> : null}
            </Row>
            {item.attachment_url ? (
              <Pressable onPress={() => Linking.openURL(resolveFileUrl(item.attachment_url))}>
                <Text style={styles.link}>Open worksheet</Text>
              </Pressable>
            ) : null}

            {submission ? (
              <View style={styles.inset}>
                {submission.content ? <Text style={styles.description}>{submission.content}</Text> : null}
                {submission.attachment_url ? (
                  <Pressable onPress={() => Linking.openURL(resolveFileUrl(submission.attachment_url))}>
                    <Text style={styles.link}>Open submitted file</Text>
                  </Pressable>
                ) : null}
                {submission.status === "Graded" ? (
                  <Text style={styles.grade}>
                    Marks:{" "}
                    {submission.marks_awarded != null
                      ? `${submission.marks_awarded}${item.max_marks != null ? ` / ${item.max_marks}` : ""}`
                      : "—"}
                    {submission.feedback ? `\n${submission.feedback}` : ""}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {item.can_submit ? (
              <View style={{ marginTop: spacing(3) }}>
                <Field label={submission ? "Replace your answer" : "Your answer"}>
                  <AppTextInput
                    value={draft.content || ""}
                    onChangeText={(v) => updateDraft(item.id, "content", v)}
                    placeholder="Type your answer, or attach a photo of your work."
                    multiline
                  />
                </Field>
                <Field label="Photo of your work">
                  <PhotoField
                    value={draft.attachment_url}
                    onChange={(url) => updateDraft(item.id, "attachment_url", url)}
                    endpoint={PORTAL_UPLOAD_ENDPOINT}
                  />
                </Field>
                <PrimaryButton
                  title="Submit"
                  onPress={() => submit(item.id)}
                  loading={submittingId === item.id}
                />
              </View>
            ) : null}

            {item.accepts_submissions === false ? (
              <Text style={styles.note}>This assignment is not collected — nothing to hand in.</Text>
            ) : null}
            {item.can_submit === false && item.accepts_submissions && submission?.status !== "Graded" ? (
              <Text style={styles.note}>The due date has passed and late work is not accepted.</Text>
            ) : null}
          </Card>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  title: { ...type.heading, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2, marginBottom: spacing(2) },
  description: { ...type.body, color: colors.text, marginBottom: spacing(3) },
  link: { ...type.label, color: colors.primary, marginTop: spacing(3) },
  note: { ...type.caption, color: colors.textMuted, marginTop: spacing(2) },
  grade: { ...type.label, color: colors.text, marginTop: spacing(2) },
  inset: {
    marginTop: spacing(3),
    padding: spacing(3),
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
  },
});
