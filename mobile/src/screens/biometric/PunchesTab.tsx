import React, { useCallback, useState } from "react";
import { FlatList, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { Badge, Card, EmptyView, ErrorView, LoadingView, Row } from "../../components/Common";
import { DatePicker } from "../../components/Pickers";
import { colors, spacing, type } from "../../theme/theme";

interface Punch {
  id: number;
  device_id: number;
  device_user_id?: string;
  punched_at: string;
  direction?: string;
  student_id?: number;
  teacher_id?: number;
}

export default function PunchesTab() {
  const [onDate, setOnDate] = useState("");
  const [unmatchedOnly, setUnmatchedOnly] = useState(false);
  const [punches, setPunches] = useState<Punch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPunches(
        await api.get<Punch[]>("/biometric/punches", {
          on_date: onDate || undefined,
          unmatched_only: unmatchedOnly || undefined,
        })
      );
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load punches.");
    }
  }, [onDate, unmatchedOnly]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!punches) return <LoadingView />;

  return (
    <FlatList
      data={punches}
      keyExtractor={(p) => String(p.id)}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={{ marginBottom: spacing(3) }}>
          <DatePicker label="Date" value={onDate} onChange={setOnDate} />
          <Row style={{ marginTop: spacing(2.5) }}>
            <Text onPress={() => setUnmatchedOnly((v) => !v)} style={[styles.chip, unmatchedOnly && styles.chipActive]}>
              Unmatched only
            </Text>
          </Row>
        </View>
      }
      ListEmptyComponent={<EmptyView message="No punches for this filter." />}
      renderItem={({ item }) => (
        <Card style={{ marginBottom: spacing(2.5) }}>
          <Row style={{ justifyContent: "space-between" }}>
            <Text style={styles.time}>{item.punched_at.slice(0, 16).replace("T", " ")}</Text>
            {item.direction ? <Badge text={item.direction} /> : null}
          </Row>
          <Text style={styles.meta}>
            Device user {item.device_user_id || "—"}
            {!item.student_id && !item.teacher_id ? " · Unmatched" : ""}
          </Text>
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing(4) },
  time: { ...type.heading, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
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
});
