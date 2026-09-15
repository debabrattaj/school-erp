import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import API from "../api";
import { getUser } from "../auth";
import "./Workflows.css";

const today = () => new Date().toLocaleDateString("en-CA");
const errorText = (e) => typeof e.response?.data?.detail === "string" ? e.response.data.detail : "Unable to complete this action. Check the fields and try again.";
async function downloadWorkflowFile(path, name) {
  const { data } = await API.get(path, { responseType: "blob" });
  const url = URL.createObjectURL(data);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Select({ label, options = [], value = "", onChange, required = true }) {
  return <label className="workflow-field">{label}<select required={required} value={value} onChange={e => onChange(e.target.value)}><option value="">Select {label.toLowerCase()}</option>{options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>;
}
const choices = items => items.map(id => ({ id, label: id }));
function Records({ rows, columns, actions }) {
  return <div className="workflow-table"><table><thead><tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}{actions && <th>Actions</th>}</tr></thead><tbody>{rows.map((r, i) => <tr key={r.id ?? i}>{columns.map(([key]) => <td key={key}>{String(r[key] ?? "—")}</td>)}{actions && <td><div className="workflow-actions">{actions(r)}</div></td>}</tr>)}</tbody></table>{!rows.length && <p>No records yet.</p>}</div>;
}

export default function Workflows() {
  const role = getUser()?.role;
  const leader = ["Admin", "Principal"].includes(role);
  const tabs = [...(role !== "Accounts" ? ["Results", "Registers"] : []), ...(role !== "Teacher" ? ["Payments", "Settlements"] : []), ...(leader ? ["Versions", "Admissions", "History"] : [])];
  const [tab, setTab] = useState(tabs[0]);
  const [options, setOptions] = useState({});
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ on_date: today(), period_no: 0, kind: "UPI", snapshot_kind: "Timetable", direction: "Both", effective_from: today(), entity: "marks" });
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));
  const loadOptions = useCallback(async () => { const r = await API.get("/workflows/options"); setOptions(r.data); }, []);
  const load = useCallback(async () => {
    let path = { Results: "/results", Payments: "/payments/cases", Settlements: "/payments/settlements", Versions: "/snapshots" }[tab];
    if (tab === "Registers") path = `/attendance/registers?on_date=${form.on_date}&period_no=${form.period_no}`;
    if (!path) { setRows([]); return; }
    const r = await API.get(`/workflows${path}`); setRows(r.data);
  }, [tab, form.on_date, form.period_no]);
  useEffect(() => { loadOptions().catch(e => setMessage(errorText(e))); }, [loadOptions]);
  useEffect(() => { setPreview(null); load().catch(e => { setRows([]); setMessage(errorText(e)); }); }, [load]);
  async function run(work, success = "Saved.") {
    setBusy(true); setMessage("");
    try { await work(); await load(); setMessage(success); } catch (e) { setMessage(errorText(e)); } finally { setBusy(false); }
  }
  function decision(path) {
    if (!note.trim()) { setMessage("Enter a review or decision note first."); return; }
    return run(() => API.post(`/workflows${path}`, { note }));
  }
  const select = (label, key, source, required = true) => <Select label={label} value={form[key]} options={options[source] || []} onChange={v => set(key, v)} required={required} />;
  const input = (label, key, type = "text", required = true) => <label className="workflow-field">{label}<input type={type} step={type === "number" ? "any" : undefined} required={required} value={form[key] ?? ""} onChange={e => set(key, e.target.value)} /></label>;
  const submit = (handler, label) => <form onSubmit={e => { e.preventDefault(); handler(); }} className="workflow-form">{label}</form>;
  const button = (label, action) => <button type="button" className="secondary-button" disabled={busy} onClick={action}>{label}</button>;
  const save = label => <button className="primary-button" disabled={busy}>{busy ? "Working…" : label}</button>;
  return <div className="workflow-page"><section className="page-header"><div><p className="eyebrow">School operations</p><h2>Reviews &amp; approvals</h2><p>Check records, publish results and resolve payment exceptions.</p></div></section>
    <nav className="workflow-actions" aria-label="Workflow sections">{tabs.map(t => <button key={t} className={t === tab ? "primary-button" : "secondary-button"} onClick={() => { setTab(t); setMessage(""); }}>{t}</button>)}</nav>
    {message && <p role="status" className="workflow-message">{message}</p>}
    <section className="form-panel">
      <label className="workflow-field">Review / decision note<textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Record what was checked and why this action is needed." maxLength={2000} /></label>
      {tab === "Results" && <><p>Prepare a report from saved marks, review it, then ask an administrator or principal to publish. Changed source records require a new version. <Link to="/marks">Open Marks</Link></p>
        {submit(() => run(() => API.post("/workflows/results", { student_id: Number(form.student_id), exam_id: Number(form.exam_id), note })), <>{select("Student", "student_id", "students")}{select("Exam", "exam_id", "exams")}{save("Prepare draft")}</>)}
        <Records rows={rows} columns={[["student_id", "Student ID"], ["exam_id", "Exam ID"], ["version", "Version"], ["status", "State"], ["reviewed_by", "Reviewed by"], ["published_by", "Published by"]]} actions={r => <>{button("Preview", () => setPreview(r))}{r.status === "Draft" && button("Review", () => decision(`/results/${r.id}/review`))}{leader && r.status === "Reviewed" && button("Publish", () => decision(`/results/${r.id}/publish`))}</>} />
      </>}
      {tab === "Payments" && <><p>Record bank verification and exception decisions here. Refunds record a refund already completed outside Schoolment; approving a case does not send money. For adjustments, enter the revised total charge.</p>
        {submit(() => run(() => API.post("/workflows/payments/cases", { fee_id: Number(form.fee_id), kind: form.kind, reference: form.reference, amount: Number(form.amount || 0), notes: note, owner_id: Number(form.owner_id) || null, due_date: form.due_date || null, target_fee_id: Number(form.target_fee_id) || null })), <>{select("Fee", "fee_id", "fees")}<Select label="Case type" options={choices(["UPI", "Dispute", "Refund", "Reversal", "Adjustment", "Reassignment"])} value={form.kind} onChange={v => set("kind", v)} />{input("Bank / case reference", "reference")}{input(form.kind === "Adjustment" ? "Revised total charge" : "Amount", "amount", "number")}{select("Owner", "owner_id", "owners", false)}{input("Next action due", "due_date", "date", false)}{form.kind === "Reassignment" && select("Target fee", "target_fee_id", "fees")}{save("Create case")}</>)}
        <Records rows={rows} columns={[["id", "Case"], ["fee_id", "Fee"], ["kind", "Type"], ["reference", "Reference"], ["amount", "Amount"], ["status", "State"], ["owner_id", "Owner ID"], ["due_date", "Next action"], ["notes", "Notes"], ["decision_note", "Decision"]]} actions={r => r.status === "Pending" && <>{button("Assign using form", () => run(() => API.put(`/workflows/payments/cases/${r.id}`, { owner_id: Number(form.owner_id) || null, due_date: form.due_date || null, notes: note })))}{leader && <>{button("Approve", () => decision(`/payments/cases/${r.id}/approve`))}{button("Reject", () => decision(`/payments/cases/${r.id}/reject`))}</>}</>} />
      </>}
      {tab === "Settlements" && <><p>Upload a UTF-8 bank reconciliation CSV with columns <code>reference,gross_amount,charges,net_amount,settlement_date</code>. Use YYYY-MM-DD dates and one payment reference per row. Matching does not change fee balances.</p><label className="workflow-field">Import statement<input type="file" accept=".csv,text/csv" disabled={busy} onChange={e => { const file = e.target.files[0]; if (!file) return; const data = new FormData(); data.append("file", file); run(() => API.post("/workflows/payments/settlements/import", data), "Statement imported."); e.target.value = ""; }} /></label><Records rows={rows} columns={[["reference", "Reference"], ["gross_amount", "Gross"], ["charges", "Charges"], ["net_amount", "Net"], ["settlement_date", "Date"], ["status", "Match"], ["fee_id", "Fee"]]} /></>}
      {tab === "Registers" && <><p>Save attendance in <Link to="/attendance">Attendance → Mark by Class</Link>, then submit the completed register. Corrections reopen it for review. Period 0 is daily attendance.</p><div className="workflow-form">{input("Date", "on_date", "date")}<label className="workflow-field">Period<input type="number" min="0" max="30" value={form.period_no} onChange={e => set("period_no", Number(e.target.value))} /></label><label><input type="checkbox" checked={!!form.notify_absences} onChange={e => set("notify_absences", e.target.checked)} /> Notify linked families of absences in the portal</label></div><Records rows={rows} columns={[["class_name", "Class"], ["status", "State"], ["submitted_by", "Submitted by"]]} actions={r => role !== "Principal" && r.status !== "Submitted" && button("Submit register", () => run(() => API.post("/workflows/attendance/registers", { class_id: r.class_id, attendance_date: form.on_date, period_no: Number(form.period_no), notify_absences: !!form.notify_absences, note })))} /></>}
      {tab === "Versions" && <><p>Capture the current timetable, compliance evidence or dated passenger list. Review the preview before approving. Approved timetable versions determine the family timetable for their effective dates. Assign substitute cover in <Link to="/leave">Staff Leave</Link>.</p>
        {submit(() => run(() => API.post("/workflows/snapshots", { kind: form.snapshot_kind, scope_id: Number(form.scope_id), effective_from: form.effective_from, effective_until: form.effective_until || null, direction: form.direction, note })), <><Select label="Record type" options={choices(["Timetable", "Evidence", "Transport"])} value={form.snapshot_kind} onChange={v => { set("snapshot_kind", v); set("scope_id", ""); }} />{select("Record", "scope_id", { Timetable: "classes", Evidence: "evidence", Transport: "routes" }[form.snapshot_kind])}{input("Effective from", "effective_from", "date")}{input("Effective until", "effective_until", "date", false)}{form.snapshot_kind === "Transport" && <Select label="Journey" options={choices(["Morning", "Afternoon", "Both"])} value={form.direction} onChange={v => set("direction", v)} />}{save("Capture draft")}</>)}
        <Records rows={rows} columns={[["kind", "Record type"], ["scope", "Record ID"], ["version", "Version"], ["effective_from", "Effective from"], ["effective_until", "Until"], ["status", "State"], ["approved_by", "Approved by"]]} actions={r => <>{button("Preview", () => setPreview(r))}{r.status === "Draft" && button("Approve", () => decision(`/snapshots/${r.id}/approve`))}</>} />
      </>}
      {tab === "Admissions" && <><p>After converting an enquiry into a student, select their class, existing parent account and applicable fee structures. Repeating the same onboarding does not duplicate its fees or guardian link.</p>
        {submit(() => run(async () => { await API.post("/workflows/admissions/onboard", { student_id: Number(form.student_id), class_id: Number(form.class_id), guardian_user_id: Number(form.guardian_id), fee_structure_ids: form.structure_id ? [Number(form.structure_id)] : [], note }); await loadOptions(); }), <>{select("Student", "student_id", "students")}{select("Class", "class_id", "classes")}{select("Guardian account", "guardian_id", "guardians")}{select("Fee structure", "structure_id", "structures", false)}{save("Complete onboarding")}</>)}
        <h3>Document review</h3>{submit(() => run(async () => { await API.put(`/workflows/admissions/documents/${form.document_id}/review`, { status: form.review_status, note }); await loadOptions(); }), <>{select("Document", "document_id", "documents")}<Select label="Review state" options={choices(["Received", "Reviewed", "Needs clarification"])} value={form.review_status} onChange={v => set("review_status", v)} />{save("Save review")}</>)}
      </>}
      {tab === "History" && <><p>View retained values and the actor for changes recorded after this release. Existing records have no retroactive history.</p>{submit(() => run(async () => { const r = await API.get(`/workflows/history/${form.entity}/${Number(form.entity_id)}`); setPreview({ history: r.data }); }), <><Select label="Record type" options={choices(["students", "attendance", "marks", "fees", "timetable_entries", "transport_assignments", "assignment_submissions", "admission_documents", "compliance_tasks", "payment_cases", "result_releases", "operational_snapshots", "attendance_registers", "student_enrollments"])} value={form.entity} onChange={v => set("entity", v)} />{input("Record ID", "entity_id", "number")}{save("View history")}</>)}</>}
      {preview && <section className="workflow-preview"><div className="workflow-actions"><h3>Record preview</h3>{button("Close preview", () => setPreview(null))}</div>
        {preview.history ? preview.history.map(r => <details key={r.id}><summary>{r.created_at} · {r.actor} · {r.action}</summary><p>{r.reason}</p><Records rows={[...new Set([...Object.keys(r.before || {}), ...Object.keys(r.after || {})])].map(key => ({ key, before: r.before?.[key], after: r.after?.[key] }))} columns={[["key", "Field"], ["before", "Before"], ["after", "After"]]} /></details>) : <><p>{preview.reason}</p><p>{preview.data?.label || preview.data?.exam_name} · version {preview.version}</p>
          {preview.data?.rows && <Records rows={preview.data.rows} columns={[["subject", "Subject"], ["obtained", "Score"], ["max", "Maximum"], ["grade", "Outcome"]]} />}
          {preview.data?.entries && <Records rows={preview.data.entries} columns={[["day_of_week", "Day"], ["period_no", "Period"], ["subject", "Subject"], ["teacher_name_snapshot", "Teacher"], ["room", "Room"]]} />}
          {preview.data?.passengers && <Records rows={preview.data.passengers} columns={[["student_name", "Student"], ["direction", "Journey"], ["vehicle_id", "Vehicle ID"], ["stop_id", "Stop ID"]]} />}
          {preview.data?.record && <Records rows={Object.entries(preview.data.record).map(([key, value]) => ({ key, value }))} columns={[["key", "Field"], ["value", "Value"]]} />}
          {preview.data?.archive_note && <p>{preview.data.archive_note}</p>}
          {preview.data?.archive_file && button("Download archived evidence", () => run(() => downloadWorkflowFile(`/workflows/snapshots/${preview.id}/attachment`, preview.data.filename)))}
        </>}
      </section>}
    </section></div>;
}
