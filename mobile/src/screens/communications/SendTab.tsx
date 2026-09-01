import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, View, StyleSheet } from "react-native";
import { showAlert } from "../../utils/alert";
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
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [pickClass, setPickClass] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);

  // A ref (not state) so a fetch that resolves after either an unmount or a
  // newer retry doesn't overwrite what's on screen with stale data.
  const templatesLoadRef = useRef(0);
  const loadTemplates = useCallback(() => {
    const loadId = ++templatesLoadRef.current;
    setTemplatesError(null);
    api
      .get<Template[]>("/communications/templates/")
      .then((rows) => {
        if (templatesLoadRef.current === loadId) setTemplates(rows.filter((t) => t.status !== "Inactive"));
      })
      .catch((e) => {
        // Templates are optional here, but swallowing the failure silently made
        // a permissions or connectivity problem look like "no templates yet".
        if (templatesLoadRef.current === loadId) {
          setTemplatesError(e instanceof ApiError ? String(e.message) : "Could not load templates.");
        }
      });
  }, []);

  useEffect(() => {
    loadTemplates();
    return () => {
      templatesLoadRef.current++;
    };
  }, [loadTemplates]);

  const templateOptions = useMemo(
    () => templates.map((t) => ({ label: t.template_name, value: String(t.id), subtitle: t.category })),
    [templates]
  );

  function applyTemplate(id: string) {
    const template = templates.find((t) => String(t.id) === id);
    setForm((f) => ({
      ...f,
      templateId: id,
      channel: template?.channel || f.channel,
      category: template?.category || f.category,
      messageBody: template?.body || f.messageBody,
    }));
  }

  function confirmSend() {
    if (!form.className.trim()) {
      showAlert("Missing details", "A class is required.");
      return;
    }
    if (!form.category.trim() || !form.messageBody.trim()) {
      showAlert("Missing details", "Category and message are required.");
      return;
    }
    // This fans a real WhatsApp/SMS/email out to every guardian in the class and
    // cannot be undone, so it no longer happens on a single tap.
    const audience = form.section.trim()
      ? `class ${form.className.trim()} section ${form.section.trim()}`
      : `every section of class ${form.className.trim()}`;
    showAlert(
      "Send this message?",
      `It will go out by ${form.channel} to the guardians of ${audience}. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Send", onPress: submit },
      ]
    );
  }

  async function submit() {
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
      showAlert(
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
        {templatesError ? (
          <Text style={styles.templatesError} onPress={loadTemplates}>
            {templatesError} Tap to retry.
          </Text>
        ) : templateOptions.length > 0 ? (
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

        <PrimaryButton title="Send to class" onPress={confirmSend} loading={sending} style={{ marginTop: spacing(2) }} />
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
  templatesError: { ...type.caption, color: colors.danger, marginTop: spacing(1.5), marginBottom: spacing(2) },
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
  templatesError: { ...type.caption, color: colors.danger, marginBottom: spacing(2) },
});
