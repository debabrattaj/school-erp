import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Edit,
  ExternalLink,
  Eye,
  PlusCircle,
  Send,
  Trash2,
} from "lucide-react";

import API from "../api";
import EnhancedRecordsTable from "../components/EnhancedRecordsTable";
import FileUploadField from "../components/FileUploadField";
import { resolveFileUrl } from "../utils/files";

const RESOURCE_TYPES = ["Document", "Video", "Link", "Note"];
const STATUSES = ["Draft", "Published", "Archived"];

const emptyForm = {
  academic_year: "",
  class_name: "",
  section: "",
  subject: "",
  title: "",
  description: "",
  resource_type: "Document",
  url: "",
  content: "",
  status: "Draft",
  available_from: "",
  teacher_id: "",
};

function getApiErrorMessage(error, fallback) {
  return error.response?.data?.detail || fallback;
}

export default function LearningResources() {
  const [resources, setResources] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [formData, setFormData] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [pageMode, setPageMode] = useState("list");
  const [activeResource, setActiveResource] = useState(null);
  const [engagement, setEngagement] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return undefined;
    const timeoutId = window.setTimeout(() => setMessage(""), 2000);
    return () => window.clearTimeout(timeoutId);
  }, [message]);

  async function loadResources() {
    try {
      setLoading(true);
      const response = await API.get("/lms/resources");
      setResources(response.data || []);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load learning resources."));
    } finally {
      setLoading(false);
    }
  }

  // Sourced from their own modules rather than typed in, so material can only
  // be published to a class/section that actually exists.
  async function loadPickLists() {
    const [classesRes, subjectsRes, yearsRes, teachersRes] = await Promise.allSettled([
      API.get("/classes/"),
      API.get("/subjects/"),
      API.get("/academic-years/"),
      API.get("/teachers/"),
    ]);
    setClasses(classesRes.status === "fulfilled" ? classesRes.value.data || [] : []);
    setSubjects(subjectsRes.status === "fulfilled" ? subjectsRes.value.data || [] : []);
    setAcademicYears(yearsRes.status === "fulfilled" ? yearsRes.value.data || [] : []);
    setTeachers(teachersRes.status === "fulfilled" ? teachersRes.value.data || [] : []);
  }

  useEffect(() => {
    loadResources();
    loadPickLists();
  }, []);

  const classNames = [...new Set(classes.map((c) => c.class_name).filter(Boolean))];
  const sectionsForClass = [
    ...new Set(
      classes
        .filter((c) => c.class_name === formData.class_name)
        .map((c) => c.section)
        .filter(Boolean)
    ),
  ];
  const isNote = formData.resource_type === "Note";

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  function buildPayload() {
    return {
      academic_year: formData.academic_year.trim() || null,
      class_name: formData.class_name.trim(),
      section: formData.section.trim() || null,
      subject: formData.subject.trim() || null,
      title: formData.title.trim(),
      description: formData.description.trim() || null,
      resource_type: formData.resource_type,
      url: isNote ? null : formData.url.trim() || null,
      content: isNote ? formData.content.trim() || null : null,
      status: formData.status,
      available_from: formData.available_from || null,
      teacher_id: formData.teacher_id ? Number(formData.teacher_id) : null,
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage("");

    const payload = buildPayload();
    if (!payload.class_name) {
      setMessage("Class is required.");
      return;
    }
    if (!payload.title) {
      setMessage("Title is required.");
      return;
    }
    if (isNote ? !payload.content : !payload.url) {
      setMessage(isNote ? "A note needs some content." : "Add a file or a link.");
      return;
    }

    try {
      if (editingId) {
        await API.put(`/lms/resources/${editingId}`, payload);
        setMessage("Resource updated successfully.");
      } else {
        await API.post("/lms/resources", payload);
        setMessage("Resource saved successfully.");
      }
      setFormData(emptyForm);
      setEditingId(null);
      setPageMode("list");
      await loadResources();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to save resource."));
    }
  }

  function handleEdit(resource) {
    setEditingId(resource.id);
    setPageMode("form");
    setFormData({
      academic_year: resource.academic_year || "",
      class_name: resource.class_name || "",
      section: resource.section || "",
      subject: resource.subject || "",
      title: resource.title || "",
      description: resource.description || "",
      resource_type: resource.resource_type || "Document",
      url: resource.url || "",
      content: resource.content || "",
      status: resource.status || "Draft",
      available_from: resource.available_from || "",
      teacher_id: resource.teacher_id || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handlePublish(resource) {
    try {
      await API.put(`/lms/resources/${resource.id}`, { status: "Published" });
      setMessage("Resource published — students can see it now.");
      await loadResources();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to publish resource."));
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this resource?")) return;
    try {
      await API.delete(`/lms/resources/${id}`);
      setMessage("Resource deleted successfully.");
      await loadResources();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to delete resource."));
    }
  }

  async function openEngagement(resource) {
    setActiveResource(resource);
    setEngagement(null);
    setPageMode("engagement");
    try {
      const response = await API.get(`/lms/resources/${resource.id}/engagement`);
      setEngagement(response.data);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load who has opened this."));
    }
  }

  function handleCancelEdit() {
    setEditingId(null);
    setFormData(emptyForm);
    setActiveResource(null);
    setMessage("");
    setPageMode("list");
  }

  function handleAdd() {
    setEditingId(null);
    setFormData(emptyForm);
    setMessage("");
    setPageMode("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const filteredResources = resources.filter((item) => {
    const fullText = `${item.class_name} ${item.section} ${item.subject} ${item.title} ${item.resource_type} ${item.status} ${item.teacher_name_snapshot}`.toLowerCase();
    return fullText.includes(searchText.toLowerCase());
  });

  const publishedCount = resources.filter((r) => r.status === "Published").length;

  if (pageMode === "form") {
    return (
      <div className="management-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Academics</p>
            <h2>{editingId ? "Edit Resource" : "Add Learning Resource"}</h2>
          </div>
          <button type="button" className="light-button" onClick={handleCancelEdit}>
            <ArrowLeft size={17} />
            Back
          </button>
        </section>

        {message && <div className="toast-notification">{message}</div>}

        <section className="form-panel">
          <div className="panel-header">
            <div>
              <h3>{editingId ? "Edit Resource" : "Add Learning Resource"}</h3>
              <p>
                Students and guardians of a matching class + section see this in the portal once it
                is published — and only from its release date.
              </p>
            </div>
          </div>

          <form className="classic-form" onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-field">
                <label>Class *</label>
                <select
                  name="class_name"
                  value={formData.class_name}
                  onChange={(e) => {
                    handleChange(e);
                    // The previous section may not exist in the new class.
                    setFormData((prev) => ({ ...prev, section: "" }));
                  }}
                  required
                >
                  <option value="">Select Class</option>
                  {classNames.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                {!classNames.length && <small>No classes set up yet — add them under Classes.</small>}
              </div>
              <div className="form-field">
                <label>Section</label>
                <select
                  name="section"
                  value={formData.section}
                  onChange={handleChange}
                  disabled={!formData.class_name}
                >
                  <option value="">All sections</option>
                  {sectionsForClass.map((section) => (
                    <option key={section} value={section}>{section}</option>
                  ))}
                </select>
                <small>{formData.class_name ? "Blank covers every section." : "Pick a class first."}</small>
              </div>
              <div className="form-field">
                <label>Subject</label>
                <select name="subject" value={formData.subject} onChange={handleChange}>
                  <option value="">Select Subject</option>
                  {subjects
                    .filter((subject) => subject.is_active !== false)
                    .map((subject) => (
                      <option key={subject.id} value={subject.subject_name}>
                        {subject.subject_name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="form-field">
                <label>Academic Year</label>
                <select name="academic_year" value={formData.academic_year} onChange={handleChange}>
                  <option value="">Select Academic Year</option>
                  {academicYears.map((year) => (
                    <option key={year.id} value={year.name}>{year.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Teacher</label>
                <select name="teacher_id" value={formData.teacher_id} onChange={handleChange}>
                  <option value="">Select Teacher</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Type *</label>
                <select name="resource_type" value={formData.resource_type} onChange={handleChange}>
                  {RESOURCE_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Title *</label>
                <input type="text" name="title" value={formData.title} onChange={handleChange} required />
              </div>
              <div className="form-field">
                <label>Status</label>
                <select name="status" value={formData.status} onChange={handleChange}>
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
                <small>Only Published material reaches the portal.</small>
              </div>
              <div className="form-field">
                <label>Release Date</label>
                <input
                  type="date"
                  name="available_from"
                  value={formData.available_from}
                  onChange={handleChange}
                />
                <small>Blank releases it as soon as it is published.</small>
              </div>

              {isNote ? (
                <div className="form-field">
                  <label>Note *</label>
                  <textarea name="content" value={formData.content} onChange={handleChange} rows={6} />
                </div>
              ) : (
                <>
                  <div className="form-field">
                    <label>Link *</label>
                    <input
                      type="text"
                      name="url"
                      value={formData.url}
                      onChange={handleChange}
                      placeholder="https://... or upload a file below"
                    />
                  </div>
                  <div className="form-field">
                    <label>Or Upload a File</label>
                    <FileUploadField
                      value={formData.url}
                      onChange={(url) => setFormData((prev) => ({ ...prev, url: url || "" }))}
                    />
                  </div>
                </>
              )}

              <div className="form-field">
                <label>Description</label>
                <textarea name="description" value={formData.description} onChange={handleChange} rows={3} />
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="primary-button">
                <PlusCircle size={18} />
                {editingId ? "Update Resource" : "Save Resource"}
              </button>
              <button type="button" className="light-button" onClick={handleCancelEdit}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      </div>
    );
  }

  if (pageMode === "engagement" && activeResource) {
    return (
      <div className="management-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Academics</p>
            <h2>Who has opened — {activeResource.title}</h2>
            <p>
              {[activeResource.class_name, activeResource.section].filter(Boolean).join(" - ")}
              {activeResource.subject ? ` · ${activeResource.subject}` : ""}
            </p>
          </div>
          <button type="button" className="light-button" onClick={handleCancelEdit}>
            <ArrowLeft size={17} />
            Back
          </button>
        </section>

        {message && <div className="toast-notification">{message}</div>}

        {!engagement ? (
          <div className="message-box">Loading…</div>
        ) : (
          <>
            <section className="summary-strip report-summary-grid">
              <div className="summary-card">
                <Eye size={22} />
                <div>
                  <span>Opened</span>
                  <strong>{engagement.viewed_count} / {engagement.total_students}</strong>
                </div>
              </div>
              <div className="summary-card warning">
                <BookOpen size={22} />
                <div>
                  <span>Not Opened Yet</span>
                  <strong>{engagement.not_viewed.length}</strong>
                </div>
              </div>
            </section>

            <div className="table-wrapper">
              <table className="classic-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Admission No</th>
                    <th>Roll No</th>
                    <th>Opened</th>
                    <th>Times</th>
                    <th>Last Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {engagement.viewers.map((row) => (
                    <tr key={`v-${row.student_id}`}>
                      <td>{row.student_name}</td>
                      <td>{row.admission_no || "-"}</td>
                      <td>{row.roll_no || "-"}</td>
                      <td><span className="status active">Yes</span></td>
                      <td>{row.view_count}</td>
                      <td>{row.last_viewed_at ? new Date(`${row.last_viewed_at}Z`).toLocaleString() : "-"}</td>
                    </tr>
                  ))}
                  {engagement.not_viewed.map((row) => (
                    <tr key={`n-${row.student_id}`}>
                      <td>{row.student_name}</td>
                      <td>{row.admission_no || "-"}</td>
                      <td>{row.roll_no || "-"}</td>
                      <td><span className="status pending">Not yet</span></td>
                      <td>-</td>
                      <td>-</td>
                    </tr>
                  ))}
                  {!engagement.total_students && (
                    <tr>
                      <td colSpan={6}>No students in this class yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Academics</p>
          <h2>Learning Resources</h2>
          <p>Study material for a class — notes, worksheets, videos and links, read in the portal.</p>
        </div>
        <div className="module-header-actions">
          <button type="button" className="primary-button" onClick={handleAdd}>
            <PlusCircle size={18} />
            Add Resource
          </button>
        </div>
      </section>

      <section className="summary-strip report-summary-grid">
        <div className="summary-card">
          <BookOpen size={22} />
          <div>
            <span>Total Resources</span>
            <strong>{resources.length}</strong>
          </div>
        </div>
        <div className="summary-card positive">
          <Send size={22} />
          <div>
            <span>Published</span>
            <strong>{publishedCount}</strong>
          </div>
        </div>
      </section>

      {message && <div className="toast-notification">{message}</div>}

      <EnhancedRecordsTable
        data={filteredResources}
        emptyText="No learning resources yet."
        loading={loading}
        loadingText="Loading resources..."
        searchPlaceholder="Search class, subject, title, type..."
        searchText={searchText}
        setSearchText={setSearchText}
        columns={[
          {
            key: "class_name",
            label: "Class",
            render: (r) => [r.class_name, r.section].filter(Boolean).join(" - ") || "-",
          },
          { key: "subject", label: "Subject", render: (r) => r.subject || "-" },
          { key: "title", label: "Title", render: (r) => r.title },
          { key: "resource_type", label: "Type", render: (r) => r.resource_type },
          {
            key: "status",
            label: "Status",
            render: (r) => (
              <span
                className={
                  r.status === "Published" ? "status active" : r.status === "Archived" ? "status inactive" : "status pending"
                }
              >
                {r.status}
              </span>
            ),
            value: (r) => r.status,
          },
          { key: "available_from", label: "Release Date", render: (r) => r.available_from || "-" },
          {
            key: "viewer_count",
            label: "Opened By",
            render: (r) => (
              <button type="button" className="text-link-button" onClick={() => openEngagement(r)}>
                {r.viewer_count || 0} student{r.viewer_count === 1 ? "" : "s"}
              </button>
            ),
            value: (r) => r.viewer_count || 0,
          },
          { key: "teacher_name_snapshot", label: "Teacher", render: (r) => r.teacher_name_snapshot || "-" },
          {
            key: "actions",
            label: "Actions",
            hideable: false,
            actions: false,
            render: (r) => (
              <div className="action-buttons">
                {r.url && (
                  <a
                    className="edit-button"
                    href={resolveFileUrl(r.url)}
                    target="_blank"
                    rel="noreferrer"
                    title="Open"
                  >
                    <ExternalLink size={15} />
                  </a>
                )}
                {r.status !== "Published" && (
                  <button type="button" className="edit-button" onClick={() => handlePublish(r)} title="Publish">
                    <Send size={15} />
                  </button>
                )}
                <button type="button" className="edit-button" onClick={() => handleEdit(r)} title="Edit">
                  <Edit size={15} />
                </button>
                <button type="button" className="delete-button" onClick={() => handleDelete(r.id)} title="Delete">
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
