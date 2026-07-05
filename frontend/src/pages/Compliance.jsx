import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle, ClipboardCheck, Edit, PlusCircle, RefreshCcw, Trash2 } from "lucide-react";

import API from "../api";
import EnhancedRecordsTable from "../components/EnhancedRecordsTable";

const emptyTaskForm = {
  task_code: "",
  accreditation_body: "IB",
  standard_area: "",
  requirement: "",
  evidence_link: "",
  owner: "",
  due_date: "",
  review_date: "",
  risk_level: "Medium",
  status: "Open",
  finding: "",
  action_plan: "",
  completed_date: "",
  remarks: "",
};

const accreditationBodies = ["IB", "Cambridge", "CBSE", "ICSE", "State", "Local Authority", "Internal", "Other"];
const riskLevels = ["Low", "Medium", "High", "Critical"];
const statuses = ["Open", "In Progress", "Evidence Ready", "Reviewed", "Completed", "Deferred"];

function getApiErrorMessage(error, fallbackMessage) {
  const detail = error.response?.data?.detail;
  if (Array.isArray(detail)) return detail.map((item) => `${Array.isArray(item.loc) ? item.loc.join(".") : "field"}: ${item.msg}`).join(" | ");
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") return detail.msg || JSON.stringify(detail);
  return fallbackMessage;
}

