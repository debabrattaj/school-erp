import React, { useEffect, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { api, ApiError } from "../api/client";
import { AppTextInput, EmptyView, ErrorView, LoadingView } from "./Common";
import { colors, radius, spacing, type } from "../theme/theme";

/**
 * Searchable picker over any list endpoint. The forms otherwise ask for raw
 * numeric IDs, which nobody knows off-hand.
 */
export function useRecords<T = any>(endpoint: string, enabled = true) {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<T[]>(endpoint.endsWith("/") ? endpoint : `${endpoint}/`);
        if (!cancelled) setItems(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? String(e.message) : "Failed to load.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endpoint, enabled]);

  return { items, error };
}

export interface RecordPickerProps<T> {
  visible: boolean;
  onClose: () => void;
  title: string;
  endpoint: string;
  labelFor: (item: T) => string;
  subtitleFor?: (item: T) => string;
  searchFields: (keyof T | string)[];
  onPick: (item: T) => void;
}

export default function RecordPicker<T extends { id: number }>({
  visible,
  onClose,
  title,
  endpoint,
  labelFor,
  subtitleFor,
  searchFields,
  onPick,
}: RecordPickerProps<T>) {
  const { items, error } = useRecords<T>(endpoint, visible);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items || [];
    return (items || []).filter((it) =>
      searchFields.some((f) => String((it as any)[f] ?? "").toLowerCase().includes(q))
    );
  }, [items, query, searchFields]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>

        <View style={styles.searchWrap}>
          <AppTextInput value={query} onChangeText={setQuery} placeholder="Search…" autoFocus />
        </View>

        {error ? (
          <ErrorView message={error} />
        ) : !items ? (
          <LoadingView />
        ) : filtered.length === 0 ? (
          <EmptyView message="Nothing matches that search." />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(it) => String(it.id)}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: spacing(4) }}
            renderItem={({ item }) => (
              <Pressable
                style={styles.row}
                onPress={() => {
                  onPick(item);
                  onClose();
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{labelFor(item)}</Text>
                  {subtitleFor ? <Text style={styles.rowSubtitle}>{subtitleFor(item)}</Text> : null}
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

/** The tappable control that opens a picker and shows the current selection. */
export function PickerButton({
  label,
  value,
  onPress,
}: {
  label: string;
  value?: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.pickerButton}>
      <View style={{ flex: 1 }}>
        <Text style={styles.pickerLabel}>{label}</Text>
        <Text style={[styles.pickerValue, !value && styles.pickerPlaceholder]} numberOfLines={1}>
          {value || "Tap to choose"}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing(4),
    paddingTop: spacing(12),
    paddingBottom: spacing(3),
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { ...type.title, color: colors.text },
  close: { ...type.label, color: colors.primary },
  searchWrap: { padding: spacing(4), paddingBottom: 0 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing(4),
    marginBottom: spacing(2),
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowTitle: { ...type.body, color: colors.text, fontWeight: "600" },
  rowSubtitle: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  chevron: { fontSize: 22, color: colors.textMuted },
  pickerButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing(3.5),
  },
  pickerLabel: { ...type.caption, color: colors.textMuted },
  pickerValue: { ...type.body, color: colors.text, marginTop: 2 },
  pickerPlaceholder: { color: colors.textFaint },
});
