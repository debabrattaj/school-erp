import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as DocumentPicker from "expo-document-picker";
import { api, ApiError } from "../../api/client";
import { downloadAndShare, uploadDocument } from "../../api/files";
import {
  AppTextInput,
  Badge,
  Card,
  EmptyView,
  ErrorView,
  Field,
  LoadingView,
  PrimaryButton,
  SecondaryButton,
} from "../../components/Common";
import { DatePicker, Option, OptionPicker } from "../../components/Pickers";
import { useAuth } from "../../auth/AuthContext";
import { showAlert } from "../../utils/alert";
import { todayISO } from "../../utils/dates";
import { colors, radius, spacing, type } from "../../theme/theme";

type Tab = "Results" | "Payments" | "Settlements" | "Registers" | "Versions" | "Admissions" | "History";
type Choice = { id: string | number; label: string };
type WorkflowOptions = Record<string, Choice[]>;
type Row = Record<string, any>;

const CASE_TYPES = ["UPI", "Dispute", "Refund", "Reversal", "Adjustment", "Reassignment"];
const SNAPSHOT_TYPES = ["Timetable", "Evidence", "Transport"];
const DIRECTIONS = ["Morning", "Afternoon", "Both"];
const REVIEW_STATES = ["Received", "Reviewed", "Needs clarification"];
const HISTORY_ENTITIES = [
  "students", "attendance", "marks", "fees", "timetable_entries", "transport_assignments",
  "assignment_submissions", "admission_documents", "compliance_tasks", "payment_cases",
  "result_releases", "operational_snapshots", "attendance_registers", "student_enrollments",
];

const asOptions = (items: Choice[] = []): Option[] =>
  items.map((item) => ({ label: item.label, value: String(item.id) }));
const choices = (items: string[]): Option[] => items.map((item) => ({ label: item, value: item }));
const errorMessage = (error: unknown) => error instanceof ApiError ? String(error.message) : "Unable to complete this action.";

function tone(status?: string): "success" | "warning" | "danger" | "default" {
  if (["Approved", "Published", "Submitted", "Matched", "Reviewed"].includes(status || "")) return "success";
  if (["Rejected", "Amount mismatch"].includes(status || "")) return "danger";
  if (["Pending", "Draft", "Not submitted", "Unmatched"].includes(status || "")) return "warning";
  return "default";
}

