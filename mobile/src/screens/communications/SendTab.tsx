import React, { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, Text, View, StyleSheet } from "react-native";
import { api, ApiError } from "../../api/client";
import { AppTextInput, Card, Field, PrimaryButton, Row, SectionLabel } from "../../components/Common";
import { OptionPicker } from "../../components/Pickers";
import RecordPicker, { PickerButton } from "../../components/RecordPicker";
import { colors, spacing, type } from "../../theme/theme";

const CHANNELS = ["WhatsApp", "SMS", "Email", "In App"];

interface Template {
  id: number;
  template_name: string;
  channel?: string;
  category: string;
  body: string;
  status?: string;
}

interface ClassRecord {
  id: number;
  class_name: string;
  section?: string;
}

interface BulkResult {
  matched_count: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
}

const emptyForm = {
  className: "",
  section: "",
  templateId: "",
  channel: "WhatsApp",
  category: "",
  messageBody: "",
};

export default function SendTab() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [pickClass, setPickClass] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);

  useEffect(() => {
    api
      .get<Template[]>("/communications/templates/")
      .then((rows) => setTemplates(rows.filter((t) => t.status !== "Inactive")))
      .catch(() => {});
  }, []);

  const templateOptions = useMemo(
    () => templates.map((t) => ({ label: t.template_name, value: String(t.id), subtitle: t.category })),
    [templates]
  );

  function applyTemplate(id: string) {
    setForm((f) => ({ ...f, templateId: id }));
    const template = templates.find((t) => String(t.id) === id);
    if (template) {
      setForm((f) => ({
        ...f,
        templateId: id,
        channel: template.channel || f.channel,
        category: template.category || f.category,
        messageBody: template.body || f.messageBody,
      }));
    }
  }

  async function submit() {
    if (!form.className.trim()) {
      Alert.alert("Missing details", "A class is required.");
      return;
    }
    if (!form.category.trim() || !form.messageBody.trim()) {
      Alert.alert("Missing details", "Category and message are required.");
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const res = await api.post<BulkResult>("/communications/logs/bulk-class", {
        class_name: form.className.trim(),
        section: form.section.trim() || undefined,
        template_id: form.templateId ? Number(form.templateId) : undefined,
        channel: form.channel,
        category: form.category.trim(),
        message_body: form.messageBody.trim(),
      });
      setResult(res);
    } catch (e) {
      Alert.alert(
        "Could not send",
        e instanceof ApiError && typeof e.detail === "string" ? e.detail : "The server refused the request."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card>
        <SectionLabel>Recipients</SectionLabel>
        <PickerButton
          label="Browse a class"
          value={form.className ? `${form.className}${form.section ? ` · ${form.section}` : ""}` : null}
          onPress={() => setPickClass(true)}
        />
        <Row style={{ gap: spacing(3), marginTop: spacing(3) }}>
          <View style={{ flex: 1 }}>
            <Field label="Class" required>
              <AppTextInput value={form.className} onChangeText={(v) => setForm((f) => ({ ...f, className: v }))} placeholder="e.g. 5" />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Section">
              <AppTextInput value={form.section} onChangeText={(v) => setForm((f) => ({ ...f, section: v }))} placeholder="All sections" />
            </Field>
          </View>
        </Row>
        <Text style={styles.hint}>Leave section blank to message every section of this class.</Text>

        <SectionLabel>Message</SectionLabel>
        {templateOptions.length > 0 ? (
          <Field label="Start from a template">
            <OptionPicker label="Template" options={templateOptions} value={form.templateId} onChange={applyTemplate} placeholder="None" />
          </Field>
        ) : null}
        <Field label="Channel">
          <Row style={{ gap: spacing(2), flexWrap: "wrap" }}>
            {CHANNELS.map((c) => (
              <Text key={c} onPress={() => setForm((f) => ({ ...f, channel: c }))} style={[styles.chip, form.channel === c && styles.chipActive]}>
                {c}
              </Text>
            ))}
          </Row>
        </Field>
        <Field label="Category" required>
          <AppTextInput value={form.category} onChangeText={(v) => setForm((f) => ({ ...f, category: v }))} placeholder="e.g. Announcement" />
        </Field>
        <Field label="Message" required>
          <AppTextInput
            value={form.messageBody}
            onChangeText={(v) => setForm((f) => ({ ...f, messageBody: v }))}
            placeholder="Message body"
            multiline
            style={{ minHeight: 100, textAlignVertical: "top" }}
          />
        </Field>

        <PrimaryButton title="Send to class" onPress={submit} loading={sending} style={{ marginTop: spacing(2) }} />
      </Card>

      {result ? (
        <Card style={{ marginTop: spacing(3) }}>
          <SectionLabel>Result</SectionLabel>
          <Text style={styles.resultLine}>{result.matched_count} guardians matched</Text>
          <Text style={[styles.resultLine, { color: colors.success }]}>{result.sent_count} sent</Text>
          {result.failed_count > 0 ? <Text style={[styles.resultLine, { color: colors.danger }]}>{result.failed_count} failed</Text> : null}
          {result.skipped_count > 0 ? (
            <Text style={[styles.resultLine, { color: colors.warning }]}>{result.skipped_count} skipped (no contact info)</Text>
          ) : null}
        </Card>
      ) : null}

      <RecordPicker<ClassRecord>
        visible={pickClass}
        onClose={() => setPickClass(false)}
        title="Choose class"
        endpoint="/classes"
        labelFor={(c) => c.class_name}
        subtitleFor={(c) => c.section || ""}
        searchFields={["class_name", "section"]}
        onPick={(c) => setForm((f) => ({ ...f, className: c.class_name, section: c.section || "" }))}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing(4) },
  hint: { ...type.caption, color: colors.textMuted, marginTop: spacing(1.5) },
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
