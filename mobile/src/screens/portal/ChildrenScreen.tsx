import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { EmptyView, ErrorView, LoadingView } from "../../components/Common";
import { colors, spacing } from "../../theme/theme";
import { StudentCard, studentDisplayName } from "../../modules/portalTypes";

export default function ChildrenScreen({ navigation }: { navigation: any }) {
  const [children, setChildren] = useState<StudentCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.get<StudentCard[]>("/portal/children");
      setChildren(data);
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load children.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!children) return <LoadingView />;
  if (!children.length) return <EmptyView message="No students linked to this account yet." />;

  return (
    <FlatList
      data={children}
      keyExtractor={(c) => String(c.id)}
      contentContainerStyle={{ padding: spacing(4) }}
      renderItem={({ item }) => (
        <Pressable
          style={styles.row}
          onPress={() => navigation.navigate("ChildDetail", { id: item.id, name: studentDisplayName(item) })}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{studentDisplayName(item)}</Text>
            <Text style={styles.subtitle}>
              {item.class_name ? `Class ${item.class_name}` : ""}
              {item.section ? ` - ${item.section}` : ""}
              {item.roll_no ? ` • Roll #${item.roll_no}` : ""}
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
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
  name: { fontSize: 17, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  chevron: { fontSize: 22, color: colors.textMuted },
});
