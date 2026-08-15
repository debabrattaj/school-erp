import React, { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, ApiError } from "../../api/client";
import { ModuleConfig, FormFieldConfig } from "../../modules/types";
import { AppTextInput, Field, LoadingView, PrimaryButton } from "../../components/Common";
import PhotoField from "../../components/PhotoField";
import RecordPicker, { PickerButton } from "../../components/RecordPicker";
import { colors, spacing } from "../../theme/theme";

/**
 * A foreign key entered by picking the actual record, rather than typing the
 * numeric ID the API wants. Shows the chosen record's label once picked; on an
 * existing record the stored ID is shown until the user picks a new one.
 */
function ReferenceField({
  field,
  value,
  onChange,
  open,
  setOpen,
}: {
  field: FormFieldConfig;
  value: string;
  onChange: (v: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const ref = field.reference!;
  const [label, setLabel] = useState<string | null>(null);
  const compose = (item: any, keys: string[]) =>
    keys.map((k) => item[k]).filter(Boolean).join(" ").trim();

  return (
    <>
      <PickerButton
        label={field.label}
        value={label || (value ? `#${value}` : null)}
        onPress={() => setOpen(true)}
      />
      <RecordPicker<any>
        visible={open}
        onClose={() => setOpen(false)}
        title={`Choose ${field.label.toLowerCase()}`}
        endpoint={ref.endpoint}
        labelFor={(it) => compose(it, ref.labelFields) || `#${it.id}`}
        subtitleFor={ref.subtitleFields ? (it) => compose(it, ref.subtitleFields!) : undefined}
        searchFields={ref.searchFields}
        onPick={(it) => {
          onChange(String(it.id));
          setLabel(compose(it, ref.labelFields) || `#${it.id}`);
        }}
      />
    </>
  );
}

function SelectField({ field, value, onChange }: { field: FormFieldConfig; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.selectRow}>
      {(field.options || []).map((opt) => {
        const active = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function ModuleFormScreen({ config, route, navigation }: { config: ModuleConfig; route: any; navigation: any }) {
  const id = route.params?.id as number | undefined;
  const isEdit = id !== undefined;
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only one picker modal is open at a time; this holds which field owns it.
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const data = await api.get<any>(`${config.endpoint}/${id}`);
        const initial: Record<string, string> = {};
        config.formFields.forEach((f) => {
          if (data[f.key] !== undefined && data[f.key] !== null) initial[f.key] = String(data[f.key]);
        });
        setValues(initial);
      } catch (e) {
        setError(e instanceof ApiError ? String(e.message) : "Failed to load record.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  function setField(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSave() {
    const missing = config.formFields.filter((f) => f.required && !values[f.key]?.trim());
    if (missing.length) {
      Alert.alert("Missing fields", `Please fill: ${missing.map((f) => f.label).join(", ")}`);
      return;
    }
    setSaving(true);
    setError(null);
    const payload: Record<string, unknown> = {};
    config.formFields.forEach((f) => {
      const raw = values[f.key];
      if (raw === undefined || raw === "") return;
      // A reference holds a foreign key, so it goes out as a number like any
      // other numeric field — not as the string the text input produced.
      payload[f.key] = f.type === "number" || f.type === "reference" ? Number(raw) : raw;
    });
    try {
      if (isEdit) {
        await api.put(`${config.endpoint}/${id}`, payload);
      } else {
        await api.post(`${config.endpoint}/`, payload);
      }
      navigation.goBack();
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingView />;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {config.formFields.map((f) => (
        <Field key={f.key} label={f.required ? `${f.label} *` : f.label}>
          {f.type === "select" && f.options ? (
            <SelectField field={f} value={values[f.key] || ""} onChange={(v) => setField(f.key, v)} />
          ) : f.type === "photo" ? (
            <PhotoField value={values[f.key]} onChange={(url) => setField(f.key, url)} />
          ) : f.type === "reference" && f.reference ? (
            <ReferenceField
              field={f}
              value={values[f.key] || ""}
              onChange={(v) => setField(f.key, v)}
              open={pickerFor === f.key}
              setOpen={(open) => setPickerFor(open ? f.key : null)}
            />
          ) : (
            <AppTextInput
              value={values[f.key] || ""}
              onChangeText={(v) => setField(f.key, v)}
              placeholder={f.placeholder}
              keyboardType={f.type === "number" ? "numeric" : f.type === "phone" ? "phone-pad" : f.type === "email" ? "email-address" : "default"}
              autoCapitalize={f.type === "email" ? "none" : "sentences"}
              multiline={f.type === "textarea"}
              numberOfLines={f.type === "textarea" ? 3 : 1}
              style={f.type === "textarea" ? styles.textarea : undefined}
            />
          )}
        </Field>
      ))}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <PrimaryButton title={isEdit ? "Save changes" : "Create"} onPress={handleSave} loading={saving} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(4), paddingBottom: spacing(10) },
  textarea: { minHeight: 80, textAlignVertical: "top" },
  error: { color: colors.danger, marginBottom: spacing(3), textAlign: "center" },
  selectRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing(2) },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(2),
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
});
