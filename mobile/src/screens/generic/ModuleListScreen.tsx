import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { ModuleConfig } from "../../modules/types";
import { AppTextInput, EmptyView, ErrorView, LoadingView, Tile } from "../../components/Common";
import { colors, elevation, radius, spacing, type } from "../../theme/theme";
import { hasAccess } from "../../auth/types";
import { useAuth } from "../../auth/AuthContext";

export default function ModuleListScreen({ config, navigation }: { config: ModuleConfig; navigation: any }) {
  const { user } = useAuth();
  const [items, setItems] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
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

  const filtered = (items || []).filter((item) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return config.searchFields.some((f) => String(item[f] ?? "").toLowerCase().includes(q));
  });

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

      {items === null && !error ? (
        <LoadingView />
      ) : error ? (
        <ErrorView message={error} onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyView message={`No ${config.title.toLowerCase()} found.`} />
      ) : (
        <FlatList
          data={filtered}
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
