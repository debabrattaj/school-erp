import React, { useCallback, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { AppTextInput, ErrorView, Field, LoadingView, PrimaryButton, SecondaryButton } from "../../components/Common";
import { colors, spacing } from "../../theme/theme";
import { hasAccess } from "../../auth/types";
import { useAuth } from "../../auth/AuthContext";

const FIELDS: { key: string; label: string; multiline?: boolean; numeric?: boolean }[] = [
  { key: "school_name", label: "School Name" },
  { key: "tagline", label: "Tagline" },
  { key: "institution_type", label: "Institution Type" },
  { key: "board_affiliation", label: "Board Affiliation" },
  { key: "school_code", label: "School Code" },
  { key: "website", label: "Website" },
  { key: "campus_name", label: "Campus Name" },
  { key: "campus_city", label: "Campus City" },
  { key: "campus_state", label: "Campus State" },
  { key: "campus_country", label: "Campus Country" },
  { key: "address", label: "Address", multiline: true },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "principal_name", label: "Principal Name" },
  { key: "academic_year", label: "Academic Year" },
  { key: "default_sections", label: "Default Sections (comma-separated)" },
  { key: "houses", label: "Houses (comma-separated)" },
  { key: "working_days", label: "Working Days" },
  { key: "currency", label: "Currency" },
  { key: "receipt_prefix", label: "Receipt Prefix" },
  { key: "upi_id", label: "UPI ID" },
  { key: "late_fee_rule", label: "Late Fee Rule" },
  { key: "pass_percentage", label: "Pass Percentage", numeric: true },
  { key: "grade_rules", label: "Grade Rules", multiline: true },
];

export default function SettingsScreen({ navigation }: { navigation: any }) {
  const { user } = useAuth();
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canManage = hasAccess(user?.permissions, "settings", "manage");

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.get<Record<string, unknown>>("/settings/");
      const next: Record<string, string> = {};
      FIELDS.forEach((f) => {
        if (data[f.key] !== undefined && data[f.key] !== null) next[f.key] = String(data[f.key]);
      });
      setValues(next);
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load settings.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function save() {
    if (!values) return;
    setSaving(true);
    const payload: Record<string, unknown> = {};
    FIELDS.forEach((f) => {
      const raw = values[f.key];
      if (raw === undefined || raw === "") return;
      payload[f.key] = f.numeric ? Number(raw) : raw;
    });
    try {
      await api.put("/settings/", payload);
      Alert.alert("Saved", "School settings updated.");
    } catch (e) {
      Alert.alert("Error", e instanceof ApiError ? String(e.message) : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!values) return <LoadingView />;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {FIELDS.map((f) => (
        <Field key={f.key} label={f.label}>
          <AppTextInput
            value={values[f.key] || ""}
            onChangeText={(v) => setValues((prev) => ({ ...(prev || {}), [f.key]: v }))}
            editable={canManage}
            keyboardType={f.numeric ? "numeric" : "default"}
            multiline={f.multiline}
            style={f.multiline ? styles.textarea : undefined}
          />
        </Field>
      ))}
      {canManage && <PrimaryButton title="Save settings" onPress={save} loading={saving} />}
      {!canManage && <Text style={styles.readonly}>You have read-only access to settings.</Text>}

      <SecondaryButton
        title="Manage Biometric Devices"
        onPress={() => navigation.navigate("BiometricHome")}
        style={{ marginTop: spacing(4) }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(4), paddingBottom: spacing(10) },
  textarea: { minHeight: 80, textAlignVertical: "top" },
  readonly: { color: colors.textMuted, textAlign: "center", marginTop: spacing(2) },
});
