import { useEffect, useRef, useState } from "react";
import API from "../api";

const blank = { title: "", due_date: "", status: "Pending", feedback: "", evidence_url: "" };
const statuses = ["Pending", "Submitted", "Changes Requested", "Approved"];

function messageFor(error) {
  const detail = error.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((item) => item.msg).join(". ");
  return "Unable to load or save milestones. Please try again.";
}

export default function AcademicMilestones({ activity, canManage, canDelete, onBack }) {
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const endpoint = `/academic-activities/${activity.id}/milestones`;
  const editable = canManage && activity.status !== "Completed";

  useEffect(() => {
    let active = true;
    API.get(endpoint).then(({ data }) => {
      if (active) setRecords(data);
    }).catch((failure) => {
      if (active) setError(messageFor(failure));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [endpoint]);

  function change(event) {
    setForm((previous) => ({ ...previous, [event.target.name]: event.target.value }));
  }

  async function save(event) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const payload = { ...form, due_date: form.due_date || null };
      const { data } = editing
        ? await API.put(`${endpoint}/${editing.id}`, { ...payload, version: editing.version })
        : await API.post(endpoint, payload);
      setRecords((previous) => editing ? previous.map((row) => row.id === data.id ? data : row) : [...previous, data]);
      setForm(blank);
      setEditing(null);
    } catch (failure) {
      setError(messageFor(failure));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function remove(row) {
    if (pending.current || !window.confirm(`Delete milestone “${row.title}”?`)) return;
    pending.current = true;
    setBusy(true);
    try {
      await API.delete(`${endpoint}/${row.id}`);
      setRecords((previous) => previous.filter((item) => item.id !== row.id));
      if (editing?.id === row.id) { setEditing(null); setForm(blank); }
      setError("");
    } catch (failure) {
      setError(messageFor(failure));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <div className="management-page">
    <section className="page-heading"><div><h2>Milestones · {activity.title}</h2><p>{activity.student_name} · {activity.programme} · {activity.semester}</p><p>{records.filter((row) => row.status === "Approved").length} of {records.length} milestones approved</p></div><button type="button" className="secondary-button" disabled={busy} onClick={onBack}>Back to activities</button></section>
    {error && <p role="alert">{error}</p>}
    {activity.status === "Completed" && <p>Reopen the activity to change milestones.</p>}
    {editable && <section className="form-panel"><h3>{editing ? "Review milestone" : "Add milestone"}</h3><p>Track proposal approval, prototype reviews, dissertation chapters, lab records or practical competency checks.</p>
      <form className="classic-form" onSubmit={save}><fieldset disabled={busy || loading} style={{ border: 0, padding: 0, minWidth: 0 }}><div className="form-grid">
        <div className="form-field"><label htmlFor="milestone-title">Milestone *</label><input id="milestone-title" name="title" value={form.title} onChange={change} maxLength={200} required /></div>
        <div className="form-field"><label htmlFor="milestone-date">Due date</label><input id="milestone-date" name="due_date" type="date" value={form.due_date} onChange={change} /></div>
        <div className="form-field"><label htmlFor="milestone-status">Review status</label><select id="milestone-status" name="status" value={form.status} onChange={change}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></div>
        <div className="form-field full-width"><label htmlFor="milestone-evidence">Evidence link (report, repository or lab record)</label><input id="milestone-evidence" name="evidence_url" type="url" value={form.evidence_url} onChange={change} maxLength={2000} placeholder="https://…" /></div>
        <div className="form-field full-width"><label htmlFor="milestone-feedback">Supervisor feedback</label><textarea id="milestone-feedback" name="feedback" value={form.feedback} onChange={change} maxLength={5000} /></div>
      </div><div className="form-actions"><button type="submit" className="primary-button" aria-busy={busy}>{busy && <span className="spinner" aria-hidden="true" />}{busy ? "Saving…" : "Save milestone"}</button>{editing && <button type="button" className="secondary-button" onClick={() => { setEditing(null); setForm(blank); }}>Cancel edit</button>}</div></fieldset></form>
    </section>}
    {loading ? <p role="status">Loading milestones…</p> : <section className="form-panel">
      <h3>Milestone checklist</h3>
      {!records.length && <p>No milestones assigned yet.</p>}
      {records.map((row) => <article key={row.id} style={{ paddingBlock: "1rem", borderBottom: "1px solid var(--border-color, #dce2ed)" }}>
        <h4>{row.title}</h4><p>{row.status} · Due {row.due_date || "date not set"}</p><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{row.feedback}</p>
        {row.evidence_url && <p><a href={row.evidence_url} target="_blank" rel="noopener noreferrer">Open supporting evidence</a></p>}
        {row.reviewed_at && <p>Reviewed by {row.reviewed_by} · {new Date(`${row.reviewed_at}Z`).toLocaleString()}</p>}
        {editable && <div className="form-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => { setEditing(row); setForm({ title: row.title, due_date: row.due_date || "", status: row.status, feedback: row.feedback || "", evidence_url: row.evidence_url || "" }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Review / edit</button>{canDelete && <button type="button" className="delete-button" disabled={busy} onClick={() => remove(row)}>Delete</button>}</div>}
      </article>)}
    </section>}
  </div>;
}
