import { useEffect, useMemo, useState } from "react";
import {
  Edit,
  Trash2,
  PlusCircle,
  RefreshCcw,
  BookOpen,
  CheckCircle,
  XCircle,
} from "lucide-react";

import API from "../api";
import EnhancedRecordsTable from "../components/EnhancedRecordsTable";

const emptySubjectForm = {
  subject_code: "",
  subject_name: "",
  subject_type: "Scholastic",
  is_active: true,
};

const subjectTypeOptions = [
  "Scholastic",
  "Co-Scholastic",
  "Language",
  "Activity",
  "Skill Based",
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

  if (typeof detail === "string") {
    return detail;
  }

  if (detail && typeof detail === "object") {
    return detail.msg || JSON.stringify(detail);
  }

  return fallbackMessage;
}

export default function Subjects() {
  const [subjects, setSubjects] = useState([]);
  const [formData, setFormData] = useState(emptySubjectForm);
  const [editingId, setEditingId] = useState(null);
  const [pageMode, setPageMode] = useState("list");

  const [searchText, setSearchText] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadSubjects() {
    try {
      setLoading(true);
      setMessage("");

      const response = await API.get("/subjects/");
      setSubjects(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load subjects."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSubjects();
  }, []);

  function handleChange(e) {
    const { name, value, type, checked } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function buildPayload() {
    return {
      subject_code: formData.subject_code.trim().toUpperCase(),
      subject_name: formData.subject_name.trim(),
      subject_type: formData.subject_type || "Scholastic",
      is_active: Boolean(formData.is_active),
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage("");

    try {
      const payload = buildPayload();

      if (!payload.subject_code) {
        setMessage("Subject Code is required.");
        return;
      }

      if (!payload.subject_name) {
        setMessage("Subject Name is required.");
        return;
      }

      if (editingId) {
        await API.put(`/subjects/${editingId}`, payload);
        setMessage("Subject updated successfully.");
      } else {
        await API.post("/subjects/", payload);
        setMessage("Subject added successfully.");
      }

      setFormData(emptySubjectForm);
      setEditingId(null);
      setPageMode("list");
      await loadSubjects();
    } catch (error) {
      console.error(error);
      setMessage(
        getApiErrorMessage(error, "Something went wrong while saving subject.")
      );
    }
  }

  function handleEdit(subject) {
    setEditingId(subject.id);
    setPageMode("form");

    setFormData({
      subject_code: subject.subject_code || "",
      subject_name: subject.subject_name || "",
      subject_type: subject.subject_type || "Scholastic",
      is_active: Boolean(subject.is_active),
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(subjectId) {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this subject?"
    );

    if (!confirmDelete) return;

    try {
      await API.delete(`/subjects/${subjectId}`);
      setMessage("Subject deleted successfully.");

      if (editingId === subjectId) {
        setEditingId(null);
        setFormData(emptySubjectForm);
      }

      await loadSubjects();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete subject."));
    }
  }

  function handleCancelEdit() {
    setEditingId(null);
    setFormData(emptySubjectForm);
    setMessage("");
    setPageMode("list");
  }

  function handleAddSubject() {
    setEditingId(null);
    setFormData(emptySubjectForm);
    setMessage("");
    setPageMode("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const subjectTypes = useMemo(() => {
    const usedTypes = subjects
      .map((subject) => subject.subject_type)
      .filter(Boolean);

    return Array.from(new Set([...subjectTypeOptions, ...usedTypes]));
  }, [subjects]);

  const filteredSubjects = subjects.filter((subject) => {
    const fullText = `
      ${subject.subject_code}
      ${subject.subject_name}
      ${subject.subject_type}
      ${subject.is_active ? "Active" : "Inactive"}
    `.toLowerCase();

    const matchSearch = fullText.includes(searchText.toLowerCase());

    const matchType = typeFilter
      ? subject.subject_type === typeFilter
      : true;

    const matchStatus =
      statusFilter === ""
        ? true
        : statusFilter === "Active"
        ? subject.is_active
        : !subject.is_active;

    return matchSearch && matchType && matchStatus;
  });

  const activeCount = subjects.filter((subject) => subject.is_active).length;
  const inactiveCount = subjects.filter((subject) => !subject.is_active).length;

  const subjectForm = (
    <section className="form-panel">
      <div className="panel-header">
        <div>
          <h3>{editingId ? "Edit Subject" : "Add Subject"}</h3>
          <p>Create subjects once, then map them to classes.</p>
        </div>
      </div>

      <form className="classic-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-field">
            <label>Subject Code *</label>
            <input
              type="text"
              name="subject_code"
              value={formData.subject_code}
              onChange={handleChange}
              placeholder="Example: MATH"
              required
            />
          </div>

          <div className="form-field">
            <label>Subject Name *</label>
            <input
              type="text"
              name="subject_name"
              value={formData.subject_name}
              onChange={handleChange}
              placeholder="Example: Mathematics"
              required
            />
          </div>

          <div className="form-field">
            <label>Subject Type</label>
            <select
              name="subject_type"
              value={formData.subject_type}
              onChange={handleChange}
            >
              {subjectTypeOptions.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Status</label>
            <label className="switch-row">
              <input
                type="checkbox"
                name="is_active"
                checked={Boolean(formData.is_active)}
                onChange={handleChange}
              />
              <span>{formData.is_active ? "Active" : "Inactive"}</span>
            </label>
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="primary-button">
            <PlusCircle size={18} />
            {editingId ? "Update Subject" : "Add Subject"}
          </button>

          <button
            type="button"
            className="light-button"
            onClick={handleCancelEdit}
          >
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
            <p className="eyebrow">Academic Setup</p>
            <h2>{editingId ? "Edit Subject" : "Add Subject"}</h2>
            <p>Create subjects once, then map them to classes.</p>
          </div>

          <button
            type="button"
            className="light-button"
            onClick={handleCancelEdit}
          >
            Back to Subject Records
          </button>
        </section>

        {message && <div className="message-box">{message}</div>}

        {subjectForm}
      </div>
    );
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Academic Setup</p>
          <h2>Subject Master</h2>
          <p>
            Manage academic subjects that will be mapped to classes and teachers.
          </p>
        </div>

        <div className="module-header-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={loadSubjects}
          >
            <RefreshCcw size={17} />
            Refresh
          </button>

          <button type="button" className="primary-button" onClick={handleAddSubject}>
            <PlusCircle size={18} />
            Add Subject
          </button>
        </div>
      </section>

      <section className="summary-strip report-summary-grid">
        <div className="summary-card">
          <BookOpen size={22} />
          <div>
            <span>Total Subjects</span>
            <strong>{subjects.length}</strong>
          </div>
        </div>

        <div className="summary-card">
          <CheckCircle size={22} />
          <div>
            <span>Active Subjects</span>
            <strong>{activeCount}</strong>
          </div>
        </div>

        <div className="summary-card warning">
          <XCircle size={22} />
          <div>
            <span>Inactive Subjects</span>
            <strong>{inactiveCount}</strong>
          </div>
        </div>

        <div className="summary-card">
          <BookOpen size={22} />
          <div>
            <span>Subject Types</span>
            <strong>{subjectTypes.length}</strong>
          </div>
        </div>
      </section>

      {message && <div className="message-box">{message}</div>}

      <section className="table-panel module-filter-panel">
        <div className="filter-row sis-filter-row">
          <div className="form-field">
            <label>Subject Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">All Types</option>

              {subjectTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          <button
            type="button"
            className="light-button"
            onClick={() => {
              setSearchText("");
              setTypeFilter("");
              setStatusFilter("");
            }}
          >
            Clear Filters
          </button>
        </div>
      </section>

      <EnhancedRecordsTable
        data={filteredSubjects}
        emptyText="No subject records found."
        loading={loading}
        loadingText="Loading subjects..."
        searchPlaceholder="Search subject code, name, type..."
        searchText={searchText}
        setSearchText={setSearchText}
        columns={[
          { key: "subject_code", label: "Subject Code", render: (subject) => subject.subject_code || "-" },
          { key: "subject_name", label: "Subject Name", render: (subject) => subject.subject_name || "-" },
          { key: "subject_type", label: "Subject Type", render: (subject) => subject.subject_type || "-" },
          {
            key: "status",
            label: "Status",
            render: (subject) => (
              <span className={subject.is_active ? "status active" : "status danger"}>
                {subject.is_active ? "Active" : "Inactive"}
              </span>
            ),
            value: (subject) => (subject.is_active ? "Active" : "Inactive"),
          },
          {
            key: "actions",
            label: "Actions",
            hideable: false,
            actions: false,
            render: (subject) => (
              <div className="action-buttons">
                <button type="button" className="edit-button" onClick={() => handleEdit(subject)} title="Edit">
                  <Edit size={15} />
                </button>
                <button type="button" className="delete-button" onClick={() => handleDelete(subject.id)} title="Delete">
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
