import React, { useCallback, useState } from "react";
import { FlatList, ScrollView, StyleSheet, Text, View } from "react-native";
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
  SecondaryButton,
} from "../../../components/Common";
import { showAlert } from "../../../utils/alert";
import { colors, spacing, type } from "../../../theme/theme";

interface Topic {
  id: number;
  title: string;
  post_count: number;
  last_post_at?: string;
  created_by_name: string;
  is_pinned: boolean;
  is_locked: boolean;
}

interface Post {
  id: number;
  parent_post_id?: number | null;
  author_name: string;
  author_role: string;
  is_staff: boolean;
  body?: string | null;
  created_at?: string;
}

interface Thread {
  topic: { id: number; title: string; is_locked: boolean };
  posts: Post[];
}

export default function DiscussionTab({ studentId }: { studentId: number }) {
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [reply, setReply] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setTopics(await api.get<Topic[]>(`/portal/students/${studentId}/discussions`));
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load discussion.");
    }
  }, [studentId]);

  useFocusEffect(
    useCallback(() => {
      if (!thread) load();
    }, [load, thread])
  );

  async function openThread(topicId: number) {
    try {
      setThread(await api.get<Thread>(`/portal/students/${studentId}/discussions/${topicId}`));
      setReply("");
      setReplyTo(null);
    } catch (e) {
      showAlert("Could not open", e instanceof ApiError ? String(e.message) : "Try again.");
    }
  }

  async function post() {
    if (!thread || !reply.trim()) return;
    setPosting(true);
    try {
      await api.post(`/portal/students/${studentId}/discussions/${thread.topic.id}/posts`, {
        body: reply.trim(),
        parent_post_id: replyTo,
      });
      setReply("");
      setReplyTo(null);
      await openThread(thread.topic.id);
    } catch (e) {
      showAlert(
        "Could not post",
        e instanceof ApiError && typeof e.detail === "string" ? e.detail : "The server refused."
      );
    } finally {
      setPosting(false);
    }
  }

  if (thread) {
    return (
      <ScrollView contentContainerStyle={{ padding: spacing(4) }}>
        <Card style={{ marginBottom: spacing(3) }}>
          <Text style={styles.title}>{thread.topic.title}</Text>
          {thread.topic.is_locked ? <Badge text="Locked" tone="warning" /> : null}
          <SecondaryButton title="Back to topics" onPress={() => { setThread(null); load(); }} />
        </Card>

        {thread.posts.map((item) => (
          <Card
            key={item.id}
            style={{ marginBottom: spacing(2.5), marginLeft: item.parent_post_id ? spacing(4) : 0 }}
          >
            <Row style={{ gap: spacing(2) }}>
              <Text style={styles.author}>{item.author_name}</Text>
              {item.is_staff ? <Badge text="Staff" tone="success" /> : null}
            </Row>
            <Text style={styles.meta}>{item.created_at || ""}</Text>
            <Text style={styles.body}>{item.body}</Text>
            {!thread.topic.is_locked ? (
              <SecondaryButton
                title="Reply"
                onPress={() => setReplyTo(item.parent_post_id || item.id)}
              />
            ) : null}
          </Card>
        ))}

        {thread.topic.is_locked ? (
          <Card><Text style={styles.note}>This topic is closed for new replies.</Text></Card>
        ) : (
          <Card>
            <Field label={replyTo ? "Your reply" : "Add to the discussion"}>
              <AppTextInput value={reply} onChangeText={setReply} multiline placeholder="Write something…" />
            </Field>
            <PrimaryButton title="Post" onPress={post} loading={posting} />
            {replyTo ? <SecondaryButton title="Cancel reply" onPress={() => setReplyTo(null)} /> : null}
          </Card>
        )}
      </ScrollView>
    );
  }

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!topics) return <LoadingView />;
  if (!topics.length) return <EmptyView message="No discussion topics yet." />;

  return (
    <FlatList
      data={topics}
      keyExtractor={(topic) => String(topic.id)}
      contentContainerStyle={{ padding: spacing(4) }}
      renderItem={({ item }) => (
        <Card style={{ marginBottom: spacing(2.5) }}>
          <Text style={styles.title}>{item.is_pinned ? "📌 " : ""}{item.title}</Text>
          <Text style={styles.meta}>
            {item.post_count} post{item.post_count === 1 ? "" : "s"} · opened by {item.created_by_name}
          </Text>
          <Row style={{ gap: spacing(2), marginBottom: spacing(2) }}>
            {item.is_locked ? <Badge text="Locked" tone="warning" /> : null}
          </Row>
          <PrimaryButton title="Open" onPress={() => openThread(item.id)} />
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  title: { ...type.heading, color: colors.text },
  author: { ...type.label, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2, marginBottom: spacing(2) },
  body: { ...type.body, color: colors.text, marginBottom: spacing(2) },
  note: { ...type.caption, color: colors.textMuted },
});
