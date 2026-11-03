import { useEffect, useRef, useState } from "react";
import { ClipboardCheck, Edit, PlusCircle, Trash2 } from "lucide-react";
import API from "../api";
import { hasAccess } from "../auth";
import EnhancedRecordsTable from "../components/EnhancedRecordsTable";
import AcademicMilestones from "./AcademicMilestones";

const types = ["Capstone Project", "Research Dissertation", "Engineering Practical", "Pharmacy Practical"];
const statuses = ["Planned", "In Progress", "Submitted", "Completed"];
const blank = {
  student_id: "", academic_year: "", semester: "", activity_type: types[0],
  title: "", programme: "", course_code: "", supervisor: "", laboratory: "",
  due_date: "", status: "Planned", progress: 0, score: "", max_score: 100,
  objective: "", feedback: "",
};

function errorMessage(error) {
  const detail = error.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((item) => item.msg).join(". ");
  return "Unable to complete the request. Please try again.";
}

function fetchActivities() {
  return Promise.all([
    API.get("/academic-activities"), API.get("/academic-activities/student-options"),
  ]);
}

export default function AcademicActivities() {
  const [records, setRecords] = useState([]);
  const [students, setStudents] = useState([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [programmeFilter, setProgrammeFilter] = useState("");
  const [supervisorFilter, setSupervisorFilter] = useState("");
  const [milestoneActivity, setMilestoneActivity] = useState(null);
  const requestPending = useRef(false);
  const canManage = hasAccess(["Admin", "Principal", "Teacher"], "manage");
  const canDelete = hasAccess(["Admin", "Principal"], "manage");

  async function load() {
    try {
      const [activitiesResponse, studentsResponse] = await fetchActivities();
      setRecords(activitiesResponse.data);
      setStudents(studentsResponse.data);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetchActivities().then(([activitiesResponse, studentsResponse]) => {
      if (!active) return;
      setRecords(activitiesResponse.data);
      setStudents(studentsResponse.data);
      setLoading(false);
    }).catch((error) => {
      if (!active) return;
      setMessage(errorMessage(error));
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  function change(event) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  }

  function openForm(record = null) {
    setEditing(record);
    setForm(record ? Object.fromEntries(Object.keys(blank).map((key) => [key, record[key] ?? ""])) : { ...blank });
    setShowForm(true);
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(event) {
    event.preventDefault();
    if (requestPending.current) return;
    requestPending.current = true;
    setBusy(true);
    setMessage("");
    const payload = {
      ...form,
      student_id: Number(form.student_id), progress: Number(form.progress),
      score: form.score === "" ? null : Number(form.score), max_score: Number(form.max_score),
      due_date: form.due_date || null,
    };
    try {
      if (editing) {
        await API.put(`/academic-activities/${editing.id}`, { ...payload, version: editing.version });
      } else {
        await API.post("/academic-activities", payload);
      }
      setShowForm(false);
      setMessage("Academic activity saved.");
      await load();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      requestPending.current = false;
      setBusy(false);
    }
  }

  async function remove(record) {
    if (requestPending.current || !window.confirm(`Delete “${record.title}” for ${record.student_name}?`)) return;
    requestPending.current = true;
    setBusy(true);
    try {
      await API.delete(`/academic-activities/${record.id}`);
      setMessage("Academic activity deleted.");
      await load();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      requestPending.current = false;
      setBusy(false);
    }
  }

  const today = new Date();
  const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const overdue = records.filter((record) => record.due_date && record.due_date < dateKey && record.status !== "Completed").length;
  const visible = records.filter((record) =>
    (!typeFilter || record.activity_type === typeFilter) &&
    (!statusFilter || record.status === statusFilter) &&
    (!programmeFilter || record.programme === programmeFilter) &&
    (!supervisorFilter || record.supervisor === supervisorFilter) &&
    (!overdueOnly || (record.due_date && record.due_date < dateKey && record.status !== "Completed"))
  );

  function exportCsv() {
    const keys = ["student_name", "title", "activity_type", "programme", "academic_year", "semester", "supervisor", "due_date", "status", "progress", "score", "max_score"];
    function cell(value) {
      let text = String(value ?? "");
      if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    }
    const rows = [keys, ...visible.map((row) => keys.map((key) => row[key]))];
    const url = URL.createObjectURL(new Blob(["\uFEFF", rows.map((row) => row.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `academic-activities-${dateKey}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const columns = [
    { key: "student_name", label: "Student" },
    { key: "title", label: "Activity" },
    { key: "activity_type", label: "Type" },
    { key: "programme", label: "Programme" },
    { key: "academic_year", label: "Year" },
    { key: "semester", label: "Semester" },
    { key: "supervisor", label: "Supervisor" },
    { key: "due_date", label: "Due date", render: (row) => row.due_date || "—" },
    { key: "progress", label: "Progress", render: (row) => `${row.progress}%` },
    { key: "score", label: "Assessment", render: (row) => row.score === null ? "Awaiting assessment" : `${row.score} / ${row.max_score}` },
    { key: "status", label: "Status" },
    {
      key: "actions", label: "Actions", hideable: false, actions: false, value: () => "",
      render: (row) => <div className="form-actions">
        <button type="button" className="secondary-button" disabled={busy} onClick={() => setMilestoneActivity(row)}>Milestones</button>
        {canManage && <button type="button" className="secondary-button" disabled={busy} onClick={() => openForm(row)} aria-label={`Edit ${row.title}`}><Edit size={16} /> Edit</button>}
        {canDelete && <button type="button" className="delete-button" disabled={busy} onClick={() => remove(row)} aria-label={`Delete ${row.title}`}><Trash2 size={16} /></button>}
      </div>,
    },
  ];

  if (milestoneActivity) return <AcademicMilestones key={milestoneActivity.id} activity={milestoneActivity} canManage={canManage} canDelete={canDelete} onBack={() => { setMilestoneActivity(null); load(); }} />;

  return <div className="management-page">
    <section className="page-heading">
      <div><p className="eyebrow">Higher Education</p><h2>Academic Projects & Practicals</h2><p>Supervise capstones, dissertations and laboratory assessments across programmes.</p></div>
      {!showForm && canManage && <button type="button" className="primary-button" onClick={() => openForm()} disabled={busy || loading}><PlusCircle size={18} /> Assign activity</button>}
    </section>
    {message && <p role="status" className="toast-notification">{message}</p>}
    {showForm ? <section className="form-panel">
      <div className="panel-header"><h3><ClipboardCheck size={20} /> {editing ? "Edit activity" : "Assign academic activity"}</h3></div>
      <form className="classic-form" onSubmit={save}>
        <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div className="form-grid">
            <div className="form-field"><label htmlFor="activity-student">Student *</label><select id="activity-student" name="student_id" value={form.student_id} onChange={change} required><option value="">Select student</option>{students.map((student) => <option key={student.id} value={student.id}>{student.first_name} {student.last_name} · {student.admission_no}</option>)}</select></div>
            <div className="form-field"><label htmlFor="activity-type">Activity type *</label><select id="activity-type" name="activity_type" value={form.activity_type} onChange={change}>{types.map((type) => <option key={type}>{type}</option>)}</select></div>
            <div className="form-field"><label htmlFor="activity-title">Title / experiment *</label><input id="activity-title" name="title" value={form.title} onChange={change} maxLength={200} required /></div>
            <div className="form-field"><label htmlFor="activity-programme">Programme / department *</label><input id="activity-programme" name="programme" value={form.programme} onChange={change} maxLength={120} placeholder="BTech CSE, MTech, BPharm…" required /></div>
            <div className="form-field"><label htmlFor="activity-year">Academic year *</label><input id="activity-year" name="academic_year" value={form.academic_year} onChange={change} maxLength={30} placeholder="2026-27" required /></div>
            <div className="form-field"><label htmlFor="activity-semester">Semester *</label><input id="activity-semester" name="semester" value={form.semester} onChange={change} maxLength={50} required /></div>
            <div className="form-field"><label htmlFor="activity-course">Course code</label><input id="activity-course" name="course_code" value={form.course_code} onChange={change} maxLength={50} /></div>
            <div className="form-field"><label htmlFor="activity-supervisor">Supervisor / examiner *</label><input id="activity-supervisor" name="supervisor" value={form.supervisor} onChange={change} maxLength={120} required /></div>
            <div className="form-field"><label htmlFor="activity-lab">Laboratory / research group</label><input id="activity-lab" name="laboratory" value={form.laboratory} onChange={change} maxLength={120} /></div>
            <div className="form-field"><label htmlFor="activity-due">Submission due date</label><input id="activity-due" type="date" name="due_date" value={form.due_date} onChange={change} /></div>
            <div className="form-field"><label htmlFor="activity-status">Status</label><select id="activity-status" name="status" value={form.status} onChange={change}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></div>
            <div className="form-field"><label htmlFor="activity-progress">Progress (%)</label><input id="activity-progress" type="number" name="progress" min="0" max="100" step="1" value={form.progress} onChange={change} required /></div>
            <div className="form-field"><label htmlFor="activity-score">Assessment score</label><input id="activity-score" type="number" name="score" min="0" max={form.max_score} step="0.01" value={form.score} onChange={change} required={form.status === "Completed"} /></div>
            <div className="form-field"><label htmlFor="activity-maximum">Maximum marks *</label><input id="activity-maximum" type="number" name="max_score" min="0.01" max="10000" step="0.01" value={form.max_score} onChange={change} required /></div>
            <div className="form-field full-width"><label htmlFor="activity-objective">Objectives / practical competencies</label><textarea id="activity-objective" name="objective" value={form.objective} onChange={change} maxLength={5000} /></div>
            <div className="form-field full-width"><label htmlFor="activity-feedback">Examiner feedback / next milestone</label><textarea id="activity-feedback" name="feedback" value={form.feedback} onChange={change} maxLength={5000} /></div>
          </div>
          <p>To mark an activity completed, enter 100% progress and its assessment score.</p>
          <div className="form-actions">
            <button type="submit" className="primary-button" aria-busy={busy}>{busy && <span className="spinner" aria-hidden="true" />}{busy ? "Saving…" : "Save activity"}</button>
            <button type="button" className="secondary-button" onClick={() => { setShowForm(false); load(); }}>Cancel / reload records</button>
          </div>
        </fieldset>
      </form>
    </section> : <>
      <section className="form-panel">
        <p>{records.length} assigned · {records.filter((record) => record.status === "Submitted").length} awaiting review · {records.filter((record) => record.status === "Completed").length} completed · {overdue} overdue</p>
        <div className="form-actions"><label><input type="checkbox" checked={overdueOnly} onChange={(event) => setOverdueOnly(event.target.checked)} /> Show overdue only</label><button type="button" className="secondary-button" disabled={loading || !visible.length} onClick={exportCsv}>Export activity list (CSV)</button></div>
        <p>Export includes activities matching the programme, supervisor, type, status and overdue filters.</p>
        <div className="form-grid">
          <div className="form-field"><label htmlFor="filter-programme">Programme</label><select id="filter-programme" value={programmeFilter} onChange={(event) => setProgrammeFilter(event.target.value)}><option value="">All programmes</option>{[...new Set(records.map((record) => record.programme))].sort().map((programme) => <option key={programme}>{programme}</option>)}</select></div>
          <div className="form-field"><label htmlFor="filter-supervisor">Supervisor</label><select id="filter-supervisor" value={supervisorFilter} onChange={(event) => setSupervisorFilter(event.target.value)}><option value="">All supervisors</option>{[...new Set(records.map((record) => record.supervisor))].sort().map((supervisor) => <option key={supervisor}>{supervisor}</option>)}</select></div>
          <div className="form-field"><label htmlFor="filter-activity-type">Activity type</label><select id="filter-activity-type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="">All activities</option>{types.map((type) => <option key={type}>{type}</option>)}</select></div>
          <div className="form-field"><label htmlFor="filter-activity-status">Status</label><select id="filter-activity-status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select></div>
        </div>
      </section>
      <EnhancedRecordsTable columns={columns} data={visible} loading={loading} emptyText="No activities match. Assign a project or practical to get started." />
    </>}
  </div>;
}
