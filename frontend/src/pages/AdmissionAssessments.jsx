import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle,
  ClipboardCheck,
  Edit,
  PlusCircle,
  RefreshCcw,
  Trash2,
  UsersRound,
} from "lucide-react";

import API from "../api";
import EnhancedRecordsTable from "../components/EnhancedRecordsTable";

const emptyAssessmentForm = {
  inquiry_id: "",
  assessment_type: "Entrance Test",
  scheduled_date: "",
  scheduled_time: "",
  mode: "On Campus",
  panel_members: "",
  location: "",
  status: "Scheduled",
  score: "",
  outcome: "Pending",
  next_follow_up_date: "",
  remarks: "",
};

const assessmentTypes = [
  "Entrance Test",
  "Student Interview",
  "Parent Interview",
  "Portfolio Review",
  "Language Assessment",
  "Counselor Meeting",
];

const modeOptions = ["On Campus", "Online", "Hybrid", "Phone"];
const statusOptions = ["Scheduled", "Completed", "Rescheduled", "Cancelled", "No Show"];
const outcomeOptions = ["Pending", "Recommended", "Waitlisted", "Not Recommended", "Offer Sent"];

function getApiErrorMessage(error, fallbackMessage) {
  const detail = error.response?.data?.detail;

  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        const field = Array.isArray(item.loc) ? item.loc.join(".") : "field";
        return `${field}: ${item.msg}`;
      })
      .join(" | ");
  }

  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") return detail.msg || JSON.stringify(detail);

  return fallbackMessage;
}

function getInquiryLabel(inquiry) {
  return `${inquiry.inquiry_no || "No inquiry"} - ${inquiry.student_name || "Unnamed"}${
    inquiry.grade_applying ? ` (${inquiry.grade_applying})` : ""
  }`;
}

