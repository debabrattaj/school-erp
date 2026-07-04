import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle, Edit, HeartPulse, PlusCircle, RefreshCcw, Trash2 } from "lucide-react";

import API from "../api";
import EnhancedRecordsTable from "../components/EnhancedRecordsTable";

const emptyCaseForm = {
  case_no: "",
  student_id: "",
  concern_type: "Academic Stress",
  risk_level: "Low",
  reported_by: "",
  counselor: "",
  session_date: "",
  next_follow_up_date: "",
  guardian_contacted: false,
  action_plan: "",
  confidentiality_level: "Restricted",
  status: "Open",
  outcome: "",
  remarks: "",
};

const concernTypes = ["Academic Stress", "Behavior", "Emotional Wellbeing", "Peer Relationship", "Attendance Concern", "Safeguarding", "Career Guidance", "Other"];
const riskLevels = ["Low", "Medium", "High", "Critical"];
const confidentialityLevels = ["Standard", "Restricted", "Sensitive"];
const statuses = ["Open", "In Progress", "Monitoring", "Closed", "Escalated"];

function getApiErrorMessage(error, fallbackMessage) {
  const detail = error.response?.data?.detail;
  if (Array.isArray(detail)) return detail.map((item) => `${Array.isArray(item.loc) ? item.loc.join(".") : "field"}: ${item.msg}`).join(" | ");
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") return detail.msg || JSON.stringify(detail);
  return fallbackMessage;
}

function getStudentLabel(student) {
  const fullName = `${student.first_name || ""} ${student.last_name || ""}`.trim();
  const classText = [student.class_name, student.section].filter(Boolean).join(" ");
  return `${student.admission_no || "No admission"} - ${fullName || "Unnamed student"}${classText ? ` (${classText})` : ""}`;
}

