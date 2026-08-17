import React, { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text } from "react-native";
import { api, ApiError } from "../../api/client";
import { ModuleConfig, FormFieldConfig } from "../../modules/types";
import { AppTextInput, Field, LoadingView, PrimaryButton } from "../../components/Common";
import PhotoField from "../../components/PhotoField";
import RecordPicker, { PickerButton } from "../../components/RecordPicker";
import { DatePicker, OptionPicker, TimePicker } from "../../components/Pickers";
import ValuePicker, { useLookupChoices, useMasterChoices } from "../../components/ValuePicker";
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

/**
 * A text column whose values come from another module's records — e.g.
 * `class_name` offered from the Classes list. Stores the value, not an id,
 * because that is what these denormalised columns hold.
 */
function LookupField({
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
  const cfg = field.lookup!;
  const { choices, error } = useLookupChoices(cfg.endpoint, cfg.valueField, cfg.subtitleFields, open);
  return (
    <>
      <PickerButton label={field.label} value={value || null} onPress={() => setOpen(true)} />
      <ValuePicker
        visible={open}
        onClose={() => setOpen(false)}
        title={`Choose ${field.label.toLowerCase()}`}
        choices={choices}
        error={error}
        onPick={onChange}
      />
    </>
  );
}

/** A value from a Master Data category, managed under Master Data on the web. */
function MasterSelectField({
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
  const { choices, error } = useMasterChoices(field.masterCategory!, open);
  return (
    <>
      <PickerButton label={field.label} value={value || null} onPress={() => setOpen(true)} />
      <ValuePicker
        visible={open}
        onClose={() => setOpen(false)}
        title={`Choose ${field.label.toLowerCase()}`}
        choices={choices}
        error={error}
        onPick={onChange}
      />
    </>
  );
}

/**
 * Renders one field according to its declared type. Every branch here is
 * deliberate: anything that falls through to the text input is a field the
 * config really does mean to be free text.
 */
function FieldInput({
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
  if (field.type === "photo") {
    return <PhotoField value={value} onChange={onChange} />;
  }

  if (field.type === "reference" && field.reference) {
    return (
      <ReferenceField field={field} value={value} onChange={onChange} open={open} setOpen={setOpen} />
    );
  }

  if (field.type === "lookup" && field.lookup) {
    return <LookupField field={field} value={value} onChange={onChange} open={open} setOpen={setOpen} />;
  }

  if (field.type === "masterSelect" && field.masterCategory) {
    return (
      <MasterSelectField field={field} value={value} onChange={onChange} open={open} setOpen={setOpen} />
    );
  }

  if (field.type === "select" && field.options) {
    return (
      <OptionPicker
        options={field.options}
        value={value}
        onChange={onChange}
        label={field.label}
        placeholder={field.placeholder || "Select..."}
        disabled={field.disabled}
        required={field.required}
      />
    );
  }

  if (field.type === "date") {
    return (
      <DatePicker
        value={value}
        onChange={onChange}
        label={field.label}
        disabled={field.disabled}
        required={field.required}
      />
    );
  }

  if (field.type === "time") {
    return (
      <TimePicker
        value={value}
        onChange={onChange}
        label={field.label}
        disabled={field.disabled}
        required={field.required}
      />
    );
  }

  return (
    <AppTextInput
      value={value}
      onChangeText={onChange}
      placeholder={field.placeholder}
      editable={!field.disabled}
      keyboardType={
        field.type === "number"
          ? "numeric"
          : field.type === "phone"
          ? "phone-pad"
          : field.type === "email"
          ? "email-address"
          : "default"
      }
      autoCapitalize={field.type === "email" || field.type === "password" ? "none" : "sentences"}
      autoCorrect={field.type !== "password"}
      secureTextEntry={field.type === "password"}
      multiline={field.type === "textarea"}
      numberOfLines={field.type === "textarea" ? 3 : 1}
      style={[
        field.type === "textarea" ? styles.textarea : undefined,
        field.disabled ? styles.inputDisabled : undefined,
      ]}
    />
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
          const raw = data[f.key];
          if (raw === undefined || raw === null) return;
          // Dates come back as either "YYYY-MM-DD" or a full timestamp; the
          // picker works in plain dates, so trim before it round-trips to save.
          initial[f.key] = f.type === "date" ? String(raw).slice(0, 10) : String(raw);
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
        <Field key={f.key} label={f.label} required={f.required}>
          <FieldInput
            field={f}
            value={values[f.key] || ""}
            onChange={(v) => setField(f.key, v)}
            open={pickerFor === f.key}
            setOpen={(open) => setPickerFor(open ? f.key : null)}
          />
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
  inputDisabled: { backgroundColor: colors.surfaceAlt, color: colors.textMuted },
});
