import React, { useCallback, useState } from "react";
import { FlatList, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError, getApiBaseSync } from "../../../api/client";
import {
  Badge,
  Card,
  EmptyView,
  ErrorView,
  LoadingView,
  PrimaryButton,
  Row,
  SecondaryButton,
} from "../../../components/Common";
import { resolveFileUrl } from "../../../utils/files";
import { showAlert } from "../../../utils/alert";
import { colors, spacing, type } from "../../../theme/theme";

interface CourseSummary {
  id: number;
  title: string;
  description?: string;
  subject?: string;
  trainer_name?: string;
  course_type: string;
  is_mandatory?: boolean;
  enrolled: boolean;
  status?: string | null;
  progress_percent: number;
  can_self_enroll: boolean;
  prerequisite_met: boolean;
  prerequisite_course_title?: string | null;
}

interface Lesson {
  id: number;
  title: string;
  description?: string;
  content_type: string;
  completion_rule: string;
  is_required: boolean;
  completed: boolean;
  locked: boolean;
  content?: string;
  url?: string;
  scorm_package_id?: number;
  resource?: { title: string; resource_type: string; url?: string; content?: string };
}

interface CourseDetail {
  course: { id: number; title: string; subject?: string; trainer_name?: string; enforce_lesson_order: boolean };
  enrollment: { status: string; progress_percent: number };
  sections: { id: number; title: string; sequence_no: number; lessons: Lesson[] }[];
  sessions: {
    id: number; title: string; mode: string; venue?: string; meeting_url?: string;
    starts_at?: string; trainer_name?: string;
  }[];
}