export default function Counseling() {
  const [cases, setCases] = useState([]);
  const [students, setStudents] = useState([]);
  const [formData, setFormData] = useState(emptyCaseForm);
  const [editingId, setEditingId] = useState(null);
  const [pageMode, setPageMode] = useState("list");
  const [searchText, setSearchText] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [concernFilter, setConcernFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadCases() {
    try {
      setLoading(true);
      setMessage("");
      const response = await API.get("/counseling/");
      setCases(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load counseling cases."));
    } finally {
      setLoading(false);
    }
  }

  async function loadStudents() {
    try {
      const response = await API.get("/students/");
      setStudents(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load students."));
    }
  }

  useEffect(() => {
    loadCases();
    loadStudents();
  }, []);

  function handleChange(event) {
    const { name, value, type, checked } = event.target;
    setFormData((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  }

  function buildPayload() {
    return {
      case_no: formData.case_no.trim(),
      student_id: Number(formData.student_id),
      concern_type: formData.concern_type,
      risk_level: formData.risk_level,
      reported_by: formData.reported_by.trim() || null,
      counselor: formData.counselor.trim() || null,
      session_date: formData.session_date || null,
      next_follow_up_date: formData.next_follow_up_date || null,
      guardian_contacted: Boolean(formData.guardian_contacted),
      action_plan: formData.action_plan.trim() || null,
      confidentiality_level: formData.confidentiality_level,
      status: formData.status,
      outcome: formData.outcome.trim() || null,
      remarks: formData.remarks.trim() || null,
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    try {
      const payload = buildPayload();
      if (!payload.student_id) {
        setMessage("Student is required.");
        return;
      }
      if (editingId) {
        await API.put(`/counseling/${editingId}`, payload);
        setMessage("Counseling case updated successfully.");
      } else {
        await API.post("/counseling/", payload);
        setMessage("Counseling case added successfully.");
      }
      setFormData(emptyCaseForm);
      setEditingId(null);
      setPageMode("list");
      await loadCases();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save counseling case."));
    }
  }

  function handleAddCase() {
    setEditingId(null);
    setFormData(emptyCaseForm);
    setMessage("");
    setPageMode("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEdit(item) {
    setEditingId(item.id);
    setFormData({
      case_no: item.case_no || "",
      student_id: item.student_id ? String(item.student_id) : "",
      concern_type: item.concern_type || "Academic Stress",
      risk_level: item.risk_level || "Low",
      reported_by: item.reported_by || "",
      counselor: item.counselor || "",
      session_date: item.session_date || "",
      next_follow_up_date: item.next_follow_up_date || "",
      guardian_contacted: Boolean(item.guardian_contacted),
      action_plan: item.action_plan || "",
      confidentiality_level: item.confidentiality_level || "Restricted",
      status: item.status || "Open",
      outcome: item.outcome || "",
      remarks: item.remarks || "",
    });
    setPageMode("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(caseId) {
    if (!window.confirm("Are you sure you want to delete this counseling case?")) return;
    try {
      await API.delete(`/counseling/${caseId}`);
      setMessage("Counseling case deleted successfully.");
      await loadCases();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete counseling case."));
    }
  }

  function handleCancel() {
    setEditingId(null);
    setFormData(emptyCaseForm);
    setMessage("");
    setPageMode("list");
  }

  const filteredCases = cases.filter((item) => {
    const matchRisk = riskFilter ? item.risk_level === riskFilter : true;
    const matchStatus = statusFilter ? item.status === statusFilter : true;
    const matchConcern = concernFilter ? item.concern_type === concernFilter : true;
    const fullText = `${item.case_no} ${item.student_name} ${item.admission_no} ${item.concern_type} ${item.risk_level} ${item.counselor} ${item.status}`.toLowerCase();
    return matchRisk && matchStatus && matchConcern && fullText.includes(searchText.toLowerCase());
  });

  const openCount = useMemo(() => cases.filter((item) => ["Open", "In Progress", "Monitoring", "Escalated"].includes(item.status)).length, [cases]);
  const highRiskCount = useMemo(() => cases.filter((item) => ["High", "Critical"].includes(item.risk_level)).length, [cases]);
  const closedCount = useMemo(() => cases.filter((item) => item.status === "Closed").length, [cases]);

  const form = (
    <section className="form-panel">
      <div className="panel-header"><div><h3>{editingId ? "Edit Counseling Case" : "Add Counseling Case"}</h3><p>Track wellbeing concerns, support plans, guardian contact, and follow-up.</p></div></div>
      <form className="classic-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-field"><label>Case No</label><input name="case_no" value={formData.case_no} onChange={handleChange} placeholder="Auto generated if blank" /></div>
          <div className="form-field span-2"><label>Student *</label><select name="student_id" value={formData.student_id} onChange={handleChange} required><option value="">Select Student</option>{students.map((student) => <option key={student.id} value={student.id}>{getStudentLabel(student)}</option>)}</select></div>
          <div className="form-field"><label>Concern Type</label><select name="concern_type" value={formData.concern_type} onChange={handleChange}>{concernTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></div>
          <div className="form-field"><label>Risk Level</label><select name="risk_level" value={formData.risk_level} onChange={handleChange}>{riskLevels.map((risk) => <option key={risk} value={risk}>{risk}</option>)}</select></div>
          <div className="form-field"><label>Reported By</label><input name="reported_by" value={formData.reported_by} onChange={handleChange} /></div>
          <div className="form-field"><label>Counselor</label><input name="counselor" value={formData.counselor} onChange={handleChange} /></div>
          <div className="form-field"><label>Session Date</label><input type="date" name="session_date" value={formData.session_date} onChange={handleChange} /></div>
          <div className="form-field"><label>Next Follow Up</label><input type="date" name="next_follow_up_date" value={formData.next_follow_up_date} onChange={handleChange} /></div>
          <div className="form-field"><label>Confidentiality</label><select name="confidentiality_level" value={formData.confidentiality_level} onChange={handleChange}>{confidentialityLevels.map((level) => <option key={level} value={level}>{level}</option>)}</select></div>
          <div className="form-field"><label>Status</label><select name="status" value={formData.status} onChange={handleChange}>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
          <div className="form-field"><label>Guardian Contacted</label><label className="switch-row"><input type="checkbox" name="guardian_contacted" checked={Boolean(formData.guardian_contacted)} onChange={handleChange} /><span>{formData.guardian_contacted ? "Yes" : "No"}</span></label></div>
          <div className="form-field span-2"><label>Action Plan</label><textarea name="action_plan" value={formData.action_plan} onChange={handleChange} rows="3" /></div>
          <div className="form-field span-2"><label>Outcome</label><textarea name="outcome" value={formData.outcome} onChange={handleChange} rows="3" /></div>
          <div className="form-field span-2"><label>Remarks</label><textarea name="remarks" value={formData.remarks} onChange={handleChange} rows="3" /></div>
        </div>
        <div className="form-actions"><button type="submit" className="primary-button"><PlusCircle size={18} />{editingId ? "Update Case" : "Add Case"}</button><button type="button" className="light-button" onClick={handleCancel}>Cancel</button></div>
      </form>
    </section>
  );

  if (pageMode === "form") {
    return <div className="management-page"><section className="page-heading"><div><p className="eyebrow">Wellbeing</p><h2>{editingId ? "Edit Counseling Case" : "Add Counseling Case"}</h2><p>Manage student wellbeing cases, support plans, and follow-up.</p></div><button type="button" className="light-button" onClick={handleCancel}>Back to Cases</button></section>{message && <div className="message-box">{message}</div>}{form}</div>;
  }

  return (
    <div className="management-page">
      <section className="page-heading"><div><p className="eyebrow">Wellbeing</p><h2>Counseling & Wellbeing</h2><p>Track student support cases, risk levels, action plans, and follow-ups.</p></div><div className="module-header-actions"><button type="button" className="secondary-button" onClick={loadCases}><RefreshCcw size={17} />Refresh</button><button type="button" className="primary-button" onClick={handleAddCase}><PlusCircle size={18} />Add Case</button></div></section>
      <section className="summary-strip report-summary-grid"><div className="summary-card"><HeartPulse size={22} /><div><span>Total Cases</span><strong>{cases.length}</strong></div></div><div className="summary-card warning"><AlertTriangle size={22} /><div><span>Open Support</span><strong>{openCount}</strong></div></div><div className="summary-card warning"><AlertTriangle size={22} /><div><span>High Risk</span><strong>{highRiskCount}</strong></div></div><div className="summary-card"><CheckCircle size={22} /><div><span>Closed</span><strong>{closedCount}</strong></div></div></section>
      {message && <div className="message-box">{message}</div>}
      <section className="table-panel module-filter-panel"><div className="filter-row sis-filter-row"><div className="form-field"><label>Concern</label><select value={concernFilter} onChange={(event) => setConcernFilter(event.target.value)}><option value="">All Concerns</option>{concernTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></div><div className="form-field"><label>Risk</label><select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}><option value="">All Risk</option>{riskLevels.map((risk) => <option key={risk} value={risk}>{risk}</option>)}</select></div><div className="form-field"><label>Status</label><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All Status</option>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></div><button type="button" className="light-button" onClick={() => { setSearchText(""); setConcernFilter(""); setRiskFilter(""); setStatusFilter(""); }}>Clear Filters</button></div></section>
      <EnhancedRecordsTable
        data={filteredCases}
        emptyText="No counseling cases found."
        loading={loading}
        loadingText="Loading counseling cases..."
        searchPlaceholder="Search case, student, concern, counselor..."
        searchText={searchText}
        setSearchText={setSearchText}
        columns={[
          { key: "case_no", label: "Case No", render: (item) => item.case_no || "-" },
          { key: "student_name", label: "Student", render: (item) => item.student_name || "-" },
          { key: "concern_type", label: "Concern", render: (item) => item.concern_type || "-" },
          { key: "risk_level", label: "Risk", render: (item) => item.risk_level || "-" },
          { key: "counselor", label: "Counselor", render: (item) => item.counselor || "-" },
          { key: "session_date", label: "Session", render: (item) => item.session_date || "-" },
          { key: "next_follow_up_date", label: "Follow Up", render: (item) => item.next_follow_up_date || "-" },
          { key: "guardian_contacted", label: "Guardian", render: (item) => item.guardian_contacted ? "Contacted" : "Pending", value: (item) => item.guardian_contacted ? "Contacted" : "Pending" },
          { key: "status", label: "Status", render: (item) => <span className={item.status === "Closed" ? "status danger" : "status active"}>{item.status || "Open"}</span>, value: (item) => item.status || "Open" },
          { key: "actions", label: "Actions", hideable: false, actions: false, render: (item) => <div className="action-buttons"><button type="button" className="edit-button" onClick={() => handleEdit(item)} title="Edit"><Edit size={15} /></button><button type="button" className="delete-button" onClick={() => handleDelete(item.id)} title="Delete"><Trash2 size={15} /></button></div>, value: () => "" },
        ]}
      />
    </div>
  );
}
