import { useEffect, useMemo, useState } from "react";
import { todayLocalDate } from "../utils/date";
import {
  ArrowLeft,
  CheckCircle,
  ClipboardList,
  Edit,
  PlusCircle,
  Trash2,
  UserPlus,
  MessageCircle,
  Settings,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

import API from "../api";
import EnhancedRecordsTable from "../components/EnhancedRecordsTable";

const emptyAdmissionForm = {
  inquiry_no: "",
  student_name: "",
  grade_applying: "",
  academic_year: "2026-27",
  guardian_name: "",
  guardian_phone: "",
  guardian_email: "",
  source: "Website",
  stage: "Inquiry",
  follow_up_date: "",
  assigned_to: "",
  notes: "",
};

const emptyFollowUpForm = {
  activity_date: todayLocalDate(),
  activity_type: "Call",
  notes: "",
  next_action: "",
  next_follow_up_date: "",
  owner: "",
  outcome: "Open",
};

const emptyConvertForm = {
  admission_no: "",
  first_name: "",
  last_name: "",
  class_name: "",
  section: "",
  admission_date: todayLocalDate(),
  student_status: "Active",
  guardian_name: "",
  guardian_phone: "",
  guardian_email: "",
};

const fallbackStageOptions = [
  "Inquiry",
  "Contacted",
  "Visit Scheduled",
  "Assessment",
  "Offered",
  "Enrolled",
  "Lost",
];

const activityTypeOptions = [
  "Call",
  "Email",
  "Campus Visit",
  "Assessment",
  "Document Review",
  "Meeting",
  "Other",
];

const sourceOptions = [
  "Website",
  "Referral",
  "Walk-in",
  "Education Fair",
  "Social Media",
  "Agency",
  "Other",
];

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

export default function Admissions() {
  const [inquiries, setInquiries] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [formData, setFormData] = useState(emptyAdmissionForm);
  const [editingId, setEditingId] = useState(null);
  const [selectedInquiry, setSelectedInquiry] = useState(null);
  const [followUps, setFollowUps] = useState([]);
  const [followUpForm, setFollowUpForm] = useState(emptyFollowUpForm);
  const [convertForm, setConvertForm] = useState(emptyConvertForm);
  const [pageMode, setPageMode] = useState("list");
  const [searchText, setSearchText] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [stages, setStages] = useState([]);
  const [showStageManager, setShowStageManager] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [stageEdits, setStageEdits] = useState({});

  const stageOptions = stages.length ? stages.map((stage) => stage.name) : fallbackStageOptions;

  useEffect(() => {
    if (!message) return undefined;

    const timeoutId = window.setTimeout(() => {
      setMessage("");
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  async function loadInquiries() {
    try {
      setLoading(true);
      setMessage("");
      const response = await API.get("/admissions/");
      setInquiries(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load admission inquiries."));
    } finally {
      setLoading(false);
    }
  }

  async function loadAcademicYears() {
    try {
      const response = await API.get("/academic-years/");
      setAcademicYears(response.data || []);
    } catch (error) {
      console.error(error);
    }
  }

  async function loadStages() {
    try {
      const response = await API.get("/admission-workflow-stages/");
      setStages(response.data || []);
    } catch (error) {
      console.error(error);
    }
  }

  useEffect(() => {
    loadInquiries();
    loadAcademicYears();
    loadStages();
  }, []);

  async function addStage() {
    const name = newStageName.trim();
    if (!name) return;
    try {
      await API.post("/admission-workflow-stages/", { name, sort_order: stages.length + 1 });
      setNewStageName("");
      await loadStages();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to add stage."));
    }
  }

  async function renameStage(stage) {
    const nextName = (stageEdits[stage.id] ?? stage.name).trim();
    if (!nextName || nextName === stage.name) return;
    try {
      await API.put(`/admission-workflow-stages/${stage.id}`, { name: nextName });
      await Promise.all([loadStages(), loadInquiries()]);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to rename stage."));
    }
  }

  async function moveStage(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= stages.length) return;
    const a = stages[index];
    const b = stages[target];
    try {
      await Promise.all([
        API.put(`/admission-workflow-stages/${a.id}`, { sort_order: b.sort_order }),
        API.put(`/admission-workflow-stages/${b.id}`, { sort_order: a.sort_order }),
      ]);
      await loadStages();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to reorder stages."));
    }
  }

  async function deleteStage(stage) {
    if (!window.confirm(`Delete stage "${stage.name}"?`)) return;
    try {
      await API.delete(`/admission-workflow-stages/${stage.id}`);
      await loadStages();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete stage."));
    }
  }

  const academicYearOptions = useMemo(() => {
    const names = academicYears.map((year) => year.name);
    if (formData.academic_year && !names.includes(formData.academic_year)) {
      return [formData.academic_year, ...names];
    }
    return names;
  }, [academicYears, formData.academic_year]);

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  }

  function handleFollowUpChange(event) {
    const { name, value } = event.target;
    setFollowUpForm((current) => ({ ...current, [name]: value }));
  }

  function handleConvertChange(event) {
    const { name, value } = event.target;
    setConvertForm((current) => ({ ...current, [name]: value }));
  }

  function splitStudentName(fullName = "") {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    return {
      first_name: parts[0] || "",
      last_name: parts.slice(1).join(" "),
    };
  }

  async function loadFollowUps(inquiryId) {
    const response = await API.get(`/admissions/${inquiryId}/follow-ups`);
    setFollowUps(response.data || []);
  }

  async function openFollowUps(inquiry) {
    try {
      setSelectedInquiry(inquiry);
      setFollowUpForm({
        ...emptyFollowUpForm,
        owner: inquiry.assigned_to || "",
        next_follow_up_date: inquiry.follow_up_date || "",
      });
      setMessage("");
      setPageMode("followups");
      await loadFollowUps(inquiry.id);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load follow-up history."));
    }
  }

  async function handleFollowUpSubmit(event) {
    event.preventDefault();
    setMessage("");

    if (!selectedInquiry?.id) return;

    try {
      if (!followUpForm.notes.trim()) {
        setMessage("Follow-up notes are required.");
        return;
      }

      await API.post(`/admissions/${selectedInquiry.id}/follow-ups`, {
        inquiry_id: selectedInquiry.id,
        activity_date: followUpForm.activity_date,
        activity_type: followUpForm.activity_type,
        notes: followUpForm.notes.trim(),
        next_action: followUpForm.next_action.trim() || null,
        next_follow_up_date: followUpForm.next_follow_up_date || null,
        owner: followUpForm.owner.trim() || null,
        outcome: followUpForm.outcome || null,
      });

      setFollowUpForm({
        ...emptyFollowUpForm,
        owner: followUpForm.owner,
        next_follow_up_date: followUpForm.next_follow_up_date,
      });
      setMessage("Follow-up added successfully.");
      await Promise.all([loadFollowUps(selectedInquiry.id), loadInquiries()]);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save follow-up."));
    }
  }

  async function getNextAdmissionNo() {
    const response = await API.get("/admissions/next-admission-no");
    return response.data?.admission_no || "";
  }

  async function openConvertInquiry(inquiry) {
    const splitName = splitStudentName(inquiry.student_name);
    let nextAdmissionNo = "";

    try {
      nextAdmissionNo = await getNextAdmissionNo();
    } catch (error) {
      console.error("Unable to generate next admission number", error);
    }

    setSelectedInquiry(inquiry);
    setConvertForm({
      ...emptyConvertForm,
      admission_no: nextAdmissionNo,
      first_name: splitName.first_name,
      last_name: splitName.last_name,
      class_name: inquiry.grade_applying || "",
      guardian_name: inquiry.guardian_name || "",
      guardian_phone: inquiry.guardian_phone || "",
      guardian_email: inquiry.guardian_email || "",
    });
    setMessage("");
    setPageMode("convert");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleConvertSubmit(event) {
    event.preventDefault();
    setMessage("");

    if (!selectedInquiry?.id) return;

    try {
      if (!convertForm.admission_no.trim() || !convertForm.first_name.trim()) {
        setMessage("Admission number and first name are required.");
        return;
      }

      await API.post(`/admissions/${selectedInquiry.id}/convert`, {
        admission_no: convertForm.admission_no.trim(),
        first_name: convertForm.first_name.trim(),
        last_name: convertForm.last_name.trim() || null,
        class_name: convertForm.class_name.trim() || null,
        section: convertForm.section.trim() || null,
        admission_date: convertForm.admission_date || null,
        student_status: convertForm.student_status || "Active",
        guardian_name: convertForm.guardian_name.trim() || null,
        guardian_phone: convertForm.guardian_phone.trim() || null,
        guardian_email: convertForm.guardian_email.trim() || null,
      });

      setMessage("Inquiry converted to student successfully.");
      setSelectedInquiry(null);
      setConvertForm(emptyConvertForm);
      setPageMode("list");
      await loadInquiries();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to convert inquiry."));
    }
  }

  function buildPayload() {
    return {
      inquiry_no: formData.inquiry_no.trim(),
      student_name: formData.student_name.trim(),
      grade_applying: formData.grade_applying.trim(),
      academic_year: formData.academic_year.trim(),
      guardian_name: formData.guardian_name.trim(),
      guardian_phone: formData.guardian_phone.trim(),
      guardian_email: formData.guardian_email.trim() || null,
      source: formData.source || "Website",
      stage: formData.stage || "Inquiry",
      follow_up_date: formData.follow_up_date || null,
      assigned_to: formData.assigned_to.trim() || null,
      notes: formData.notes.trim() || null,
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    try {
      const payload = buildPayload();

      if (!payload.student_name || !payload.grade_applying || !payload.academic_year) {
        setMessage("Student name, grade, and academic year are required.");
        return;
      }

      if (!payload.guardian_name || !payload.guardian_phone) {
        setMessage("Guardian name and phone are required.");
        return;
      }

      if (editingId) {
        await API.put(`/admissions/${editingId}`, payload);
        setMessage("Admission inquiry updated successfully.");
      } else {
        await API.post("/admissions/", payload);
        setMessage("Admission inquiry added successfully.");
      }

      setFormData(emptyAdmissionForm);
      setEditingId(null);
      setPageMode("list");
      await loadInquiries();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save admission inquiry."));
    }
  }

  function handleAddInquiry() {
    setEditingId(null);
    setFormData(emptyAdmissionForm);
    setMessage("");
    setPageMode("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEdit(inquiry) {
    setEditingId(inquiry.id);
    setFormData({
      inquiry_no: inquiry.inquiry_no || "",
      student_name: inquiry.student_name || "",
      grade_applying: inquiry.grade_applying || "",
      academic_year: inquiry.academic_year || "2026-27",
      guardian_name: inquiry.guardian_name || "",
      guardian_phone: inquiry.guardian_phone || "",
      guardian_email: inquiry.guardian_email || "",
      source: inquiry.source || "Website",
      stage: inquiry.stage || "Inquiry",
      follow_up_date: inquiry.follow_up_date || "",
      assigned_to: inquiry.assigned_to || "",
      notes: inquiry.notes || "",
    });
    setMessage("");
    setPageMode("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(inquiryId) {
    if (!window.confirm("Are you sure you want to delete this admission inquiry?")) {
      return;
    }

    try {
      await API.delete(`/admissions/${inquiryId}`);
      setMessage("Admission inquiry deleted successfully.");
      await loadInquiries();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete admission inquiry."));
    }
  }

  function handleCancel() {
    setEditingId(null);
    setFormData(emptyAdmissionForm);
    setMessage("");
    setPageMode("list");
  }

  const filteredInquiries = inquiries.filter((inquiry) => {
    const matchStage = stageFilter ? inquiry.stage === stageFilter : true;
    const fullText = `
      ${inquiry.inquiry_no}
      ${inquiry.student_name}
      ${inquiry.grade_applying}
      ${inquiry.guardian_name}
      ${inquiry.guardian_phone}
      ${inquiry.guardian_email}
      ${inquiry.source}
      ${inquiry.stage}
      ${inquiry.assigned_to}
    `.toLowerCase();

    return matchStage && fullText.includes(searchText.toLowerCase());
  });

  const admittedCount = useMemo(
    () => inquiries.filter((inquiry) => ["Enrolled", "Admitted"].includes(inquiry.stage)).length,
    [inquiries]
  );
  const activePipelineCount = useMemo(
    () =>
      inquiries.filter(
        (inquiry) => !["Enrolled", "Admitted", "Lost", "Rejected", "Withdrawn"].includes(inquiry.stage)
      ).length,
    [inquiries]
  );
  const followUpCount = useMemo(
    () => inquiries.filter((inquiry) => inquiry.follow_up_date).length,
    [inquiries]
  );

  const admissionForm = (
    <section className="form-panel">
      <div className="panel-header">
        <div>
          <h3>{editingId ? "Edit Admission Inquiry" : "Add Admission Inquiry"}</h3>
          <p>Track admissions from first inquiry through enrollment.</p>
        </div>
      </div>

      <form className="classic-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-field">
            <label>Inquiry No</label>
            <input
              type="text"
              name="inquiry_no"
              value={formData.inquiry_no}
              onChange={handleChange}
              placeholder="Auto generated if blank"
            />
          </div>

          <div className="form-field">
            <label>Student Name *</label>
            <input
              type="text"
              name="student_name"
              value={formData.student_name}
              onChange={handleChange}
              placeholder="Student full name"
              required
            />
          </div>

          <div className="form-field">
            <label>Grade Applying *</label>
            <input
              type="text"
              name="grade_applying"
              value={formData.grade_applying}
              onChange={handleChange}
              placeholder="Example: Grade 8"
              required
            />
          </div>

          <div className="form-field">
            <label>Academic Year *</label>
            <select
              name="academic_year"
              value={formData.academic_year}
              onChange={handleChange}
              required
            >
              <option value="">Select academic year</option>
              {academicYearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Guardian Name *</label>
            <input
              type="text"
              name="guardian_name"
              value={formData.guardian_name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-field">
            <label>Guardian Phone *</label>
            <input
              type="text"
              name="guardian_phone"
              value={formData.guardian_phone}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-field">
            <label>Guardian Email</label>
            <input
              type="email"
              name="guardian_email"
              value={formData.guardian_email}
              onChange={handleChange}
            />
          </div>

          <div className="form-field">
            <label>Source</label>
            <select name="source" value={formData.source} onChange={handleChange}>
              {sourceOptions.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Stage</label>
            <select name="stage" value={formData.stage} onChange={handleChange}>
              {stageOptions.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Follow Up Date</label>
            <input
              type="date"
              name="follow_up_date"
              value={formData.follow_up_date}
              onChange={handleChange}
            />
          </div>

          <div className="form-field">
            <label>Assigned To</label>
            <input
              type="text"
              name="assigned_to"
              value={formData.assigned_to}
              onChange={handleChange}
              placeholder="Admissions counselor"
            />
          </div>

          <div className="form-field span-2">
            <label>Notes</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows="3"
              placeholder="Parent preferences, visit notes, document status..."
            />
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="primary-button">
            <PlusCircle size={18} />
            {editingId ? "Update Inquiry" : "Add Inquiry"}
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
            <h2>{editingId ? "Edit Admission Inquiry" : "Add Admission Inquiry"}</h2>
            <p>Capture international admissions interest and follow-up details.</p>
          </div>

          <button type="button" className="light-button" onClick={handleCancel}>
            <ArrowLeft size={17} />
            Back
          </button>
        </section>

        {message && <div className="toast-notification">{message}</div>}
        {admissionForm}
      </div>
    );
  }

  if (pageMode === "followups" && selectedInquiry) {
    return (
      <div className="management-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Admissions CRM</p>
            <h2>{selectedInquiry.student_name}</h2>
            <p>
              {selectedInquiry.inquiry_no} | {selectedInquiry.grade_applying} |{" "}
              {selectedInquiry.guardian_name}
            </p>
          </div>

          <button
            type="button"
            className="light-button"
            onClick={() => {
              setSelectedInquiry(null);
              setFollowUps([]);
              setPageMode("list");
            }}
          >
            <ArrowLeft size={17} />
            Back
          </button>
        </section>

        {message && <div className="toast-notification">{message}</div>}

        <section className="form-panel">
          <div className="panel-header">
            <div>
              <h3>Add Follow-up</h3>
              <p>Log calls, visits, next actions, and owner handoffs.</p>
            </div>
          </div>

          <form className="classic-form" onSubmit={handleFollowUpSubmit}>
            <div className="form-grid">
              <div className="form-field">
                <label>Activity Date *</label>
                <input
                  type="date"
                  name="activity_date"
                  value={followUpForm.activity_date}
                  onChange={handleFollowUpChange}
                  required
                />
              </div>

              <div className="form-field">
                <label>Activity Type</label>
                <select
                  name="activity_type"
                  value={followUpForm.activity_type}
                  onChange={handleFollowUpChange}
                >
                  {activityTypeOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label>Owner</label>
                <input
                  name="owner"
                  value={followUpForm.owner}
                  onChange={handleFollowUpChange}
                  placeholder="Admissions counselor"
                />
              </div>

              <div className="form-field full-width">
                <label>Notes *</label>
                <textarea
                  name="notes"
                  value={followUpForm.notes}
                  onChange={handleFollowUpChange}
                  rows="3"
                  placeholder="Conversation summary, objections, documents requested..."
                  required
                />
              </div>

              <div className="form-field">
                <label>Next Action</label>
                <input
                  name="next_action"
                  value={followUpForm.next_action}
                  onChange={handleFollowUpChange}
                  placeholder="Schedule campus tour"
                />
              </div>

              <div className="form-field">
                <label>Next Follow-up Date</label>
                <input
                  type="date"
                  name="next_follow_up_date"
                  value={followUpForm.next_follow_up_date}
                  onChange={handleFollowUpChange}
                />
              </div>

              <div className="form-field">
                <label>Outcome</label>
                <select
                  name="outcome"
                  value={followUpForm.outcome}
                  onChange={handleFollowUpChange}
                >
                  {["Open", "Positive", "Needs Info", "No Response", "Closed"].map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="primary-button">
                <MessageCircle size={18} />
                Add Follow-up
              </button>
            </div>
          </form>
        </section>

        <section className="table-panel">
          <div className="table-toolbar">
            <div>
              <h3>Follow-up History</h3>
              <p>{followUps.length} touchpoint(s) recorded</p>
            </div>
          </div>

          <div className="table-wrapper">
            <table className="classic-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Notes</th>
                  <th>Next Action</th>
                  <th>Next Follow-up</th>
                  <th>Owner</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {followUps.length === 0 ? (
                  <tr>
                    <td className="empty-table" colSpan="7">
                      No follow-ups recorded.
                    </td>
                  </tr>
                ) : (
                  followUps.map((item) => (
                    <tr key={item.id}>
                      <td>{item.activity_date || "-"}</td>
                      <td>{item.activity_type || "-"}</td>
                      <td>{item.notes || "-"}</td>
                      <td>{item.next_action || "-"}</td>
                      <td>{item.next_follow_up_date || "-"}</td>
                      <td>{item.owner || "-"}</td>
                      <td>
                        <span className="status active">{item.outcome || "Open"}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }

  if (pageMode === "convert" && selectedInquiry) {
    return (
      <div className="management-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Admissions CRM</p>
            <h2>Convert to Student</h2>
            <p>
              {selectedInquiry.inquiry_no} | {selectedInquiry.student_name} |{" "}
              {selectedInquiry.grade_applying}
            </p>
          </div>

          <button
            type="button"
            className="light-button"
            onClick={() => {
              setSelectedInquiry(null);
              setConvertForm(emptyConvertForm);
              setPageMode("list");
            }}
          >
            <ArrowLeft size={17} />
            Back
          </button>
        </section>

        {message && <div className="toast-notification">{message}</div>}

        <section className="form-panel">
          <div className="panel-header">
            <div>
              <h3>Student Admission</h3>
              <p>Create a Student record from this admission inquiry.</p>
            </div>
          </div>

          <form className="classic-form" onSubmit={handleConvertSubmit}>
            <div className="form-grid">
              <div className="form-field">
                <label>Admission No *</label>
                <input
                  name="admission_no"
                  value={convertForm.admission_no}
                  onChange={handleConvertChange}
                  placeholder="ADM2026001"
                  required
                />
              </div>

              <div className="form-field">
                <label>First Name *</label>
                <input
                  name="first_name"
                  value={convertForm.first_name}
                  onChange={handleConvertChange}
                  required
                />
              </div>

              <div className="form-field">
                <label>Last Name</label>
                <input
                  name="last_name"
                  value={convertForm.last_name}
                  onChange={handleConvertChange}
                />
              </div>

              <div className="form-field">
                <label>Class</label>
                <input
                  name="class_name"
                  value={convertForm.class_name}
                  onChange={handleConvertChange}
                />
              </div>

              <div className="form-field">
                <label>Section</label>
                <input
                  name="section"
                  value={convertForm.section}
                  onChange={handleConvertChange}
                />
              </div>

              <div className="form-field">
                <label>Admission Date</label>
                <input
                  type="date"
                  name="admission_date"
                  value={convertForm.admission_date}
                  onChange={handleConvertChange}
                />
              </div>

              <div className="form-field">
                <label>Guardian Name</label>
                <input
                  name="guardian_name"
                  value={convertForm.guardian_name}
                  onChange={handleConvertChange}
                />
              </div>

              <div className="form-field">
                <label>Guardian Phone</label>
                <input
                  name="guardian_phone"
                  value={convertForm.guardian_phone}
                  onChange={handleConvertChange}
                />
              </div>

              <div className="form-field">
                <label>Guardian Email</label>
                <input
                  type="email"
                  name="guardian_email"
                  value={convertForm.guardian_email}
                  onChange={handleConvertChange}
                />
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="primary-button">
                <UserPlus size={18} />
                Convert to Student
              </button>
            </div>
          </form>
        </section>
      </div>
    );
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Admissions</p>
          <h2>Admissions CRM</h2>
          <p>Manage admission inquiries, follow-ups, and application stages.</p>
        </div>

        <div className="module-header-actions">
          
          <button
            type="button"
            className="secondary-button"
            onClick={() => setShowStageManager((prev) => !prev)}
          >
            <Settings size={17} />
            Manage Stages
          </button>
          <button type="button" className="primary-button" onClick={handleAddInquiry}>
            <UserPlus size={18} />
            Add Inquiry
          </button>
        </div>
      </section>

      {showStageManager && (
        <section className="table-panel stage-manager-panel">
          <div className="panel-header">
            <div>
              <h3>Admission Workflow Stages</h3>
              <p>Configure the stages inquiries move through. Renaming a stage updates all inquiries currently in it.</p>
            </div>
          </div>
          <div className="stage-manager-list">
            {stages.map((stage, index) => (
              <div
                key={stage.id}
                className={
                  stage.is_terminal
                    ? "stage-manager-row stage-manager-row-terminal"
                    : "stage-manager-row"
                }
              >
                <div className="stage-manager-node">
                  {stage.is_terminal ? <CheckCircle size={16} /> : index + 1}
                  {index < stages.length - 1 && <span className="stage-manager-connector" />}
                </div>
                <input
                  type="text"
                  value={stageEdits[stage.id] ?? stage.name}
                  onChange={(event) =>
                    setStageEdits((current) => ({ ...current, [stage.id]: event.target.value }))
                  }
                  onBlur={() => renameStage(stage)}
                />
                {stage.is_terminal && <span className="status active">Final</span>}
                <div className="stage-manager-actions">
                  <button
                    type="button"
                    className="light-icon-button"
                    disabled={index === 0}
                    title="Move up"
                    onClick={() => moveStage(index, -1)}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    className="light-icon-button"
                    disabled={index === stages.length - 1}
                    title="Move down"
                    onClick={() => moveStage(index, 1)}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    className="light-icon-button stage-manager-delete"
                    title="Delete stage"
                    onClick={() => deleteStage(stage)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="stage-manager-add">
            <input
              type="text"
              placeholder="New stage name"
              value={newStageName}
              onChange={(event) => setNewStageName(event.target.value)}
            />
            <button type="button" className="secondary-button" onClick={addStage}>
              <PlusCircle size={16} />
              Add Stage
            </button>
          </div>
        </section>
      )}

      <section className="summary-strip report-summary-grid">
        <div className="summary-card">
          <ClipboardList size={22} />
          <div>
            <span>Total Inquiries</span>
            <strong>{inquiries.length}</strong>
          </div>
        </div>
        <div className="summary-card">
          <UserPlus size={22} />
          <div>
            <span>Active Pipeline</span>
            <strong>{activePipelineCount}</strong>
          </div>
        </div>
        <div className="summary-card">
          <CheckCircle size={22} />
          <div>
            <span>Admitted</span>
            <strong>{admittedCount}</strong>
          </div>
        </div>
        <div className="summary-card warning">
          <ClipboardList size={22} />
          <div>
            <span>Follow Ups</span>
            <strong>{followUpCount}</strong>
          </div>
        </div>
      </section>

      {message && <div className="toast-notification">{message}</div>}

      <section className="table-panel module-filter-panel">
        <div className="filter-row sis-filter-row">
          <div className="form-field">
            <label>Stage</label>
            <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
              <option value="">All Stages</option>
              {stageOptions.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="light-button"
            onClick={() => {
              setSearchText("");
              setStageFilter("");
            }}
          >
            Clear Filters
          </button>
        </div>
      </section>

      <EnhancedRecordsTable
        data={filteredInquiries}
        emptyText="No admission inquiries found."
        loading={loading}
        loadingText="Loading admission inquiries..."
        searchPlaceholder="Search student, grade, guardian, phone..."
        searchText={searchText}
        setSearchText={setSearchText}
        columns={[
          { key: "inquiry_no", label: "Inquiry No", render: (inquiry) => inquiry.inquiry_no || "-" },
          { key: "student_name", label: "Student", render: (inquiry) => inquiry.student_name || "-" },
          { key: "grade_applying", label: "Grade", render: (inquiry) => inquiry.grade_applying || "-" },
          { key: "academic_year", label: "Year", render: (inquiry) => inquiry.academic_year || "-" },
          { key: "guardian_name", label: "Guardian", render: (inquiry) => inquiry.guardian_name || "-" },
          { key: "guardian_phone", label: "Phone", render: (inquiry) => inquiry.guardian_phone || "-" },
          { key: "source", label: "Source", render: (inquiry) => inquiry.source || "-" },
          {
            key: "stage",
            label: "Stage",
            render: (inquiry) => <span className="status active">{inquiry.stage || "Inquiry"}</span>,
            value: (inquiry) => inquiry.stage || "Inquiry",
          },
          { key: "follow_up_date", label: "Follow Up", render: (inquiry) => inquiry.follow_up_date || "-" },
          { key: "assigned_to", label: "Owner", render: (inquiry) => inquiry.assigned_to || "-" },
          {
            key: "converted",
            label: "Converted",
            render: (inquiry) =>
              inquiry.converted_student_id ? (
                <span className="status active">Yes</span>
              ) : (
                <span className="status">No</span>
              ),
            value: (inquiry) => (inquiry.converted_student_id ? "Yes" : "No"),
          },
          {
            key: "actions",
            label: "Actions",
            hideable: false,
            actions: false,
            render: (inquiry) => (
              <div className="action-buttons">
                <button
                  type="button"
                  className="edit-button"
                  onClick={() => openFollowUps(inquiry)}
                  title="Follow Ups"
                >
                  <MessageCircle size={15} />
                </button>
                {!inquiry.converted_student_id && (
                  <button
                    type="button"
                    className="edit-button"
                    onClick={() => openConvertInquiry(inquiry)}
                    title="Convert"
                  >
                    <UserPlus size={15} />
                  </button>
                )}
                <button type="button" className="edit-button" onClick={() => handleEdit(inquiry)} title="Edit">
                  <Edit size={15} />
                </button>
                <button
                  type="button"
                  className="delete-button"
                  onClick={() => handleDelete(inquiry.id)}
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
