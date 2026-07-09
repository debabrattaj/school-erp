import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  BookOpenCheck,
  CheckCircle,
  Edit,
  Layers,
  PlusCircle,
  Trash2,
} from "lucide-react";

import API from "../api";
import EnhancedRecordsTable from "../components/EnhancedRecordsTable";
import { getMasterValues } from "../services/masterDataService";

const emptyCurriculumForm = {
  program_name: "",
  curriculum_track: "IB PYP",
  grade_level: "",
  academic_year: "2026-27",
  class_id: "",
  subject_groups: "",
  assessment_model: "",
  coordinator: "",
  status: "Draft",
  remarks: "",
};

const curriculumTracks = [
  "IB PYP",
  "IB MYP",
  "IB DP",
  "Cambridge Primary",
  "Cambridge Lower Secondary",
  "IGCSE",
  "A-Level",
  "CBSE",
  "ICSE",
  "State Board",
  "Custom",
];

const statusOptions = ["Draft", "Active", "Archived"];

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

function getClassLabel(schoolClass) {
  return [schoolClass.class_name, schoolClass.section].filter(Boolean).join(" ") || "Unnamed Class";
}

// Ensure the currently stored value (e.g. legacy free-text like
// "Grade 5 / Year 6") stays selectable when it isn't in the master list,
// so editing an old plan doesn't silently blank the field.
function withCurrentValue(options, current) {
  if (current && !options.includes(current)) {
    return [current, ...options];
  }
  return options;
}

