import React, { useCallback, useState } from "react";
import { FlatList, Linking, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../../api/client";
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
import { colors, spacing, type } from "../../../theme/theme";

interface LearningResource {
  id: number;
  title: string;
  description?: string;
  subject?: string;
  resource_type: string;
  url?: string;
  content?: string;
  teacher_name?: string;
  viewed?: boolean;
}

export default function LearningTab({ studentId }: { studentId: number }) {
  const [items, setItems] = useState<LearningResource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openNoteId, setOpenNoteId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await api.get<LearningResource[]>(`/portal/students/${studentId}/resources`));
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load study material.");
    }
  }, [studentId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function open(resource: LearningResource) {
    if (resource.resource_type === "Note") {
      setOpenNoteId(openNoteId === resource.id ? null : resource.id);
    } else if (resource.url) {
      Linking.openURL(resolveFileUrl(resource.url));
    }

    // Best-effort: failing to record the view must never stop a student
    // reading the material.
    try {
      await api.post(`/portal/students/${studentId}/resources/${resource.id}/view`, {});
      setItems((prev) =>
        prev ? prev.map((r) => (r.id === resource.id ? { ...r, viewed: true } : r)) : prev
      );
    } catch {
      // ignored on purpose
    }
  }

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!items) return <LoadingView />;
  if (!items.length) return <EmptyView message="No study material published for this class yet." />;

  return (
    <FlatList
      data={items}
      keyExtractor={(r) => String(r.id)}
      contentContainerStyle={{ padding: spacing(4) }}
      renderItem={({ item }) => (
        <Card style={{ marginBottom: spacing(2.5) }}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.meta}>
            {[item.subject, item.teacher_name].filter(Boolean).join(" · ") || "—"}
          </Text>
          {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
          <Row style={{ gap: spacing(2), marginBottom: spacing(2) }}>
            <Badge text={item.resource_type} />
            {item.viewed ? <Badge text="Opened" tone="success" /> : null}
          </Row>
          {item.resource_type === "Note" && openNoteId === item.id && item.content ? (
            <Text style={styles.description}>{item.content}</Text>
          ) : null}
          {item.resource_type === "Note" ? (
            <SecondaryButton
              title={openNoteId === item.id ? "Hide note" : "Read note"}
              onPress={() => open(item)}
            />
          ) : (
            <PrimaryButton
              title={`Open ${item.resource_type.toLowerCase()}`}
              onPress={() => open(item)}
            />
          )}
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  title: { ...type.heading, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2, marginBottom: spacing(2) },
  description: { ...type.body, color: colors.text, marginBottom: spacing(3) },
});
