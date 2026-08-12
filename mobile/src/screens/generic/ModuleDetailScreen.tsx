import React, { useCallback, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { ModuleConfig } from "../../modules/types";
import { Card, ErrorView, LoadingView, PrimaryButton, SecondaryButton } from "../../components/Common";
import { colors, spacing } from "../../theme/theme";
import { hasAccess } from "../../auth/types";
import { useAuth } from "../../auth/AuthContext";

export default function ModuleDetailScreen({ config, route, navigation }: { config: ModuleConfig; route: any; navigation: any }) {
  const { user } = useAuth();
  const { id } = route.params;
  const [item, setItem] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canManage = hasAccess(user?.permissions, config.feature, "manage");

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.get<any>(`${config.endpoint}/${id}`);
      setItem(data);
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load record.");
    }
  }, [config.endpoint, id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function handleDelete() {
    Alert.alert(`Delete ${config.title.slice(0, -1) || config.title}?`, "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`${config.endpoint}/${id}`);
            navigation.goBack();
          } catch (e) {
            Alert.alert("Error", e instanceof ApiError ? String(e.message) : "Could not delete.");
          }
        },
      },
    ]);
  }

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!item) return <LoadingView />;

  const fields = config.formFields.filter((f) => item[f.key] !== undefined && item[f.key] !== null && item[f.key] !== "");

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card>
        {fields.map((f) => (
          <View key={f.key} style={styles.fieldRow}>
            <Text style={styles.label}>{f.label}</Text>
            <Text style={styles.value}>{String(item[f.key])}</Text>
          </View>
        ))}
      </Card>

      {canManage && (
        <View style={styles.actions}>
          {config.allowEdit && (
            <PrimaryButton
              title="Edit"
              onPress={() => navigation.navigate(`${config.key}Form`, { id })}
              style={{ flex: 1, marginRight: spacing(2) }}
            />
          )}
          {config.allowDelete && (
            <SecondaryButton title="Delete" onPress={handleDelete} style={{ flex: 1, borderColor: colors.danger }} />
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(4) },
  fieldRow: { marginBottom: spacing(3.5) },
  label: { fontSize: 12, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase" },
  value: { fontSize: 16, color: colors.text, marginTop: 2 },
  actions: { flexDirection: "row", marginTop: spacing(5) },
});
