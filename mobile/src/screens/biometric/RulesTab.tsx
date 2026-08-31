import React, { useCallback, useState } from "react";
import { Alert, ScrollView, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { AppTextInput, Card, ErrorView, Field, LoadingView, PrimaryButton, Row, SectionLabel } from "../../components/Common";
import { DatePicker, TimePicker } from "../../components/Pickers";
import { colors, spacing, type } from "../../theme/theme";
import { todayISO } from "../../utils/dates";

interface Config {
  derive_attendance: boolean;
  late_after?: string;
  half_day_before?: string;
  absent_if_no_punch: boolean;
  overwrite_manual: boolean;
}


export default function RulesTab() {
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deriveDate, setDeriveDate] = useState(todayISO());
  const [academicYear, setAcademicYear] = useState("");
  const [deriving, setDeriving] = useState(false);
  const [deriveResult, setDeriveResult] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setConfig(await api.get<Config>("/biometric/config"));
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load rules.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function save() {
    if (!config) return;
    setSaving(true);
    try {
      const updated = await api.put<Config>("/biometric/config", config);
      setConfig(updated);
      Alert.alert("Saved", "Biometric rules updated.");
    } catch (e) {
      Alert.alert("Error", e instanceof ApiError ? String(e.message) : "Could not save rules.");
    } finally {
      setSaving(false);
    }
  }

  async function runDerive() {
    setDeriving(true);
    setDeriveResult(null);
    try {
      const result = await api.post<Record<string, unknown>>("/biometric/derive", {
        target_date: deriveDate,
        academic_year: academicYear.trim() || undefined,
      });
      setDeriveResult(result);
    } catch (e) {
      Alert.alert("Error", e instanceof ApiError && typeof e.detail === "string" ? e.detail : "Could not derive attendance.");
    } finally {
      setDeriving(false);
    }
  }

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!config) return <LoadingView />;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card>
        <SectionLabel>Derivation rules</SectionLabel>
        <ToggleRow label="Derive attendance from punches" value={config.derive_attendance} onChange={(v) => setConfig((c) => c && { ...c, derive_attendance: v })} />
        <Field label="Late after">
          <TimePicker label="Late after" value={config.late_after || ""} onChange={(v) => setConfig((c) => c && { ...c, late_after: v })} />
        </Field>
        <Field label="Half day before">
          <TimePicker label="Half day before" value={config.half_day_before || ""} onChange={(v) => setConfig((c) => c && { ...c, half_day_before: v })} />
        </Field>
        <ToggleRow label="Mark absent if no punch" value={config.absent_if_no_punch} onChange={(v) => setConfig((c) => c && { ...c, absent_if_no_punch: v })} />
        <ToggleRow label="Overwrite manually-marked attendance" value={config.overwrite_manual} onChange={(v) => setConfig((c) => c && { ...c, overwrite_manual: v })} />
        <PrimaryButton title="Save rules" onPress={save} loading={saving} style={{ marginTop: spacing(2) }} />
      </Card>

      <Card style={{ marginTop: spacing(4) }}>
        <SectionLabel>Derive attendance now</SectionLabel>
        <Field label="Date">
          <DatePicker label="Date" value={deriveDate} onChange={setDeriveDate} required />
        </Field>
        <Field label="Academic year">
          <AppTextInput value={academicYear} onChangeText={setAcademicYear} placeholder="Optional" />
        </Field>
        <PrimaryButton title="Run" onPress={runDerive} loading={deriving} style={{ marginTop: spacing(2) }} />

        {deriveResult ? (
          <View style={{ marginTop: spacing(3) }}>
            {Object.entries(deriveResult).map(([key, value]) => (
              <Text key={key} style={styles.resultLine}>
                {key}: {String(value)}
              </Text>
            ))}
          </View>
        ) : null}
      </Card>
    </ScrollView>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row style={{ justifyContent: "space-between", marginBottom: spacing(3.5) }}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Row style={{ gap: spacing(2) }}>
        <Text onPress={() => onChange(true)} style={[styles.chip, value && styles.chipActive]}>
          On
        </Text>
        <Text onPress={() => onChange(false)} style={[styles.chip, !value && styles.chipActive]}>
          Off
        </Text>
      </Row>
    </Row>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing(4) },
  toggleLabel: { ...type.body, color: colors.text, flex: 1, marginRight: spacing(2) },
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
  resultLine: { ...type.body, color: colors.text, marginBottom: spacing(1) },
});
