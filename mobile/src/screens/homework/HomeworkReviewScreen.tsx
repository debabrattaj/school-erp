import React, { useCallback, useMemo, useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { resolveFileUrl } from "../../utils/files";
import { showAlert } from "../../utils/alert";
import {
  AppTextInput, Badge, Card, EmptyView, ErrorView, Field, LoadingView, PrimaryButton, SecondaryButton,
} from "../../components/Common";
import { OptionPicker } from "../../components/Pickers";
import { colors, spacing, type } from "../../theme/theme";

interface Assignment {
  id: number;
  title: string;
  class_name?: string;
  section?: string;
  subject?: string;
  max_marks?: number | null;
  submission_count?: number;
  graded_count?: number;
}

interface Submission {
  id: number;
  student_id: number;
  student_name_snapshot?: string;
  admission_no?: string;
  status: string;
  content?: string;
  attachment_url?: string;
  is_late?: boolean;
  marks_awarded?: number | null;
  feedback?: string;
}

interface Board {
  assignment: Assignment;
  submissions: Submission[];
  pending_students: { student_id: number; student_name: string; admission_no?: string }[];
  total_students: number;
  submitted_count: number;
  graded_count: number;
  late_count: number;
}

type Draft = { marks?: string; feedback?: string; note?: string };
const errorText = (e: unknown) => e instanceof ApiError ? String(e.message) : "Unable to complete this action.";

export default function HomeworkReviewScreen() {
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [assignmentId, setAssignmentId] = useState("");
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});

  const loadAssignments = useCallback(async () => {
    setError(null);
    try {
      const rows = await api.get<Assignment[]>("/homework/");
      setAssignments(rows);
      setAssignmentId((current) => current || (rows[0] ? String(rows[0].id) : ""));
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  const loadBoard = useCallback(async () => {
    if (!assignmentId) { setBoard(null); return; }
    setError(null);
    setLoadingBoard(true);
    try {
      setBoard(await api.get<Board>(`/homework/${assignmentId}/submissions`));
    } catch (e) {
      setBoard(null);
      setError(errorText(e));
    } finally {
      setLoadingBoard(false);
    }
  }, [assignmentId]);

  useFocusEffect(useCallback(() => { loadAssignments(); }, [loadAssignments]));
  useFocusEffect(useCallback(() => { loadBoard(); }, [loadBoard]));

  const assignmentOptions = useMemo(() => (assignments || []).map((a) => ({
    value: String(a.id),
    label: a.title,
    subtitle: [a.class_name, a.section, a.subject].filter(Boolean).join(" · "),
  })), [assignments]);

  function update(id: number, key: keyof Draft, value: string) {
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] || {}), [key]: value } }));
  }

  async function saveDraft(submission: Submission) {
    const draft = drafts[submission.id] || {};
    const raw = (draft.marks ?? (submission.marks_awarded != null ? String(submission.marks_awarded) : "")).trim();
    const feedback = draft.feedback ?? submission.feedback ?? "";
    const marks = raw === "" || raw == null ? null : Number(raw);
    if (marks != null && (!Number.isFinite(marks) || marks < 0 || (board?.assignment.max_marks != null && marks > board.assignment.max_marks))) {
      showAlert("Invalid marks", `Enter a value between 0 and ${board?.assignment.max_marks ?? "the assignment total"}.`);
      return;
    }
    if (marks == null && !feedback.trim()) {
      showAlert("Feedback required", "Enter marks or written feedback before saving a draft grade.");
      return;
    }
    setBusyId(submission.id);
    try {
      await api.put(`/homework/${assignmentId}/submissions/${submission.id}/grade`, {
        marks_awarded: marks,
        feedback: feedback.trim() || null,
      });
      await loadBoard();
      showAlert("Saved", "Draft grade saved. Publish it when it is ready for the family.");
    } catch (e) {
      showAlert("Could not save", errorText(e));
    } finally {
      setBusyId(null);
    }
  }

  async function decide(submission: Submission, action: "publish" | "return") {
    const note = drafts[submission.id]?.note?.trim();
    if (!note) {
      showAlert("Note required", action === "publish" ? "Enter a publication note." : "Enter feedback explaining what must be revised.");
      return;
    }
    setBusyId(submission.id);
    try {
      await api.post(`/homework/${assignmentId}/submissions/${submission.id}/${action}`, { note });
      await loadBoard();
      showAlert("Done", action === "publish" ? "Grade published to the family." : "Work returned for revision.");
    } catch (e) {
      showAlert("Could not update submission", errorText(e));
    } finally {
      setBusyId(null);
    }
  }

  if (!assignments && !error) return <LoadingView />;
  if (error && !assignments) return <ErrorView message={error} onRetry={loadAssignments} />;

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Homework submissions</Text>
      <Text style={styles.intro}>Save draft grades, publish feedback, or return work for revision.</Text>
      <Field label="Assignment" required>
        <OptionPicker label="Assignment" options={assignmentOptions} value={assignmentId} onChange={(v) => { setAssignmentId(v); setBoard(null); }} required />
      </Field>

      {!assignmentId ? <EmptyView message="Choose an assignment to review submissions." /> : loadingBoard ? <LoadingView /> : !board ? (
        <ErrorView message={error || "Could not load submissions."} onRetry={loadBoard} />
      ) : <>
        <Card style={styles.summary}>
          <Text style={styles.assignment}>{board.assignment.title}</Text>
          <View style={styles.metrics}>
            <Text style={styles.metric}>{board.submitted_count}/{board.total_students} submitted</Text>
            <Text style={styles.metric}>{board.graded_count} published</Text>
            <Text style={styles.metric}>{board.late_count} late</Text>
          </View>
        </Card>

        {!board.submissions.length ? <EmptyView message="No work has been handed in yet." /> : board.submissions.map((submission) => {
          const draft = drafts[submission.id] || {};
          return (
            <Card key={submission.id} style={styles.card}>
              <View style={styles.header}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.student}>{submission.student_name_snapshot || `Student #${submission.student_id}`}</Text>
                  <Text style={styles.meta}>{submission.admission_no || ""}</Text>
                </View>
                <Badge text={submission.status} tone={submission.status === "Graded" ? "success" : submission.status === "Returned" ? "warning" : "default"} />
              </View>
              {submission.is_late ? <Badge text="Late" tone="danger" /> : null}
              {submission.content ? <Text style={styles.answer}>{submission.content}</Text> : null}
              {submission.attachment_url ? <SecondaryButton title="Open submitted file" onPress={() => Linking.openURL(resolveFileUrl(submission.attachment_url))} /> : null}
              {submission.marks_awarded != null || submission.feedback ? <Text style={styles.saved}>Saved: {submission.marks_awarded ?? "—"}{board.assignment.max_marks != null ? ` / ${board.assignment.max_marks}` : ""}{submission.feedback ? ` · ${submission.feedback}` : ""}</Text> : null}

              {submission.status !== "Graded" && submission.status !== "Returned" ? <>
                <Field label="Marks"><AppTextInput value={draft.marks ?? (submission.marks_awarded != null ? String(submission.marks_awarded) : "")} onChangeText={(v) => update(submission.id, "marks", v)} keyboardType="decimal-pad" /></Field>
                <Field label="Feedback"><AppTextInput value={draft.feedback ?? submission.feedback ?? ""} onChangeText={(v) => update(submission.id, "feedback", v)} multiline style={styles.feedback} /></Field>
                <PrimaryButton title="Save draft grade" onPress={() => saveDraft(submission)} loading={busyId === submission.id} />
              </> : null}

              <Field label="Publication / return note"><AppTextInput value={draft.note || ""} onChangeText={(v) => update(submission.id, "note", v)} multiline /></Field>
              {submission.status === "DraftGraded" ? <PrimaryButton title="Publish grade" onPress={() => decide(submission, "publish")} loading={busyId === submission.id} /> : null}
              {submission.status !== "Returned" ? <SecondaryButton title="Return for revision" onPress={() => decide(submission, "return")} /> : null}
            </Card>
          );
        })}

        {board.pending_students.length ? <Card style={styles.card}>
          <Text style={styles.assignment}>Not submitted</Text>
          {board.pending_students.map((student) => <Text key={student.student_id} style={styles.pending}>{student.student_name}{student.admission_no ? ` · ${student.admission_no}` : ""}</Text>)}
        </Card> : null}
      </>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing(4), paddingBottom: spacing(12), backgroundColor: colors.background, flexGrow: 1 },
  title: { ...type.title, color: colors.text },
  intro: { ...type.body, color: colors.textMuted, marginTop: spacing(1), marginBottom: spacing(4) },
  summary: { marginBottom: spacing(3) },
  assignment: { ...type.heading, color: colors.text },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: spacing(3), marginTop: spacing(2) },
  metric: { ...type.caption, color: colors.textMuted },
  card: { marginBottom: spacing(3), gap: spacing(3) },
  header: { flexDirection: "row", alignItems: "center", gap: spacing(3) },
  student: { ...type.heading, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted },
  answer: { ...type.body, color: colors.text, backgroundColor: colors.surfaceAlt, padding: spacing(3) },
  saved: { ...type.label, color: colors.primaryDark },
  feedback: { minHeight: 72, textAlignVertical: "top" },
  pending: { ...type.body, color: colors.text, paddingVertical: spacing(1) },
});