export default function CoursesTab({ studentId }: { studentId: number }) {
  const [items, setItems] = useState<CourseSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await api.get<CourseSummary[]>(`/portal/students/${studentId}/courses`));
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load courses.");
    }
  }, [studentId]);

  useFocusEffect(
    useCallback(() => {
      if (!detail) load();
    }, [load, detail])
  );

  async function open(courseId: number) {
    setBusy(true);
    try {
      setDetail(await api.get<CourseDetail>(`/portal/students/${studentId}/courses/${courseId}`));
    } catch (e) {
      showAlert("Could not open", e instanceof ApiError ? String(e.message) : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function joinCourse(courseId: number) {
    try {
      await api.post(`/portal/students/${studentId}/courses/${courseId}/enroll`, {});
      await load();
    } catch (e) {
      showAlert(
        "Could not join",
        e instanceof ApiError && typeof e.detail === "string" ? e.detail : "The server refused."
      );
    }
  }

  async function markDone(lessonId: number) {
    if (!detail) return;
    try {
      await api.post(
        `/portal/students/${studentId}/courses/${detail.course.id}/lessons/${lessonId}/complete`,
        {}
      );
      await open(detail.course.id);
    } catch (e) {
      showAlert(
        "Could not update",
        e instanceof ApiError && typeof e.detail === "string" ? e.detail : "Try again."
      );
    }
  }

  async function launchScorm(packageId: number) {
    try {
      const response = await api.post<{ player_url: string }>(
        `/portal/students/${studentId}/scorm/${packageId}/launch`,
        {}
      );
      // The player must run on the API origin: SCORM content reaches its LMS
      // through window.parent, which is blocked across origins.
      Linking.openURL(`${getApiBaseSync()}${response.player_url}`);
    } catch (e) {
      showAlert("Could not open", e instanceof ApiError ? String(e.message) : "Try again.");
    }
  }

  if (detail) {
    return (
      <ScrollView contentContainerStyle={{ padding: spacing(4) }}>
        <Card style={{ marginBottom: spacing(3) }}>
          <Text style={styles.title}>{detail.course.title}</Text>
          <Text style={styles.meta}>
            {[detail.course.subject, detail.course.trainer_name].filter(Boolean).join(" · ")}
          </Text>
          <Row style={{ gap: spacing(2), marginBottom: spacing(2) }}>
            <Badge text={`${detail.enrollment.progress_percent}% done`} />
            {detail.enrollment.status === "Completed" ? <Badge text="Completed" tone="success" /> : null}
          </Row>
          <SecondaryButton title="Back to courses" onPress={() => { setDetail(null); load(); }} />
        </Card>

        {detail.sections.map((section) => (
          <Card key={section.id} style={{ marginBottom: spacing(3) }}>
            <Text style={styles.title}>{section.sequence_no}. {section.title}</Text>
            {section.lessons.map((lesson) => (
              <View key={lesson.id} style={styles.lesson}>
                <Text style={styles.lessonTitle}>{lesson.title}</Text>
                <Row style={{ gap: spacing(2), marginVertical: spacing(1) }}>
                  {lesson.completed ? <Badge text="Done" tone="success" /> : null}
                  {lesson.locked ? <Badge text="Locked" tone="warning" /> : null}
                  {!lesson.is_required ? <Badge text="Optional" /> : null}
                </Row>
                {lesson.locked ? (
                  <Text style={styles.note}>Finish the earlier lessons to open this.</Text>
                ) : (
                  <>
                    {lesson.content_type === "text" && lesson.content ? (
                      <Text style={styles.body}>{lesson.content}</Text>
                    ) : null}
                    {lesson.resource?.resource_type === "Note" && lesson.resource.content ? (
                      <Text style={styles.body}>{lesson.resource.content}</Text>
                    ) : null}
                    {["link", "video", "document"].includes(lesson.content_type) && lesson.url ? (
                      <SecondaryButton
                        title={`Open ${lesson.content_type}`}
                        onPress={() => Linking.openURL(resolveFileUrl(lesson.url))}
                      />
                    ) : null}
                    {lesson.content_type === "resource" && lesson.resource?.url ? (
                      <SecondaryButton
                        title="Open resource"
                        onPress={() => Linking.openURL(resolveFileUrl(lesson.resource?.url))}
                      />
                    ) : null}
                    {lesson.content_type === "scorm" && lesson.scorm_package_id ? (
                      <PrimaryButton
                        title="Launch module"
                        onPress={() => launchScorm(lesson.scorm_package_id as number)}
                      />
                    ) : null}
                    {["view", "manual"].includes(lesson.completion_rule) && !lesson.completed ? (
                      <PrimaryButton title="Mark as done" onPress={() => markDone(lesson.id)} />
                    ) : null}
                  </>
                )}
              </View>
            ))}
            {!section.lessons.length ? <Text style={styles.note}>No lessons yet.</Text> : null}
          </Card>
        ))}

        {detail.sessions.length ? (
          <Card>
            <Text style={styles.title}>Sessions</Text>
            {detail.sessions.map((session) => (
              <View key={session.id} style={styles.lesson}>
                <Text style={styles.lessonTitle}>{session.title}</Text>
                <Text style={styles.meta}>
                  {[session.starts_at, session.venue || session.mode, session.trainer_name]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
                {session.mode === "online" && session.meeting_url ? (
                  <SecondaryButton title="Join online" onPress={() => Linking.openURL(session.meeting_url as string)} />
                ) : null}
              </View>
            ))}
          </Card>
        ) : null}
      </ScrollView>
    );
  }

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!items || busy) return <LoadingView />;
  if (!items.length) return <EmptyView message="No courses for this student yet." />;

  return (
    <FlatList
      data={items}
      keyExtractor={(course) => String(course.id)}
      contentContainerStyle={{ padding: spacing(4) }}
      renderItem={({ item }) => (
        <Card style={{ marginBottom: spacing(2.5) }}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.meta}>
            {[item.subject, item.trainer_name].filter(Boolean).join(" · ") || "—"}
          </Text>
          {item.description ? <Text style={styles.body}>{item.description}</Text> : null}
          <Row style={{ gap: spacing(2), marginBottom: spacing(2) }}>
            {item.is_mandatory ? <Badge text="Mandatory" tone="danger" /> : null}
            {item.status === "Completed" ? (
              <Badge text="Completed" tone="success" />
            ) : item.enrolled ? (
              <Badge text={`${item.progress_percent}%`} />
            ) : null}
          </Row>
          {!item.prerequisite_met && item.prerequisite_course_title ? (
            <Text style={styles.note}>Finish {item.prerequisite_course_title} first.</Text>
          ) : null}
          {item.enrolled ? (
            <PrimaryButton
              title={item.progress_percent > 0 ? "Continue" : "Start"}
              onPress={() => open(item.id)}
            />
          ) : item.can_self_enroll ? (
            <SecondaryButton title="Join this course" onPress={() => joinCourse(item.id)} />
          ) : (
            <Text style={styles.note}>Ask your teacher to add you to this course.</Text>
          )}
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  title: { ...type.heading, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2, marginBottom: spacing(2) },
  body: { ...type.body, color: colors.text, marginBottom: spacing(2) },
  note: { ...type.caption, color: colors.textMuted, marginTop: spacing(1) },
  lesson: {
    marginTop: spacing(3),
    paddingTop: spacing(3),
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  lessonTitle: { ...type.label, color: colors.text },
});