export default function AdmissionAssessments() {
  const [assessments, setAssessments] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [formData, setFormData] = useState(emptyAssessmentForm);
  const [editingId, setEditingId] = useState(null);
  const [pageMode, setPageMode] = useState("list");
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return undefined;

    const timeoutId = window.setTimeout(() => {
      setMessage("");
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  async function loadAssessments() {
    try {
      setLoading(true);
      setMessage("");
      const response = await API.get("/admission-assessments/");
      setAssessments(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load admission assessments."));
    } finally {
      setLoading(false);
    }
  }

  async function loadInquiries() {
    try {
      const response = await API.get("/admissions/");
      setInquiries(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load admission inquiries."));
    }
  }

  useEffect(() => {
    loadAssessments();
    loadInquiries();
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  }

  function buildPayload() {
    return {
      inquiry_id: Number(formData.inquiry_id),
      assessment_type: formData.assessment_type,
      scheduled_date: formData.scheduled_date,
      scheduled_time: formData.scheduled_time || null,
      mode: formData.mode || "On Campus",
      panel_members: formData.panel_members.trim() || null,
      location: formData.location.trim() || null,
      status: formData.status || "Scheduled",
      score: formData.score === "" ? null : Number(formData.score),
      outcome: formData.outcome || "Pending",
      next_follow_up_date: formData.next_follow_up_date || null,
      remarks: formData.remarks.trim() || null,
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    try {
      const payload = buildPayload();

      if (!payload.inquiry_id) {
        setMessage("Admission inquiry is required.");
        return;
      }

      if (!payload.scheduled_date) {
        setMessage("Scheduled date is required.");
        return;
      }

      if (editingId) {
        await API.put(`/admission-assessments/${editingId}`, payload);
        setMessage("Admission assessment updated successfully.");
      } else {
        await API.post("/admission-assessments/", payload);
        setMessage("Admission assessment added successfully.");
      }

      setFormData(emptyAssessmentForm);
      setEditingId(null);
      setPageMode("list");
      await loadAssessments();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save admission assessment."));
    }
  }

  function handleAddAssessment() {
    setEditingId(null);
    setFormData(emptyAssessmentForm);
    setMessage("");
    setPageMode("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEdit(assessment) {
    setEditingId(assessment.id);
    setFormData({
      inquiry_id: assessment.inquiry_id ? String(assessment.inquiry_id) : "",
      assessment_type: assessment.assessment_type || "Entrance Test",
      scheduled_date: assessment.scheduled_date || "",
      scheduled_time: assessment.scheduled_time || "",
      mode: assessment.mode || "On Campus",
      panel_members: assessment.panel_members || "",
      location: assessment.location || "",
      status: assessment.status || "Scheduled",
      score: assessment.score ?? "",
      outcome: assessment.outcome || "Pending",
      next_follow_up_date: assessment.next_follow_up_date || "",
      remarks: assessment.remarks || "",
    });
    setMessage("");
    setPageMode("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(assessmentId) {
    if (!window.confirm("Are you sure you want to delete this assessment schedule?")) {
      return;
    }

    try {
      await API.delete(`/admission-assessments/${assessmentId}`);
      setMessage("Admission assessment deleted successfully.");
      await loadAssessments();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete admission assessment."));
    }
  }

  function handleCancel() {
    setEditingId(null);
    setFormData(emptyAssessmentForm);
    setMessage("");
    setPageMode("list");
  }

  const filteredAssessments = assessments.filter((assessment) => {
    const matchStatus = statusFilter ? assessment.status === statusFilter : true;
    const matchOutcome = outcomeFilter ? assessment.outcome === outcomeFilter : true;
    const fullText = `
      ${assessment.inquiry_no}
      ${assessment.student_name}
      ${assessment.grade_applying}
      ${assessment.guardian_name}
      ${assessment.guardian_phone}
      ${assessment.assessment_type}
      ${assessment.mode}
      ${assessment.panel_members}
      ${assessment.location}
      ${assessment.status}
      ${assessment.outcome}
    `.toLowerCase();

    return matchStatus && matchOutcome && fullText.includes(searchText.toLowerCase());
  });

  const scheduledCount = useMemo(
    () => assessments.filter((assessment) => assessment.status === "Scheduled").length,
    [assessments]
  );
  const completedCount = useMemo(
    () => assessments.filter((assessment) => assessment.status === "Completed").length,
    [assessments]
  );
  const recommendedCount = useMemo(
    () => assessments.filter((assessment) => assessment.outcome === "Recommended").length,
    [assessments]
  );

  const assessmentForm = (
    <section className="form-panel">
      <div className="panel-header">
        <div>
          <h3>{editingId ? "Edit Assessment Schedule" : "Add Assessment Schedule"}</h3>
          <p>Schedule entrance tests, interviews, reviews, and counselor meetings.</p>
        </div>
      </div>

      <form className="classic-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-field span-2">
            <label>Admission Inquiry *</label>
            <select
              name="inquiry_id"
              value={formData.inquiry_id}
              onChange={handleChange}
              required
            >
              <option value="">Select Inquiry</option>
              {inquiries.map((inquiry) => (
                <option key={inquiry.id} value={inquiry.id}>
                  {getInquiryLabel(inquiry)}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Assessment Type *</label>
            <select
              name="assessment_type"
              value={formData.assessment_type}
              onChange={handleChange}
              required
            >
              {assessmentTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Mode</label>
            <select name="mode" value={formData.mode} onChange={handleChange}>
              {modeOptions.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Scheduled Date *</label>
            <input
              type="date"
              name="scheduled_date"
              value={formData.scheduled_date}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-field">
            <label>Scheduled Time</label>
            <input
              type="time"
              name="scheduled_time"
              value={formData.scheduled_time}
              onChange={handleChange}
            />
          </div>

          <div className="form-field">
            <label>Location / Link</label>
            <input
              type="text"
              name="location"
              value={formData.location}
              onChange={handleChange}
              placeholder="Room, campus, or meeting link"
            />
          </div>

          <div className="form-field">
            <label>Panel Members</label>
            <input
              type="text"
              name="panel_members"
              value={formData.panel_members}
              onChange={handleChange}
              placeholder="Counselor, HOD, principal..."
            />
          </div>

          <div className="form-field">
            <label>Status</label>
            <select name="status" value={formData.status} onChange={handleChange}>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Outcome</label>
            <select name="outcome" value={formData.outcome} onChange={handleChange}>
              {outcomeOptions.map((outcome) => (
                <option key={outcome} value={outcome}>
                  {outcome}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Score</label>
            <input
              type="number"
              name="score"
              min="0"
              max="100"
              value={formData.score}
              onChange={handleChange}
              placeholder="0 - 100"
            />
          </div>

          <div className="form-field">
            <label>Next Follow Up</label>
            <input
              type="date"
              name="next_follow_up_date"
              value={formData.next_follow_up_date}
              onChange={handleChange}
            />
          </div>

          <div className="form-field span-2">
            <label>Remarks</label>
            <textarea
              name="remarks"
              value={formData.remarks}
              onChange={handleChange}
              rows="3"
              placeholder="Assessment notes, parent observations, decision comments..."
            />
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="primary-button">
            <PlusCircle size={18} />
            {editingId ? "Update Schedule" : "Add Schedule"}
          </button>
          <button type="button" className="light-button" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  );

  if (pageMode === "form") {
    return (
      <div className="management-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Admissions</p>
            <h2>{editingId ? "Edit Assessment Schedule" : "Add Assessment Schedule"}</h2>
            <p>Coordinate admission tests, interviews, outcomes, and follow-ups.</p>
          </div>

          <button type="button" className="light-button" onClick={handleCancel}>
            Back to Assessment Records
          </button>
        </section>

        {message && <div className="toast-notification">{message}</div>}
        {assessmentForm}
      </div>
    );
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Admissions</p>
          <h2>Assessment & Interviews</h2>
          <p>Schedule entrance tests, interviews, reviews, and admission decisions.</p>
        </div>

        <div className="module-header-actions">
          <button type="button" className="secondary-button" onClick={loadAssessments}>
            <RefreshCcw size={17} />
            Refresh
          </button>
          <button type="button" className="primary-button" onClick={handleAddAssessment}>
            <PlusCircle size={18} />
            Add Schedule
          </button>
        </div>
      </section>

      <section className="summary-strip report-summary-grid">
        <div className="summary-card">
          <ClipboardCheck size={22} />
          <div>
            <span>Total Schedules</span>
            <strong>{assessments.length}</strong>
          </div>
        </div>
        <div className="summary-card">
          <CalendarClock size={22} />
          <div>
            <span>Scheduled</span>
            <strong>{scheduledCount}</strong>
          </div>
        </div>
        <div className="summary-card">
          <CheckCircle size={22} />
          <div>
            <span>Completed</span>
            <strong>{completedCount}</strong>
          </div>
        </div>
        <div className="summary-card warning">
          <UsersRound size={22} />
          <div>
            <span>Recommended</span>
            <strong>{recommendedCount}</strong>
          </div>
        </div>
      </section>

      {message && <div className="toast-notification">{message}</div>}

      <section className="table-panel module-filter-panel">
        <div className="filter-row sis-filter-row">
          <div className="form-field">
            <label>Status</label>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All Status</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Outcome</label>
            <select value={outcomeFilter} onChange={(event) => setOutcomeFilter(event.target.value)}>
              <option value="">All Outcomes</option>
              {outcomeOptions.map((outcome) => (
                <option key={outcome} value={outcome}>
                  {outcome}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="light-button"
            onClick={() => {
              setSearchText("");
              setStatusFilter("");
              setOutcomeFilter("");
            }}
          >
            Clear Filters
          </button>
        </div>
      </section>

      <EnhancedRecordsTable
        data={filteredAssessments}
        emptyText="No admission assessment schedules found."
        loading={loading}
        loadingText="Loading admission assessments..."
        searchPlaceholder="Search student, inquiry, type, panel, outcome..."
        searchText={searchText}
        setSearchText={setSearchText}
        columns={[
          { key: "inquiry_no", label: "Inquiry No", render: (assessment) => assessment.inquiry_no || "-" },
          { key: "student_name", label: "Student", render: (assessment) => assessment.student_name || "-" },
          { key: "grade_applying", label: "Grade", render: (assessment) => assessment.grade_applying || "-" },
          { key: "assessment_type", label: "Type", render: (assessment) => assessment.assessment_type || "-" },
          { key: "scheduled_date", label: "Date", render: (assessment) => assessment.scheduled_date || "-" },
          { key: "scheduled_time", label: "Time", render: (assessment) => assessment.scheduled_time || "-" },
          { key: "mode", label: "Mode", render: (assessment) => assessment.mode || "-" },
          { key: "panel_members", label: "Panel", render: (assessment) => assessment.panel_members || "-" },
          {
            key: "status",
            label: "Status",
            render: (assessment) => (
              <span className={["Cancelled", "No Show"].includes(assessment.status) ? "status danger" : "status active"}>
                {assessment.status || "Scheduled"}
              </span>
            ),
            value: (assessment) => assessment.status || "Scheduled",
          },
          {
            key: "outcome",
            label: "Outcome",
            render: (assessment) => assessment.outcome || "Pending",
          },
          { key: "next_follow_up_date", label: "Follow Up", render: (assessment) => assessment.next_follow_up_date || "-" },
          {
            key: "actions",
            label: "Actions",
            hideable: false,
            actions: false,
            render: (assessment) => (
              <div className="action-buttons">
                <button type="button" className="edit-button" onClick={() => handleEdit(assessment)} title="Edit">
                  <Edit size={15} />
                </button>
                <button
                  type="button"
                  className="delete-button"
                  onClick={() => handleDelete(assessment.id)}
                  title="Delete"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ),
            value: () => "",
          },
        ]}
      />
    </div>
  );
}