function valueText(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function RecordCard({
  row,
  fields,
  children,
}: {
  row: Row;
  fields: [string, string][];
  children?: React.ReactNode;
}) {
  return (
    <Card style={styles.record}>
      {fields.map(([key, label]) => (
        <View key={key} style={styles.recordLine}>
          <Text style={styles.recordLabel}>{label}</Text>
          {key === "status" ? (
            <Badge text={valueText(row[key])} tone={tone(row[key])} />
          ) : (
            <Text selectable style={styles.recordValue}>{valueText(row[key])}</Text>
          )}
        </View>
      ))}
      {children ? <View style={styles.actions}>{children}</View> : null}
    </Card>
  );
}

export default function WorkflowsScreen() {
  const { user } = useAuth();
  const leader = user?.role === "Admin" || user?.role === "Principal";
  const tabs = useMemo<Tab[]>(() => [
    ...(user?.role !== "Accounts" ? ["Results", "Registers"] as Tab[] : []),
    ...(user?.role !== "Teacher" ? ["Payments", "Settlements"] as Tab[] : []),
    ...(leader ? ["Versions", "Admissions", "History"] as Tab[] : []),
  ], [user?.role, leader]);

  const [tab, setTab] = useState<Tab>(tabs[0] || "Results");
  const [options, setOptions] = useState<WorkflowOptions>({});
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, any>>({
    on_date: todayISO(), period_no: "0", notify_absences: false,
    kind: "UPI", snapshot_kind: "Timetable", direction: "Both",
    effective_from: todayISO(), review_status: "Received", entity: "marks",
  });
  const set = (key: string, value: any) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!tabs.includes(tab)) setTab(tabs[0] || "Results");
  }, [tabs, tab]);

  const loadOptions = useCallback(async () => {
    setError(null);
    try {
      setOptions(await api.get<WorkflowOptions>("/workflows/options"));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  const loadRows = useCallback(async () => {
    setError(null);
    setPreview(null);
    setRows(null);
    try {
      let result: Row[] = [];
      if (tab === "Results") result = await api.get("/workflows/results");
      if (tab === "Payments") result = await api.get("/workflows/payments/cases");
      if (tab === "Settlements") result = await api.get("/workflows/payments/settlements");
      if (tab === "Registers") result = await api.get("/workflows/attendance/registers", {
        on_date: form.on_date,
        period_no: Number(form.period_no || 0),
      });
      if (tab === "Versions") result = await api.get("/workflows/snapshots");
      setRows(result);
    } catch (e) {
      setRows([]);
      setError(errorMessage(e));
    }
  }, [tab, form.on_date, form.period_no]);

  useFocusEffect(useCallback(() => { loadOptions(); }, [loadOptions]));
  useFocusEffect(useCallback(() => { loadRows(); }, [loadRows]));

  async function run(work: () => Promise<unknown>, success = "Saved.", reload = true) {
    setBusy(true);
    try {
      await work();
      if (reload) await loadRows();
      showAlert("Done", success);
    } catch (e) {
      showAlert("Could not save", errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function requireNote() {
    if (note.trim()) return true;
    showAlert("Note required", "Enter a review or decision note first.");
    return false;
  }

  const picker = (label: string, key: string, source: string, required = true) => (
    <Field label={label} required={required}>
      <OptionPicker
        label={label}
        value={String(form[key] || "")}
        onChange={(value) => set(key, value)}
        options={asOptions(options[source])}
        required={required}
      />
    </Field>
  );

  async function prepareResult() {
    if (!requireNote() || !form.student_id || !form.exam_id) return;
    await run(() => api.post("/workflows/results", {
      student_id: Number(form.student_id), exam_id: Number(form.exam_id), note: note.trim(),
    }), "Result draft prepared.");
  }

  async function resultDecision(row: Row, action: "review" | "publish") {
    if (!requireNote()) return;
    await run(() => api.post(`/workflows/results/${row.id}/${action}`, { note: note.trim() }),
      action === "review" ? "Result reviewed." : "Result published to the family portal.");
  }

  async function createPaymentCase() {
    if (!requireNote() || !form.fee_id || !form.reference) return;
    await run(() => api.post("/workflows/payments/cases", {
      fee_id: Number(form.fee_id), kind: form.kind, reference: form.reference,
      amount: Number(form.amount || 0), notes: note.trim(),
      owner_id: form.owner_id ? Number(form.owner_id) : null,
      due_date: form.due_date || null,
      target_fee_id: form.target_fee_id ? Number(form.target_fee_id) : null,
    }), "Payment case created.");
  }

  async function paymentDecision(row: Row, action: "approve" | "reject") {
    if (!requireNote()) return;
    await run(() => api.post(`/workflows/payments/cases/${row.id}/${action}`, { note: note.trim() }),
      `Payment case ${action === "approve" ? "approved" : "rejected"}.`);
  }

  async function assignPaymentCase(row: Row) {
    if (!requireNote()) return;
    await run(() => api.put(`/workflows/payments/cases/${row.id}`, {
      owner_id: form.owner_id ? Number(form.owner_id) : null,
      due_date: form.due_date || null,
      notes: note.trim(),
    }), "Payment case assignment updated.");
  }

  async function importStatement() {
    const picked = await DocumentPicker.getDocumentAsync({ type: ["text/csv", "text/comma-separated-values"], copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    await run(
      () => uploadDocument("/workflows/payments/settlements/import", {
        uri: asset.uri, name: asset.name, mimeType: asset.mimeType,
      }),
      "Settlement statement imported."
    );
  }

  async function submitRegister(row: Row) {
    if (!requireNote()) return;
    await run(() => api.post("/workflows/attendance/registers", {
      class_id: row.class_id, attendance_date: form.on_date,
      period_no: Number(form.period_no || 0), notify_absences: !!form.notify_absences,
      note: note.trim(),
    }), "Attendance register submitted.");
  }

  async function captureSnapshot() {
    const source = { Timetable: "classes", Evidence: "evidence", Transport: "routes" }[form.snapshot_kind as string];
    if (!requireNote() || !form.scope_id || !source) return;
    await run(() => api.post("/workflows/snapshots", {
      kind: form.snapshot_kind, scope_id: Number(form.scope_id),
      effective_from: form.effective_from, effective_until: form.effective_until || null,
      direction: form.direction, note: note.trim(),
    }), "Version draft captured.");
  }

  async function approveSnapshot(row: Row) {
    if (!requireNote()) return;
    await run(() => api.post(`/workflows/snapshots/${row.id}/approve`, { note: note.trim() }), "Version approved.");
  }

  async function completeOnboarding() {
    if (!requireNote() || !form.student_id || !form.class_id || !form.guardian_id) return;
    await run(async () => {
      await api.post("/workflows/admissions/onboard", {
        student_id: Number(form.student_id), class_id: Number(form.class_id),
        guardian_user_id: Number(form.guardian_id),
        fee_structure_ids: form.structure_id ? [Number(form.structure_id)] : [], note: note.trim(),
      });
      await loadOptions();
    }, "Student onboarding completed.", false);
  }

  async function reviewDocument() {
    if (!requireNote() || !form.document_id) return;
    await run(async () => {
      await api.put(`/workflows/admissions/documents/${form.document_id}/review`, {
        status: form.review_status, note: note.trim(),
      });
      await loadOptions();
    }, "Document review saved.", false);
  }

  async function viewHistory() {
    if (!form.entity_id) return;
    setBusy(true);
    try {
      const history = await api.get<Row[]>(`/workflows/history/${form.entity}/${Number(form.entity_id)}`);
      setPreview({ history });
    } catch (e) {
      showAlert("Could not load history", errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const snapshotSource = { Timetable: "classes", Evidence: "evidence", Transport: "routes" }[form.snapshot_kind as string] || "classes";

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabWrap} contentContainerStyle={styles.tabs}>
        {tabs.map((item) => (
          <Pressable key={item} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.activeTab]}>
            <Text style={[styles.tabText, tab === item && styles.activeTabText]}>{item}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{tab}</Text>
        <Text style={styles.intro}>{INTRO[tab]}</Text>
        <Field label="Review / decision note" required>
          <AppTextInput
            value={note}
            onChangeText={setNote}
            placeholder="Record what was checked and why this action is needed."
            multiline
            maxLength={2000}
            style={styles.note}
          />
        </Field>

        {tab === "Results" && <>
          {picker("Student", "student_id", "students")}
          {picker("Exam", "exam_id", "exams")}
          <PrimaryButton title="Prepare draft" onPress={prepareResult} loading={busy} />
        </>}

        {tab === "Payments" && <>
          {picker("Fee", "fee_id", "fees")}
          <Field label="Case type" required><OptionPicker label="Case type" options={choices(CASE_TYPES)} value={form.kind} onChange={(v) => set("kind", v)} required /></Field>
          <Field label="Bank / case reference" required><AppTextInput value={form.reference || ""} onChangeText={(v) => set("reference", v)} /></Field>
          <Field label={form.kind === "Adjustment" ? "Revised total charge" : "Amount"} required><AppTextInput value={form.amount || ""} onChangeText={(v) => set("amount", v)} keyboardType="decimal-pad" /></Field>
          {picker("Owner", "owner_id", "owners", false)}
          <Field label="Next action due"><DatePicker label="Next action due" value={form.due_date || ""} onChange={(v) => set("due_date", v)} /></Field>
          {form.kind === "Reassignment" ? picker("Target fee", "target_fee_id", "fees") : null}
          <PrimaryButton title="Create case" onPress={createPaymentCase} loading={busy} />
        </>}

        {tab === "Settlements" && <>
          <Text style={styles.help}>CSV columns: reference, gross_amount, charges, net_amount, settlement_date. Use YYYY-MM-DD; matching does not change fee balances.</Text>
          <PrimaryButton title="Import settlement CSV" onPress={importStatement} loading={busy} />
        </>}

        {tab === "Registers" && <>
          <Field label="Date" required><DatePicker label="Date" value={form.on_date} onChange={(v) => set("on_date", v)} required /></Field>
          <Field label="Period (0 is daily)" required><AppTextInput value={String(form.period_no)} onChangeText={(v) => set("period_no", v.replace(/\D/g, "").slice(0, 2))} keyboardType="number-pad" /></Field>
          <View style={styles.switchLine}><Text style={styles.switchLabel}>Notify linked families of absences</Text><Switch value={!!form.notify_absences} onValueChange={(v) => set("notify_absences", v)} trackColor={{ true: colors.primaryTint }} thumbColor={form.notify_absences ? colors.primary : colors.textFaint} /></View>
        </>}

        {tab === "Versions" && <>
          <Field label="Record type" required><OptionPicker label="Record type" options={choices(SNAPSHOT_TYPES.filter((v) => v !== "Transport" || (options.routes || []).length > 0))} value={form.snapshot_kind} onChange={(v) => { set("snapshot_kind", v); set("scope_id", ""); }} required /></Field>
          {picker("Record", "scope_id", snapshotSource)}
          <Field label="Effective from" required><DatePicker label="Effective from" value={form.effective_from} onChange={(v) => set("effective_from", v)} required /></Field>
          <Field label="Effective until"><DatePicker label="Effective until" value={form.effective_until || ""} onChange={(v) => set("effective_until", v)} /></Field>
          {form.snapshot_kind === "Transport" ? <Field label="Journey"><OptionPicker label="Journey" options={choices(DIRECTIONS)} value={form.direction} onChange={(v) => set("direction", v)} required /></Field> : null}
          <PrimaryButton title="Capture draft" onPress={captureSnapshot} loading={busy} />
        </>}

        {tab === "Admissions" && <>
          <Text style={styles.subheading}>Complete onboarding</Text>
          {picker("Student", "student_id", "students")}
          {picker("Class", "class_id", "classes")}
          {picker("Guardian account", "guardian_id", "guardians")}
          {picker("Fee structure", "structure_id", "structures", false)}
          <PrimaryButton title="Complete onboarding" onPress={completeOnboarding} loading={busy} />
          <Text style={styles.subheading}>Document review</Text>
          {picker("Document", "document_id", "documents")}
          <Field label="Review state" required><OptionPicker label="Review state" options={choices(REVIEW_STATES)} value={form.review_status} onChange={(v) => set("review_status", v)} required /></Field>
          <PrimaryButton title="Save document review" onPress={reviewDocument} loading={busy} />
        </>}

        {tab === "History" && <>
          <Field label="Record type" required><OptionPicker label="Record type" options={choices(HISTORY_ENTITIES)} value={form.entity} onChange={(v) => set("entity", v)} required /></Field>
          <Field label="Record ID" required><AppTextInput value={form.entity_id || ""} onChangeText={(v) => set("entity_id", v.replace(/\D/g, ""))} keyboardType="number-pad" /></Field>
          <PrimaryButton title="View history" onPress={viewHistory} loading={busy} />
        </>}

        {error ? <ErrorView message={error} onRetry={loadRows} /> : null}
        {!error && rows === null ? <LoadingView label="Loading records…" /> : null}
        {!error && rows?.length === 0 && !["Admissions", "History"].includes(tab) ? <EmptyView message="No records yet." /> : null}

        {tab === "Results" && rows?.map((row) => <RecordCard key={row.id} row={row} fields={[["student_id", "Student ID"], ["exam_id", "Exam ID"], ["version", "Version"], ["status", "State"], ["reviewed_by", "Reviewed by"], ["published_by", "Published by"]]}>
          <SecondaryButton title="Preview" onPress={() => setPreview(row)} />
          {row.status === "Draft" ? <SecondaryButton title="Review" onPress={() => resultDecision(row, "review")} /> : null}
          {leader && row.status === "Reviewed" ? <PrimaryButton title="Publish" onPress={() => resultDecision(row, "publish")} /> : null}
        </RecordCard>)}

        {tab === "Payments" && rows?.map((row) => <RecordCard key={row.id} row={row} fields={[["id", "Case"], ["fee_id", "Fee"], ["kind", "Type"], ["reference", "Reference"], ["amount", "Amount"], ["status", "State"], ["owner_id", "Owner ID"], ["due_date", "Next action"], ["decision_note", "Decision"]]}>
          {row.status === "Pending" ? <SecondaryButton title="Assign using form" onPress={() => assignPaymentCase(row)} /> : null}
          {leader && row.status === "Pending" ? <><PrimaryButton title="Approve" onPress={() => paymentDecision(row, "approve")} /><SecondaryButton title="Reject" onPress={() => paymentDecision(row, "reject")} /></> : null}
        </RecordCard>)}

        {tab === "Settlements" && rows?.map((row, i) => <RecordCard key={row.id || i} row={row} fields={[["reference", "Reference"], ["gross_amount", "Gross"], ["charges", "Charges"], ["net_amount", "Net"], ["settlement_date", "Date"], ["status", "Match"], ["fee_id", "Fee"]]} />)}

        {tab === "Registers" && rows?.map((row) => <RecordCard key={row.class_id} row={row} fields={[["class_name", "Class"], ["status", "State"], ["submitted_by", "Submitted by"]]}>
          {user?.role !== "Principal" && row.status !== "Submitted" ? <PrimaryButton title="Submit register" onPress={() => submitRegister(row)} /> : null}
        </RecordCard>)}

        {tab === "Versions" && rows?.map((row) => <RecordCard key={row.id} row={row} fields={[["kind", "Record type"], ["scope", "Record ID"], ["version", "Version"], ["effective_from", "Effective from"], ["effective_until", "Until"], ["status", "State"], ["approved_by", "Approved by"]]}>
          <SecondaryButton title="Preview" onPress={() => setPreview(row)} />
          {row.status === "Draft" ? <PrimaryButton title="Approve" onPress={() => approveSnapshot(row)} /> : null}
        </RecordCard>)}

        {preview ? <Preview row={preview} onClose={() => setPreview(null)} onDownload={async (row) => {
          try {
            await downloadAndShare(`/workflows/snapshots/${row.id}/attachment`, row.data?.filename || `evidence-${row.id}`);
          } catch (e) { showAlert("Download failed", errorMessage(e)); }
        }} /> : null}
      </ScrollView>
    </View>
  );
}

function Preview({ row, onClose, onDownload }: { row: Row; onClose: () => void; onDownload: (row: Row) => void }) {
  const history: Row[] | undefined = row.history;
  const data = row.data || {};
  return (
    <Card style={styles.preview}>
      <View style={styles.previewHeader}><Text style={styles.subheading}>Record preview</Text><SecondaryButton title="Close" onPress={onClose} /></View>
      {history ? history.map((revision) => (
        <View key={revision.id} style={styles.revision}>
          <Text style={styles.recordValue}>{revision.created_at} · {revision.actor} · {revision.action}</Text>
          {revision.reason ? <Text style={styles.help}>{revision.reason}</Text> : null}
          {[...new Set([...Object.keys(revision.before || {}), ...Object.keys(revision.after || {})])].map((key) => (
            <View key={key} style={styles.change}><Text style={styles.recordLabel}>{key}</Text><Text style={styles.recordValue}>Before: {valueText(revision.before?.[key])}{"\n"}After: {valueText(revision.after?.[key])}</Text></View>
          ))}
        </View>
      )) : <>
        <Text style={styles.help}>{row.reason || data.label || data.exam_name || "No note"}</Text>
        {(data.rows || data.entries || data.passengers) ? (data.rows || data.entries || data.passengers).map((item: Row, index: number) => (
          <View key={index} style={styles.change}>{Object.entries(item).slice(0, 7).map(([key, value]) => <Text key={key} style={styles.recordValue}><Text style={styles.recordLabel}>{key}: </Text>{valueText(value)}</Text>)}</View>
        )) : null}
        {data.record ? Object.entries(data.record).map(([key, value]) => <View key={key} style={styles.recordLine}><Text style={styles.recordLabel}>{key}</Text><Text style={styles.recordValue}>{valueText(value)}</Text></View>) : null}
        {data.archive_note ? <Text style={styles.help}>{data.archive_note}</Text> : null}
        {data.archive_file ? <PrimaryButton title="Download archived evidence" onPress={() => onDownload(row)} /> : null}
      </>}
    </Card>
  );
}

const INTRO: Record<Tab, string> = {
  Results: "Prepare a result from saved marks, review it, then publish it to the family portal.",
  Payments: "Verify payment reports and record exception decisions. Approval never sends an external refund.",
  Settlements: "Import and review bank reconciliation entries without changing fee balances.",
  Registers: "Submit completed daily or lesson attendance registers and optionally notify families of absences.",
  Versions: "Capture and approve dated timetable, compliance evidence, or transport passenger-list snapshots.",
  Admissions: "Finish student onboarding and review submitted admission documents.",
  History: "Inspect retained before/after values and the actor for operational record changes.",
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  tabWrap: { flexGrow: 0, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabs: { paddingHorizontal: spacing(2), gap: spacing(1) },
  tab: { paddingHorizontal: spacing(4), paddingVertical: spacing(3), borderBottomWidth: 2, borderBottomColor: "transparent" },
  activeTab: { borderBottomColor: colors.primary },
  tabText: { ...type.label, color: colors.textMuted },
  activeTabText: { color: colors.primary },
  content: { padding: spacing(4), paddingBottom: spacing(12) },
  title: { ...type.title, color: colors.text },
  intro: { ...type.body, color: colors.textMuted, marginTop: spacing(1), marginBottom: spacing(4) },
  note: { minHeight: 88, textAlignVertical: "top" },
  help: { ...type.caption, color: colors.textMuted, marginVertical: spacing(3) },
  subheading: { ...type.heading, color: colors.text, marginTop: spacing(6), marginBottom: spacing(3) },
  switchLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing(4), gap: spacing(3) },
  switchLabel: { ...type.body, color: colors.text, flex: 1 },
  record: { marginTop: spacing(3) },
  recordLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing(4), paddingVertical: spacing(1.5), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  recordLabel: { ...type.caption, color: colors.textMuted, flexShrink: 0 },
  recordValue: { ...type.label, color: colors.text, flex: 1, textAlign: "right" },
  actions: { gap: spacing(2), marginTop: spacing(3) },
  preview: { marginTop: spacing(5), borderColor: colors.primaryBorder },
  previewHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  revision: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing(3), marginTop: spacing(3) },
  change: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: spacing(3), marginTop: spacing(2), gap: spacing(1) },
});
