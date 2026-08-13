import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { ModuleConfig } from "../../modules/types";
import { AppTextInput, EmptyView, ErrorView, LoadingView } from "../../components/Common";
import { colors, spacing } from "../../theme/theme";
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
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => navigation.navigate(`${config.key}Detail`, { id: item.id })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>
                  {item[config.titleField]} {item.last_name ? item.last_name : ""}
                </Text>
                {config.subtitleField && item[config.subtitleField] ? (
                  <Text style={styles.subtitle}>{item[config.subtitleField]}</Text>
                ) : null}
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchRow: { flexDirection: "row", padding: spacing(4), gap: spacing(2) },
  searchInput: { flex: 1 },
  addButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: spacing(4),
    justifyContent: "center",
  },
  addButtonText: { color: "#fff", fontWeight: "700" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing(4),
    marginBottom: spacing(2.5),
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { fontSize: 16, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  chevron: { fontSize: 22, color: colors.textMuted },
});
