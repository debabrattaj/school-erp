import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BriefcaseBusiness, ClipboardCheck, Edit, PlusCircle, Trash2 } from "lucide-react";
import API from "../api";
import EnhancedRecordsTable from "../components/EnhancedRecordsTable";

const emptyForm = {
  student_id: "", academic_year: "", experience_type: "Internship", title: "", organization: "",
  supervisor_name: "", supervisor_email: "", start_date: "", end_date: "", required_hours: "",
  completed_hours: 0, status: "Planned", evaluation: "", score: "", evidence_url: "", remarks: "",
};
const types = ["Internship", "Project", "Industrial Training", "Clinical Rotation", "Hospital Training", "Research"];
const statuses = ["Planned", "In Progress", "Completed", "On Hold", "Cancelled"];
const emptyLog = { log_date: "", activity: "", learning_outcome: "", hours: "", supervisor_name: "", verification_status: "Pending", remarks: "" };

function errorMessage(error) {
  const detail = error.response?.data?.detail;
  return typeof detail === "string" ? detail : "Unable to save the record.";
}

export default function ExperientialLearning() {
  const [records, setRecords] = useState([]);
  const [students, setStudents] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [mode, setMode] = useState("list");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [searchText, setSearchText] = useState("");
  const [logEntries, setLogEntries] = useState([]);
  const [logForm, setLogForm] = useState(emptyLog);

  async function load() {
    try {
      setLoading(true);
      const [experienceResponse, studentsResponse] = await Promise.all([API.get("/experiential-learning/"), API.get("/students/")]);
      setRecords(experienceResponse.data || []);
      setStudents(studentsResponse.data || []);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!message) return undefined;
    const id = window.setTimeout(() => setMessage(""), 3500);
    return () => window.clearTimeout(id);
  }, [message]);

  function change(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }
  function toPayload() {
    return {
      ...form,
      student_id: Number(form.student_id),
      academic_year: form.academic_year.trim() || null,
      required_hours: form.required_hours === "" ? null : Number(form.required_hours),
      completed_hours: Number(form.completed_hours || 0),
      score: form.score === "" ? null : Number(form.score),
      organization: form.organization.trim() || null,
      supervisor_name: form.supervisor_name.trim() || null,
      supervisor_email: form.supervisor_email.trim() || null,
      start_date: form.start_date || null, end_date: form.end_date || null,
      evaluation: form.evaluation.trim() || null, evidence_url: form.evidence_url.trim() || null,
      remarks: form.remarks.trim() || null,
    };
  }
  async function submit(event) {
    event.preventDefault();
    try {
      const payload = toPayload();
      if (!payload.student_id || !payload.title.trim()) { setMessage("Student and activity title are required."); return; }
      if (editingId) await API.put(`/experiential-learning/${editingId}`, payload);
      else await API.post("/experiential-learning/", payload);
      setMessage(editingId ? "Record updated." : "Experience record created.");
      setForm(emptyForm); setEditingId(null); setMode("list"); await load();
    } catch (error) { setMessage(errorMessage(error)); }
  }
  async function edit(record) {
    setEditingId(record.id);
    setForm({ ...emptyForm, ...record, student_id: String(record.student_id), required_hours: record.required_hours ?? "", score: record.score ?? "", start_date: record.start_date || "", end_date: record.end_date || "" });
    setMode("form"); setLogForm(emptyLog); window.scrollTo({ top: 0, behavior: "smooth" });
    try { const response = await API.get(`/experiential-learning/${record.id}/logbook`); setLogEntries(response.data || []); }
    catch (error) { setMessage(errorMessage(error)); }
  }
  async function addLog(event) {
    event.preventDefault();
    try {
      if (!logForm.log_date || !logForm.activity.trim()) { setMessage("Log date and activity are required."); return; }
      await API.post(`/experiential-learning/${editingId}/logbook`, { ...logForm, hours: Number(logForm.hours || 0), learning_outcome: logForm.learning_outcome.trim() || null, supervisor_name: logForm.supervisor_name.trim() || null, remarks: logForm.remarks.trim() || null });
      const response = await API.get(`/experiential-learning/${editingId}/logbook`); setLogEntries(response.data || []); setLogForm(emptyLog); setMessage("Logbook entry added.");
    } catch (error) { setMessage(errorMessage(error)); }
  }
  async function deleteLog(entryId) {
    if (!window.confirm("Delete this logbook entry?")) return;
    try { await API.delete(`/experiential-learning/${editingId}/logbook/${entryId}`); setLogEntries((rows) => rows.filter((row) => row.id !== entryId)); setMessage("Logbook entry deleted."); }
    catch (error) { setMessage(errorMessage(error)); }
  }
  async function remove(record) {
    if (!window.confirm(`Delete ${record.title}?`)) return;
    try { await API.delete(`/experiential-learning/${record.id}`); setMessage("Record deleted."); await load(); }
    catch (error) { setMessage(errorMessage(error)); }
  }
  const filtered = useMemo(() => records.filter((r) => {
    const matchesText = `${r.student_name} ${r.title} ${r.organization || ""}`.toLowerCase().includes(searchText.toLowerCase());
    return matchesText && (!typeFilter || r.experience_type === typeFilter) && (!statusFilter || r.status === statusFilter);
  }), [records, searchText, statusFilter, typeFilter]);
  const active = records.filter((r) => r.status === "In Progress").length;
  const completed = records.filter((r) => r.status === "Completed").length;

  const formView = <section className="form-panel"><div className="panel-header"><div><h3>{editingId ? "Update supervised experience" : "Add supervised experience"}</h3><p>Use this for BTech internships and projects, or pharmacy clinical, hospital and industrial training.</p></div></div>
    <form className="classic-form" onSubmit={submit}><div className="form-grid">
      <div className="form-field"><label>Student *</label><select name="student_id" value={form.student_id} onChange={change} required><option value="">Select student</option>{students.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name} · {s.admission_no}</option>)}</select></div>
      <div className="form-field"><label>Experience type *</label><select name="experience_type" value={form.experience_type} onChange={change}>{types.map((type) => <option key={type}>{type}</option>)}</select></div>
      <div className="form-field"><label>Activity / project title *</label><input name="title" value={form.title} onChange={change} required placeholder="e.g. Summer internship — formulation development" /></div>
      <div className="form-field"><label>Organisation / training site</label><input name="organization" value={form.organization} onChange={change} placeholder="Company, hospital or lab" /></div>
      <div className="form-field"><label>Academic year</label><input name="academic_year" value={form.academic_year} onChange={change} placeholder="2026-27" /></div>
      <div className="form-field"><label>Status</label><select name="status" value={form.status} onChange={change}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></div>
      <div className="form-field"><label>Start date</label><input type="date" name="start_date" value={form.start_date} onChange={change} /></div>
      <div className="form-field"><label>End date</label><input type="date" name="end_date" value={form.end_date} onChange={change} /></div>
      <div className="form-field"><label>Required hours</label><input type="number" min="0" step="0.5" name="required_hours" value={form.required_hours} onChange={change} /></div>
      <div className="form-field"><label>Completed hours</label><input type="number" min="0" step="0.5" name="completed_hours" value={form.completed_hours} onChange={change} /></div>
      <div className="form-field"><label>Supervisor name</label><input name="supervisor_name" value={form.supervisor_name} onChange={change} /></div>
      <div className="form-field"><label>Supervisor email</label><input type="email" name="supervisor_email" value={form.supervisor_email} onChange={change} /></div>
      <div className="form-field"><label>Score / grade</label><input type="number" min="0" step="0.01" name="score" value={form.score} onChange={change} /></div>
      <div className="form-field"><label>Evidence link</label><input type="url" name="evidence_url" value={form.evidence_url} onChange={change} placeholder="https://..." /></div>
      <div className="form-field full-width"><label>Evaluation</label><textarea name="evaluation" value={form.evaluation} onChange={change} rows="2" placeholder="Supervisor feedback, learning outcomes or assessment." /></div>
      <div className="form-field full-width"><label>Notes</label><textarea name="remarks" value={form.remarks} onChange={change} rows="2" /></div>
    </div><div className="form-actions"><button className="primary-button" type="submit"><PlusCircle size={18} />{editingId ? "Update record" : "Create record"}</button><button className="light-button" type="button" onClick={() => { setMode("list"); setEditingId(null); setForm(emptyForm); }}>Cancel</button></div></form>
  </section>;

  const logbookView = editingId && <section className="form-panel"><div className="panel-header"><div><h3>Clinical & Practical Logbook</h3><p>Add dated activities and hours; mark entries verified after supervisor review.</p></div></div><form className="classic-form" onSubmit={addLog}><div className="form-grid"><div className="form-field"><label>Date *</label><input type="date" name="log_date" value={logForm.log_date} onChange={(e) => setLogForm((p) => ({...p, [e.target.name]: e.target.value}))} required/></div><div className="form-field"><label>Hours</label><input type="number" min="0" step="0.5" name="hours" value={logForm.hours} onChange={(e) => setLogForm((p) => ({...p, [e.target.name]: e.target.value}))}/></div><div className="form-field"><label>Activity *</label><input name="activity" value={logForm.activity} onChange={(e) => setLogForm((p) => ({...p, [e.target.name]: e.target.value}))} placeholder="Dispensing, ward round, lab procedure..." required/></div><div className="form-field"><label>Supervisor</label><input name="supervisor_name" value={logForm.supervisor_name} onChange={(e) => setLogForm((p) => ({...p, [e.target.name]: e.target.value}))}/></div><div className="form-field"><label>Verification</label><select name="verification_status" value={logForm.verification_status} onChange={(e) => setLogForm((p) => ({...p, [e.target.name]: e.target.value}))}><option>Pending</option><option>Verified</option><option>Returned</option></select></div><div className="form-field full-width"><label>Learning outcome</label><textarea name="learning_outcome" value={logForm.learning_outcome} onChange={(e) => setLogForm((p) => ({...p, [e.target.name]: e.target.value}))} rows="2"/></div></div><div className="form-actions"><button className="secondary-button"><PlusCircle size={18}/>Add log entry</button></div></form><EnhancedRecordsTable data={logEntries} emptyText="No logbook entries yet." columns={[{key:"log_date",label:"Date"},{key:"activity",label:"Activity"},{key:"hours",label:"Hours"},{key:"supervisor_name",label:"Supervisor",render:r=>r.supervisor_name||"-"},{key:"verification_status",label:"Verification"},{key:"actions",label:"Actions",hideable:false,actions:false,value:()=>"",render:r=><button className="delete-button" type="button" onClick={()=>deleteLog(r.id)}><Trash2 size={15}/></button>}]} /></section>;
  if (mode === "form") return <div className="management-page"><section className="page-heading"><div><p className="eyebrow">College Experience</p><h2>{editingId ? "Edit Experience" : "Add Experience"}</h2></div><button className="light-button" type="button" onClick={() => setMode("list")}><ArrowLeft size={17} />Back</button></section>{message && <div className="toast-notification">{message}</div>}{formView}{logbookView}</div>;
  return <div className="management-page"><section className="page-heading"><div><p className="eyebrow">College Experience</p><h2>Internships, Projects & Clinical Training</h2><p>Track supervised learning hours, site supervisors, evidence and outcomes.</p></div><button className="primary-button" type="button" onClick={() => { setForm(emptyForm); setEditingId(null); setMode("form"); }}><PlusCircle size={18} />Add Experience</button></section>
    {message && <div className="toast-notification">{message}</div>}
    <section className="summary-strip report-summary-grid"><div className="summary-card"><BriefcaseBusiness size={22} /><div><span>Total records</span><strong>{records.length}</strong></div></div><div className="summary-card"><ClipboardCheck size={22} /><div><span>In progress</span><strong>{active}</strong></div></div><div className="summary-card"><ClipboardCheck size={22} /><div><span>Completed</span><strong>{completed}</strong></div></div></section>
    <section className="table-panel module-filter-panel"><div className="filter-row sis-filter-row"><div className="form-field"><label>Type</label><select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}><option value="">All types</option>{types.map((type) => <option key={type}>{type}</option>)}</select></div><div className="form-field"><label>Status</label><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="">All statuses</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select></div><button className="light-button" type="button" onClick={() => { setTypeFilter(""); setStatusFilter(""); setSearchText(""); }}>Clear filters</button></div></section>
    <EnhancedRecordsTable data={filtered} loading={loading} loadingText="Loading supervised experience..." emptyText="No internship, project or clinical-training records yet." searchPlaceholder="Search student, activity or organisation..." searchText={searchText} setSearchText={setSearchText} columns={[
      { key: "student_name", label: "Student" }, { key: "experience_type", label: "Type" }, { key: "title", label: "Activity" }, { key: "organization", label: "Organisation", render: (r) => r.organization || "-" },
      { key: "hours", label: "Hours", render: (r) => `${r.completed_hours || 0}${r.required_hours != null ? ` / ${r.required_hours}` : ""}` }, { key: "status", label: "Status" },
      { key: "actions", label: "Actions", hideable: false, actions: false, value: () => "", render: (record) => <div className="action-buttons"><button className="edit-button" type="button" title="Edit" onClick={() => edit(record)}><Edit size={15} /></button><button className="delete-button" type="button" title="Delete" onClick={() => remove(record)}><Trash2 size={15} /></button></div> },
    ]} />
  </div>;
}