export default function MultiCurriculum() {
  const [plans, setPlans] = useState([]);
  const [classes, setClasses] = useState([]);
  const [gradeOptions, setGradeOptions] = useState([]);
  const [yearOptions, setYearOptions] = useState([]);
  const [formData, setFormData] = useState(emptyCurriculumForm);
  const [editingId, setEditingId] = useState(null);
  const [pageMode, setPageMode] = useState("list");
  const [searchText, setSearchText] = useState("");
  const [trackFilter, setTrackFilter] = useState("");
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

  async function loadPlans() {
    try {
      setLoading(true);
      setMessage("");
      const response = await API.get("/multi-curriculum/");
      setPlans(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load curriculum plans."));
    } finally {
      setLoading(false);
    }
  }

  async function loadClasses() {
    try {
      const response = await API.get("/classes/");
      setClasses(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load classes."));
    }
  }

  async function loadMasterOptions() {
    try {
      const [grades, years] = await Promise.all([
        getMasterValues("Class"),
        getMasterValues("AcademicYear"),
      ]);
      setGradeOptions(grades || []);
      setYearOptions(years || []);
    } catch (error) {
      console.error(error);
    }
  }

  useEffect(() => {
    loadPlans();
    loadClasses();
    loadMasterOptions();
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  }

  function buildPayload() {
    return {
      program_name: formData.program_name.trim(),
      curriculum_track: formData.curriculum_track,
      grade_level: formData.grade_level.trim(),
      academic_year: formData.academic_year.trim(),
      class_id: formData.class_id ? Number(formData.class_id) : null,
      subject_groups: formData.subject_groups.trim() || null,
      assessment_model: formData.assessment_model.trim() || null,
      coordinator: formData.coordinator.trim() || null,
      status: formData.status || "Draft",
      remarks: formData.remarks.trim() || null,
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    try {
      const payload = buildPayload();

      if (!payload.program_name || !payload.grade_level || !payload.academic_year) {
        setMessage("Program name, grade level, and academic year are required.");
        return;
      }

      if (editingId) {
        await API.put(`/multi-curriculum/${editingId}`, payload);
        setMessage("Curriculum plan updated successfully.");
      } else {
        await API.post("/multi-curriculum/", payload);
        setMessage("Curriculum plan added successfully.");
      }

      setFormData(emptyCurriculumForm);
      setEditingId(null);
      setPageMode("list");
      await loadPlans();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save curriculum plan."));
    }
  }

  function handleAddPlan() {
    setEditingId(null);
    setFormData(emptyCurriculumForm);
    setMessage("");
    setPageMode("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEdit(plan) {
    setEditingId(plan.id);
    setFormData({
      program_name: plan.program_name || "",
      curriculum_track: plan.curriculum_track || "IB PYP",
      grade_level: plan.grade_level || "",
      academic_year: plan.academic_year || "2026-27",
      class_id: plan.class_id ? String(plan.class_id) : "",
      subject_groups: plan.subject_groups || "",
      assessment_model: plan.assessment_model || "",
      coordinator: plan.coordinator || "",
      status: plan.status || "Draft",
      remarks: plan.remarks || "",
    });
    setMessage("");
    setPageMode("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(planId) {
    if (!window.confirm("Are you sure you want to delete this curriculum plan?")) {
      return;
    }

    try {
      await API.delete(`/multi-curriculum/${planId}`);
      setMessage("Curriculum plan deleted successfully.");
      await loadPlans();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete curriculum plan."));
    }
  }

  function handleCancel() {
    setEditingId(null);
    setFormData(emptyCurriculumForm);
    setMessage("");
    setPageMode("list");
  }

  const filteredPlans = plans.filter((plan) => {
    const matchTrack = trackFilter ? plan.curriculum_track === trackFilter : true;
    const matchStatus = statusFilter ? plan.status === statusFilter : true;
    const fullText = `
      ${plan.program_name}
      ${plan.curriculum_track}
      ${plan.grade_level}
      ${plan.academic_year}
      ${plan.class_display}
      ${plan.subject_groups}
      ${plan.assessment_model}
      ${plan.coordinator}
      ${plan.status}
    `.toLowerCase();

    return matchTrack && matchStatus && fullText.includes(searchText.toLowerCase());
  });

  const activeCount = useMemo(
    () => plans.filter((plan) => plan.status === "Active").length,
    [plans]
  );
  const archivedCount = useMemo(
    () => plans.filter((plan) => plan.status === "Archived").length,
    [plans]
  );
  const trackCount = useMemo(
    () => new Set(plans.map((plan) => plan.curriculum_track).filter(Boolean)).size,
    [plans]
  );

  const curriculumForm = (
    <section className="form-panel">
      <div className="panel-header">
        <div>
          <h3>{editingId ? "Edit Curriculum Plan" : "Add Curriculum Plan"}</h3>
          <p>Define curriculum tracks, grade mappings, subject groups, and class assignments.</p>
        </div>
      </div>

      <form className="classic-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-field">
            <label>Program Name *</label>
            <input
              type="text"
              name="program_name"
              value={formData.program_name}
              onChange={handleChange}
              placeholder="Example: Primary Years Programme"
              required
            />
          </div>

          <div className="form-field">
            <label>Curriculum Track *</label>
            <select
              name="curriculum_track"
              value={formData.curriculum_track}
              onChange={handleChange}
              required
            >
              {curriculumTracks.map((track) => (
                <option key={track} value={track}>
                  {track}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Grade / Year Level *</label>
            <select
              name="grade_level"
              value={formData.grade_level}
              onChange={handleChange}
              required
            >
              <option value="">Select grade</option>
              {withCurrentValue(gradeOptions, formData.grade_level).map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </select>
            {gradeOptions.length === 0 && (
              <small>
                No Class values found in Master Data. Add them under Master Data → Class first.
              </small>
            )}
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
              {withCurrentValue(yearOptions, formData.academic_year).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Assigned Class</label>
            <select name="class_id" value={formData.class_id} onChange={handleChange}>
              <option value="">No class assigned</option>
              {classes.map((schoolClass) => (
                <option key={schoolClass.id} value={schoolClass.id}>
                  {getClassLabel(schoolClass)}
                </option>
              ))}
            </select>
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

          <div className="form-field span-2">
            <label>Subject Groups</label>
            <textarea
              name="subject_groups"
              value={formData.subject_groups}
              onChange={handleChange}
              rows="3"
              placeholder="Language acquisition, sciences, mathematics, arts..."
            />
          </div>

          <div className="form-field">
            <label>Assessment Model</label>
            <input
              type="text"
              name="assessment_model"
              value={formData.assessment_model}
              onChange={handleChange}
              placeholder="Portfolio, term exam, IA, board exam..."
            />
          </div>

          <div className="form-field">
            <label>Coordinator</label>
            <input
              type="text"
              name="coordinator"
              value={formData.coordinator}
              onChange={handleChange}
              placeholder="Program coordinator"
            />
          </div>

          <div className="form-field span-2">
            <label>Remarks</label>
            <textarea
              name="remarks"
              value={formData.remarks}
              onChange={handleChange}
              rows="3"
              placeholder="Accreditation notes, subject exceptions, timetable constraints..."
            />
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="primary-button">
            <PlusCircle size={18} />
            {editingId ? "Update Plan" : "Add Plan"}
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
            <p className="eyebrow">International Academics</p>
            <h2>{editingId ? "Edit Curriculum Plan" : "Add Curriculum Plan"}</h2>
            <p>Map programs, grades, subject groups, and class assignments.</p>
          </div>

          <button type="button" className="light-button" onClick={handleCancel}>
            Back to Curriculum Records
          </button>
        </section>

        {message && <div className="toast-notification">{message}</div>}
        {curriculumForm}
      </div>
    );
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">International Academics</p>
          <h2>Multi Curriculum Planner</h2>
          <p>Manage IB, Cambridge, national, and custom curriculum pathways.</p>
        </div>

        <div className="module-header-actions">
          
          <button type="button" className="primary-button" onClick={handleAddPlan}>
            <PlusCircle size={18} />
            Add Plan
          </button>
        </div>
      </section>

      <section className="summary-strip report-summary-grid">
        <div className="summary-card">
          <Layers size={22} />
          <div>
            <span>Total Plans</span>
            <strong>{plans.length}</strong>
          </div>
        </div>
        <div className="summary-card">
          <CheckCircle size={22} />
          <div>
            <span>Active Plans</span>
            <strong>{activeCount}</strong>
          </div>
        </div>
        <div className="summary-card warning">
          <Archive size={22} />
          <div>
            <span>Archived</span>
            <strong>{archivedCount}</strong>
          </div>
        </div>
        <div className="summary-card">
          <BookOpenCheck size={22} />
          <div>
            <span>Tracks Used</span>
            <strong>{trackCount}</strong>
          </div>
        </div>
      </section>

      {message && <div className="toast-notification">{message}</div>}

      <section className="table-panel module-filter-panel">
        <div className="filter-row sis-filter-row">
          <div className="form-field">
            <label>Curriculum Track</label>
            <select value={trackFilter} onChange={(event) => setTrackFilter(event.target.value)}>
              <option value="">All Tracks</option>
              {curriculumTracks.map((track) => (
                <option key={track} value={track}>
                  {track}
                </option>
              ))}
            </select>
          </div>

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

          <button
            type="button"
            className="light-button"
            onClick={() => {
              setSearchText("");
              setTrackFilter("");
              setStatusFilter("");
            }}
          >
            Clear Filters
          </button>
        </div>
      </section>

      <EnhancedRecordsTable
        data={filteredPlans}
        emptyText="No curriculum plans found."
        loading={loading}
        loadingText="Loading curriculum plans..."
        searchPlaceholder="Search curriculum, grade, class, coordinator..."
        searchText={searchText}
        setSearchText={setSearchText}
        columns={[
          { key: "program_name", label: "Program", render: (plan) => plan.program_name || "-" },
          { key: "curriculum_track", label: "Track", render: (plan) => plan.curriculum_track || "-" },
          { key: "grade_level", label: "Grade / Year", render: (plan) => plan.grade_level || "-" },
          { key: "academic_year", label: "Academic Year", render: (plan) => plan.academic_year || "-" },
          { key: "class_display", label: "Class", render: (plan) => plan.class_display || "-" },
          { key: "subject_groups", label: "Subject Groups", render: (plan) => plan.subject_groups || "-" },
          { key: "assessment_model", label: "Assessment", render: (plan) => plan.assessment_model || "-" },
          { key: "coordinator", label: "Coordinator", render: (plan) => plan.coordinator || "-" },
          {
            key: "status",
            label: "Status",
            render: (plan) => (
              <span className={plan.status === "Archived" ? "status danger" : "status active"}>
                {plan.status || "Draft"}
              </span>
            ),
            value: (plan) => plan.status || "Draft",
          },
          {
            key: "actions",
            label: "Actions",
            hideable: false,
            actions: false,
            render: (plan) => (
              <div className="action-buttons">
                <button type="button" className="edit-button" onClick={() => handleEdit(plan)} title="Edit">
                  <Edit size={15} />
                </button>
                <button
                  type="button"
                  className="delete-button"
                  onClick={() => handleDelete(plan.id)}
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