export default function Compliance() {
  const [tasks, setTasks] = useState([]);
  const [formData, setFormData] = useState(emptyTaskForm);
  const [editingId, setEditingId] = useState(null);
  const [pageMode, setPageMode] = useState("list");
  const [searchText, setSearchText] = useState("");
  const [bodyFilter, setBodyFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return undefined;

    const timeoutId = window.setTimeout(() => {
      setMessage("");
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  async function loadTasks() {
    try {
      setLoading(true);
      setMessage("");
      const response = await API.get("/compliance/");
      setTasks(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load compliance tasks."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTasks();
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  }

  function buildPayload() {
    return {
      task_code: formData.task_code.trim(),
      accreditation_body: formData.accreditation_body,
      standard_area: formData.standard_area.trim(),
      requirement: formData.requirement.trim(),
      evidence_link: formData.evidence_link.trim() || null,
      owner: formData.owner.trim() || null,
      due_date: formData.due_date || null,
      review_date: formData.review_date || null,
      risk_level: formData.risk_level,
      status: formData.status,
      finding: formData.finding.trim() || null,
      action_plan: formData.action_plan.trim() || null,
      completed_date: formData.completed_date || null,
      remarks: formData.remarks.trim() || null,
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    try {
      const payload = buildPayload();
      if (!payload.standard_area || !payload.requirement) {
        setMessage("Standard area and requirement are required.");
        return;
      }
      if (editingId) {
        await API.put(`/compliance/${editingId}`, payload);
        setMessage("Compliance task updated successfully.");
      } else {
        await API.post("/compliance/", payload);
        setMessage("Compliance task added successfully.");
      }
      setFormData(emptyTaskForm);
      setEditingId(null);
      setPageMode("list");
      await loadTasks();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save compliance task."));
    }
  }

  function handleAddTask() {
    setEditingId(null);
    setFormData(emptyTaskForm);
    setMessage("");
    setPageMode("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEdit(task) {
    setEditingId(task.id);
    setFormData({
      task_code: task.task_code || "",
      accreditation_body: task.accreditation_body || "IB",
      standard_area: task.standard_area || "",
      requirement: task.requirement || "",
      evidence_link: task.evidence_link || "",
      owner: task.owner || "",
      due_date: task.due_date || "",
      review_date: task.review_date || "",
      risk_level: task.risk_level || "Medium",
      status: task.status || "Open",
      finding: task.finding || "",
      action_plan: task.action_plan || "",
      completed_date: task.completed_date || "",
      remarks: task.remarks || "",
    });
    setPageMode("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(taskId) {
    if (!window.confirm("Are you sure you want to delete this compliance task?")) return;
    try {
      await API.delete(`/compliance/${taskId}`);
      setMessage("Compliance task deleted successfully.");
      await loadTasks();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete compliance task."));
    }
  }

  function handleCancel() {
    setEditingId(null);
    setFormData(emptyTaskForm);
    setMessage("");
    setPageMode("list");
  }

  const filteredTasks = tasks.filter((task) => {
    const matchBody = bodyFilter ? task.accreditation_body === bodyFilter : true;
    const matchRisk = riskFilter ? task.risk_level === riskFilter : true;
    const matchStatus = statusFilter ? task.status === statusFilter : true;
    const fullText = `${task.task_code} ${task.accreditation_body} ${task.standard_area} ${task.requirement} ${task.owner} ${task.status}`.toLowerCase();
    return matchBody && matchRisk && matchStatus && fullText.includes(searchText.toLowerCase());
  });

  const openCount = useMemo(() => tasks.filter((task) => ["Open", "In Progress", "Evidence Ready"].includes(task.status)).length, [tasks]);
  const highRiskCount = useMemo(() => tasks.filter((task) => ["High", "Critical"].includes(task.risk_level)).length, [tasks]);
  const completedCount = useMemo(() => tasks.filter((task) => task.status === "Completed").length, [tasks]);

  const form = (
    <section className="form-panel">
      <div className="panel-header"><div><h3>{editingId ? "Edit Compliance Task" : "Add Compliance Task"}</h3><p>Track audit evidence, owners, findings, due dates, and accreditation readiness.</p></div></div>
      <form className="classic-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-field"><label>Task Code</label><input name="task_code" value={formData.task_code} onChange={handleChange} placeholder="Auto generated if blank" /></div>
          <div className="form-field"><label>Accreditation Body</label><select name="accreditation_body" value={formData.accreditation_body} onChange={handleChange}>{accreditationBodies.map((body) => <option key={body} value={body}>{body}</option>)}</select></div>
          <div className="form-field"><label>Standard Area *</label><input name="standard_area" value={formData.standard_area} onChange={handleChange} required /></div>
          <div className="form-field"><label>Owner</label><input name="owner" value={formData.owner} onChange={handleChange} /></div>
          <div className="form-field"><label>Due Date</label><input type="date" name="due_date" value={formData.due_date} onChange={handleChange} /></div>
          <div className="form-field"><label>Review Date</label><input type="date" name="review_date" value={formData.review_date} onChange={handleChange} /></div>
          <div className="form-field"><label>Risk Level</label><select name="risk_level" value={formData.risk_level} onChange={handleChange}>{riskLevels.map((risk) => <option key={risk} value={risk}>{risk}</option>)}</select></div>
          <div className="form-field"><label>Status</label><select name="status" value={formData.status} onChange={handleChange}>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
          <div className="form-field"><label>Completed Date</label><input type="date" name="completed_date" value={formData.completed_date} onChange={handleChange} /></div>
          <div className="form-field"><label>Evidence Link</label><input name="evidence_link" value={formData.evidence_link} onChange={handleChange} placeholder="https://..." /></div>
          <div className="form-field span-2"><label>Requirement *</label><textarea name="requirement" value={formData.requirement} onChange={handleChange} rows="3" required /></div>
          <div className="form-field span-2"><label>Finding</label><textarea name="finding" value={formData.finding} onChange={handleChange} rows="3" /></div>
          <div className="form-field span-2"><label>Action Plan</label><textarea name="action_plan" value={formData.action_plan} onChange={handleChange} rows="3" /></div>
          <div className="form-field span-2"><label>Remarks</label><textarea name="remarks" value={formData.remarks} onChange={handleChange} rows="3" /></div>
        </div>
        <div className="form-actions"><button type="submit" className="primary-button"><PlusCircle size={18} />{editingId ? "Update Task" : "Add Task"}</button><button type="button" className="light-button" onClick={handleCancel}>Cancel</button></div>
      </form>
    </section>
  );

  if (pageMode === "form") {
    return <div className="management-page"><section className="page-heading"><div><p className="eyebrow">Governance</p><h2>{editingId ? "Edit Compliance Task" : "Add Compliance Task"}</h2><p>Manage accreditation evidence, audit findings, and inspection readiness.</p></div><button type="button" className="light-button" onClick={handleCancel}>Back to Tasks</button></section>{message && <div className="toast-notification">{message}</div>}{form}</div>;
  }

  return (
    <div className="management-page">
      <section className="page-heading"><div><p className="eyebrow">Governance</p><h2>Compliance & Accreditation</h2><p>Track standards, owners, evidence, findings, risks, and action plans.</p></div><div className="module-header-actions"><button type="button" className="secondary-button" onClick={loadTasks}><RefreshCcw size={17} />Refresh</button><button type="button" className="primary-button" onClick={handleAddTask}><PlusCircle size={18} />Add Task</button></div></section>
      <section className="summary-strip report-summary-grid"><div className="summary-card"><ClipboardCheck size={22} /><div><span>Total Tasks</span><strong>{tasks.length}</strong></div></div><div className="summary-card warning"><AlertTriangle size={22} /><div><span>Open Work</span><strong>{openCount}</strong></div></div><div className="summary-card warning"><AlertTriangle size={22} /><div><span>High Risk</span><strong>{highRiskCount}</strong></div></div><div className="summary-card"><CheckCircle size={22} /><div><span>Completed</span><strong>{completedCount}</strong></div></div></section>
      {message && <div className="toast-notification">{message}</div>}
      <section className="table-panel module-filter-panel"><div className="filter-row sis-filter-row"><div className="form-field"><label>Body</label><select value={bodyFilter} onChange={(event) => setBodyFilter(event.target.value)}><option value="">All Bodies</option>{accreditationBodies.map((body) => <option key={body} value={body}>{body}</option>)}</select></div><div className="form-field"><label>Risk</label><select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}><option value="">All Risk</option>{riskLevels.map((risk) => <option key={risk} value={risk}>{risk}</option>)}</select></div><div className="form-field"><label>Status</label><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All Status</option>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></div><button type="button" className="light-button" onClick={() => { setSearchText(""); setBodyFilter(""); setRiskFilter(""); setStatusFilter(""); }}>Clear Filters</button></div></section>
      <EnhancedRecordsTable
        data={filteredTasks}
        emptyText="No compliance tasks found."
        loading={loading}
        loadingText="Loading compliance tasks..."
        searchPlaceholder="Search standard, requirement, owner, status..."
        searchText={searchText}
        setSearchText={setSearchText}
        columns={[
          { key: "task_code", label: "Task Code", render: (task) => task.task_code || "-" },
          { key: "accreditation_body", label: "Body", render: (task) => task.accreditation_body || "-" },
          { key: "standard_area", label: "Standard", render: (task) => task.standard_area || "-" },
          { key: "owner", label: "Owner", render: (task) => task.owner || "-" },
          { key: "due_date", label: "Due Date", render: (task) => task.due_date || "-" },
          { key: "risk_level", label: "Risk", render: (task) => task.risk_level || "-" },
          { key: "evidence_link", label: "Evidence", render: (task) => task.evidence_link ? <a href={task.evidence_link} target="_blank" rel="noreferrer">Open</a> : "-", value: (task) => task.evidence_link || "" },
          { key: "status", label: "Status", render: (task) => <span className={task.status === "Deferred" ? "status danger" : "status active"}>{task.status || "Open"}</span>, value: (task) => task.status || "Open" },
          { key: "actions", label: "Actions", hideable: false, actions: false, render: (task) => <div className="action-buttons"><button type="button" className="edit-button" onClick={() => handleEdit(task)} title="Edit"><Edit size={15} /></button><button type="button" className="delete-button" onClick={() => handleDelete(task.id)} title="Delete"><Trash2 size={15} /></button></div>, value: () => "" },
        ]}
      />
    </div>
  );
}
