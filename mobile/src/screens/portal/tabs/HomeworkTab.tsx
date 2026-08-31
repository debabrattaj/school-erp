import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../../api/client";
import { Badge, Card, EmptyView, ErrorView, LoadingView } from "../../../components/Common";
import { resolveFileUrl } from "../../../utils/files";
import { Linking } from "react-native";
import { colors, spacing, type } from "../../../theme/theme";
import { todayISO } from "../../../utils/dates";

interface Assignment {
  id: number;
  subject?: string;
  title: string;
  description?: string;
  due_date?: string;
  attachment_url?: string;
  teacher_name?: string;
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

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!items) return <LoadingView />;
  if (!items.length) return <EmptyView message="No homework assigned yet." />;

  return (
    <FlatList
      data={items}
      keyExtractor={(a) => String(a.id)}
      contentContainerStyle={{ padding: spacing(4) }}
      renderItem={({ item }) => (
        <Card style={{ marginBottom: spacing(2.5) }}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.meta}>{[item.subject, item.teacher_name].filter(Boolean).join(" · ")}</Text>
          {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
          {item.due_date ? (
            <Badge
              text={`Due ${item.due_date}`}
              tone={dueTone(item.due_date)}
            />
          ) : null}
          {item.attachment_url ? (
            <Pressable onPress={() => Linking.openURL(resolveFileUrl(item.attachment_url))}>
              <Text style={styles.link}>Open attachment</Text>
            </Pressable>
          ) : null}
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  title: { ...type.heading, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2, marginBottom: spacing(2) },
  description: { ...type.body, color: colors.text, marginBottom: spacing(3) },
  link: { ...type.label, color: colors.primary, marginTop: spacing(3) },
});
