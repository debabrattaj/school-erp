import React, { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { ModuleConfig } from "../../modules/types";
import { AppTextInput, EmptyView, ErrorView, LoadingView, Tile } from "../../components/Common";
import { colors, elevation, radius, spacing, type } from "../../theme/theme";
import { hasAccess } from "../../auth/types";
import { useAuth } from "../../auth/AuthContext";

/** Values may be numbers, dates or text; compare accordingly so 10 > 9. */
function compareValues(a: unknown, b: unknown) {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // blanks sort last regardless of direction
  if (b == null) return -1;

  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && String(a).trim() !== "" && String(b).trim() !== "") {
    return na - nb;
  }
  return String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
}

export default function ModuleListScreen({ config, navigation }: { config: ModuleConfig; navigation: any }) {
  const { user } = useAuth();
  const [items, setItems] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDesc, setSortDesc] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const canManage = hasAccess(user?.permissions, config.feature, "manage");

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.get<any[]>(config.endpoint + "/");
      setItems(data);
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load data.");
    }
  }, [config.endpoint]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Columns the user can sort by: whatever the module lists, plus its title.
  const sortableColumns = useMemo(() => {
    const cols = [{ key: config.titleField, label: config.title.replace(/s$/, "") }, ...config.listColumns];
    const seen = new Set<string>();
    return cols.filter((c) => (seen.has(c.key) ? false : (seen.add(c.key), true)));
  }, [config]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = (items || []).filter((item) =>
      q ? config.searchFields.some((f) => String(item[f] ?? "").toLowerCase().includes(q)) : true
    );

    if (!sortKey) return rows;
    // Copy first: sort mutates, and `items` is state.
    return rows.slice().sort((a, b) => {
      const result = compareValues(a[sortKey], b[sortKey]);
      return sortDesc ? -result : result;
    });
  }, [items, search, config.searchFields, sortKey, sortDesc]);

  function toggleSort(key: string) {
    if (sortKey === key) {
      // Third tap clears the sort and returns to server order.
      if (sortDesc) {
        setSortKey(null);
        setSortDesc(false);
      } else {
        setSortDesc(true);
      }
    } else {
      setSortKey(key);
      setSortDesc(false);
    }
  }

  const activeSortLabel = sortKey
    ? sortableColumns.find((c) => c.key === sortKey)?.label ?? sortKey
    : null;

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <AppTextInput
          value={search}
          onChangeText={setSearch}
          placeholder={`Search ${config.title.toLowerCase()}...`}
          style={styles.searchInput}
        />
        {config.allowCreate && canManage && (
          <Pressable style={styles.addButton} onPress={() => navigation.navigate(`${config.key}Form`, {})}>
            <Text style={styles.addButtonText}>+ Add</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.sortRow}>
        <Pressable onPress={() => setShowSort((v) => !v)} style={styles.sortToggle}>
          <Text style={styles.sortToggleText}>
            {activeSortLabel ? `Sorted by ${activeSortLabel} ${sortDesc ? "↓" : "↑"}` : "Sort"}
          </Text>
        </Pressable>
        {items ? <Text style={styles.count}>{visible.length} records</Text> : null}
      </View>

      {showSort && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortChips}>
          {sortableColumns.map((col) => {
            const active = sortKey === col.key;
            return (
              <Pressable
                key={col.key}
                onPress={() => toggleSort(col.key)}
                style={[styles.sortChip, active && styles.sortChipActive]}
              >
                <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>
                  {col.label}
                  {active ? (sortDesc ? " ↓" : " ↑") : ""}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {items === null && !error ? (
        <LoadingView />
      ) : error ? (
        <ErrorView message={error} onRetry={load} />
      ) : visible.length === 0 ? (
        <EmptyView message={`No ${config.title.toLowerCase()} found.`} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: spacing(4) }}
          renderItem={({ item }) => {
            const title = `${item[config.titleField] ?? ""} ${item.last_name ?? ""}`.trim();
            const initials =
              title
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((w: string) => w[0]?.toUpperCase())
                .join("") || config.icon;
            return (
              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => navigation.navigate(`${config.key}Detail`, { id: item.id })}
              >
                <Tile label={initials} size={38} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.title} numberOfLines={1}>
                    {title || "Untitled"}
                  </Text>
                  {config.subtitleField && item[config.subtitleField] ? (
                    <Text style={styles.subtitle} numberOfLines={1}>
                      {item[config.subtitleField]}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchRow: {
    flexDirection: "row",
    paddingHorizontal: spacing(4),
    paddingTop: spacing(3),
    paddingBottom: spacing(2),
    gap: spacing(2),
  },
  searchInput: { flex: 1 },
  addButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing(4),
    justifyContent: "center",
    ...elevation.sm,
  },
  addButtonText: { color: colors.onPrimary, fontWeight: "700", fontSize: 14 },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing(4),
    paddingBottom: spacing(2),
  },
  sortToggle: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(1.5),
    backgroundColor: colors.surface,
  },
  sortToggleText: { ...type.caption, color: colors.primary, fontWeight: "700" },
  count: { ...type.caption, color: colors.textMuted },
  sortChips: { paddingHorizontal: spacing(4), paddingBottom: spacing(2), gap: spacing(2) },
  sortChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(1.5),
    backgroundColor: colors.surface,
  },
  sortChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  sortChipText: { ...type.caption, color: colors.text },
  sortChipTextActive: { color: colors.onPrimary, fontWeight: "700" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(3.5),
    marginBottom: spacing(2),
    borderWidth: 1,
    borderColor: colors.border,
    ...elevation.sm,
  },
  rowPressed: { backgroundColor: colors.surfaceAlt, transform: [{ scale: 0.995 }] },
  title: { ...type.heading, color: colors.text },
  subtitle: { ...type.caption, color: colors.textMuted, marginTop: 2, fontWeight: "500" },
  chevron: { fontSize: 22, color: colors.textFaint },
});
