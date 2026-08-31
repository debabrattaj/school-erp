import React, { useCallback, useState } from "react";
import { FlatList, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { Badge, Card, EmptyView, ErrorView, LoadingView, Row } from "../../components/Common";
import { colors, spacing, type } from "../../theme/theme";

interface Log {
  id: number;
  channel?: string;
  category: string;
  recipient_name: string;
  message_body: string;
  status?: string;
  template_name?: string;
  sent_at?: string;
  error_message?: string;
}

const STATUS_FILTERS = ["All", "Sent", "Queued", "Failed"];

function statusTone(status?: string): "default" | "success" | "warning" | "danger" {
  if (status === "Sent") return "success";
  if (status === "Queued") return "warning";
  if (status === "Failed") return "danger";
  return "default";
}

export default function LogTab() {
  const [statusFilter, setStatusFilter] = useState("All");
  const [logs, setLogs] = useState<Log[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setLogs(await api.get<Log[]>("/communications/logs/", statusFilter !== "All" ? { status: statusFilter } : undefined));
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load the message log.");
    }
  }, [statusFilter]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!logs) return <LoadingView />;

  return (
    <FlatList
      data={logs}
      keyExtractor={(l) => String(l.id)}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={styles.chipRow}>
          {STATUS_FILTERS.map((s) => (
            <Text key={s} onPress={() => setStatusFilter(s)} style={[styles.chip, statusFilter === s && styles.chipActive]}>
              {s}
            </Text>
          ))}
        </View>
      }
      ListEmptyComponent={<EmptyView message="No messages sent yet." />}
      renderItem={({ item }) => (
        <Card style={{ marginBottom: spacing(2.5) }}>
          <Row style={{ justifyContent: "space-between" }}>
            <Text style={styles.name}>{item.recipient_name}</Text>
            <Badge text={item.status || "Queued"} tone={statusTone(item.status)} />
          </Row>
          <Text style={styles.meta}>
            {item.category}
            {item.channel ? ` · ${item.channel}` : ""}
            {item.sent_at ? ` · ${item.sent_at.slice(0, 16).replace("T", " ")}` : ""}
          </Text>
          <Text style={styles.body} numberOfLines={3}>
            {item.message_body}
          </Text>
          {item.error_message ? <Text style={styles.error}>{item.error_message}</Text> : null}
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing(4) },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing(2), marginBottom: spacing(3) },
  chip: {
    ...type.caption,
    color: colors.textMuted,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 999,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
    overflow: "hidden",
  },
  chipActive: { backgroundColor: colors.primary, color: colors.onPrimary },
  name: { ...type.heading, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  body: { ...type.body, color: colors.text, marginTop: spacing(2) },
  error: { ...type.caption, color: colors.danger, marginTop: spacing(1) },
});
