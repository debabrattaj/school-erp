import React, { useEffect, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { api, ApiError } from "../api/client";
import { AppTextInput, EmptyView, ErrorView, LoadingView } from "./Common";
import { colors, radius, spacing, type } from "../theme/theme";

export interface Choice {
  value: string;
  subtitle?: string;
}

/**
 * Distinct values of one column across another module's records — e.g. every
 * `class_name` in Classes. These columns are denormalised text on the target
 * record, so the picker stores the value rather than an id.
 */
export function useLookupChoices(
  endpoint: string,
  valueField: string,
  subtitleFields: string[] | undefined,
  enabled: boolean,
  /** Joined with a space to form the value, when one column is not the whole of it. */
  valueFields?: string[]
) {
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // Reset first: without this a single failure stuck, and reopening the
    // picker kept showing the old error instead of retrying.
    setError(null);
    (async () => {
      try {
        const rows = await api.get<any[]>(endpoint.endsWith("/") ? endpoint : `${endpoint}/`);
        const seen = new Map<string, Choice>();
        const compose = (row: any) =>
          valueFields?.length
            ? valueFields.map((f) => row?.[f]).filter((v) => v !== undefined && v !== null && v !== "").join(" ").trim()
            : row?.[valueField];

        for (const row of rows) {
          const value = compose(row);
          if (value === undefined || value === null || value === "") continue;
          const key = String(value);
          // First record wins; later duplicates only differ by their subtitle.
          if (!seen.has(key)) {
            const subtitle = subtitleFields
              ?.map((f) => row[f])
              .filter(Boolean)
              .join(" · ");
            seen.set(key, { value: key, subtitle: subtitle || undefined });
          }
        }
        if (!cancelled) {
          setChoices(Array.from(seen.values()).sort((a, b) => a.value.localeCompare(b.value)));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? String(e.message) : "Failed to load options.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endpoint, valueField, enabled, JSON.stringify(valueFields ?? null)]);

  return { choices, error };
}

interface MasterDataItem {
  value: string;
  label?: string;
}

/** Values configured under a Master Data category (Gender, House, Section, …). */
export function useMasterChoices(category: string, enabled: boolean) {
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        const res = await api.get<{ values?: MasterDataItem[] }>(`/master-data/${encodeURIComponent(category)}`);
        // De-duplicated: FlatList keys off the value, and a repeated entry in
        // the category would collapse the rows onto one key.
        const seen = new Set<string>();
        const values = (res?.values || [])
          .map((v) => String(v.value))
          .filter((v) => v !== "" && !seen.has(v) && (seen.add(v), true))
          .map((value) => ({ value }));
        if (!cancelled) setChoices(values);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? String(e.message) : "Failed to load options.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [category, enabled]);

  return { choices, error };
}

/**
 * Modal list of text choices. Used for both lookup and master-data fields; it
 * also accepts a free-typed value so a form is never blocked by a missing
 * master-data entry.
 */
export default function ValuePicker({
  visible,
  onClose,
  title,
  choices,
  error,
  onPick,
  allowCustom = true,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  choices: Choice[] | null;
  error: string | null;
  onPick: (value: string) => void;
  allowCustom?: boolean;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return choices || [];
    return (choices || []).filter(
      (c) => c.value.toLowerCase().includes(q) || (c.subtitle || "").toLowerCase().includes(q)
    );
  }, [choices, query]);

  const typed = query.trim();
  const exactExists = (choices || []).some((c) => c.value.toLowerCase() === typed.toLowerCase());

  function choose(value: string) {
    onPick(value);
    setQuery("");
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>

        <View style={styles.searchWrap}>
          <AppTextInput value={query} onChangeText={setQuery} placeholder="Search or type a value…" autoFocus />
        </View>

        {error ? (
          <ErrorView message={error} />
        ) : !choices ? (
          <LoadingView />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(c) => c.value}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: spacing(4) }}
            ListHeaderComponent={
              allowCustom && typed && !exactExists ? (
                <Pressable style={[styles.row, styles.customRow]} onPress={() => choose(typed)}>
                  <Text style={styles.customText}>Use “{typed}”</Text>
                </Pressable>
              ) : null
            }
            ListEmptyComponent={
              typed ? null : <EmptyView message="No options configured yet — type a value to use." />
            }
            renderItem={({ item }) => (
              <Pressable style={styles.row} onPress={() => choose(item.value)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{item.value}</Text>
                  {item.subtitle ? <Text style={styles.rowSubtitle}>{item.subtitle}</Text> : null}
                </View>
              </Pressable>
            )}
          />
        )}
      </View>
    </Modal>
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
  customRow: { borderColor: colors.primaryBorder, backgroundColor: colors.primaryTint },
  customText: { ...type.body, color: colors.primary, fontWeight: "700" },
  rowTitle: { ...type.body, color: colors.text, fontWeight: "600" },
  rowSubtitle: { ...type.caption, color: colors.textMuted, marginTop: 2 },
});
