import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, PlusCircle, Trash2, Upload, Users } from "lucide-react";

import API from "../api";
import EnhancedRecordsTable from "../components/EnhancedRecordsTable";

function getApiErrorMessage(error, fallback) {
  return error.response?.data?.detail || fallback;
}

function formatDuration(seconds) {
  if (!seconds) return "-";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

function formatSize(bytes) {
  if (!bytes) return "-";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const emptyForm = {
  title: "",
  class_name: "",
  section: "",
  subject: "",
  academic_year: "",
  description: "",
  teacher_id: "",
};

export default function ScormContent() {
  const [packages, setPackages] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);

  const [formData, setFormData] = useState(emptyForm);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [pageMode, setPageMode] = useState("list");
  const [activePackage, setActivePackage] = useState(null);
  const [progress, setProgress] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return undefined;
    const timeoutId = window.setTimeout(() => setMessage(""), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [message]);

  async function loadPackages() {
    try {
      setLoading(true);
      const response = await API.get("/scorm/packages");
      setPackages(response.data || []);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load SCORM content."));
    } finally {
      setLoading(false);
    }
  }

  async function loadPickLists() {
    const [classesRes, subjectsRes, yearsRes, teachersRes] = await Promise.allSettled([
      API.get("/classes/"), API.get("/subjects/"), API.get("/academic-years/"), API.get("/teachers/"),
    ]);
    setClasses(classesRes.status === "fulfilled" ? classesRes.value.data || [] : []);
    setSubjects(subjectsRes.status === "fulfilled" ? subjectsRes.value.data || [] : []);
    setAcademicYears(yearsRes.status === "fulfilled" ? yearsRes.value.data || [] : []);
    setTeachers(teachersRes.status === "fulfilled" ? teachersRes.value.data || [] : []);
  }

  useEffect(() => {
    loadPackages();
    loadPickLists();
  }, []);

  const classNames = [...new Set(classes.map((c) => c.class_name).filter(Boolean))];
  const sectionsForClass = [
    ...new Set(classes.filter((c) => c.class_name === formData.class_name).map((c) => c.section).filter(Boolean)),
  ];

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) {
      setMessage("Choose a SCORM .zip package to upload.");
      return;
    }
    if (!formData.title.trim() || !formData.class_name.trim()) {
      setMessage("Title and class are required.");
      return;
    }

    const body = new FormData();
    body.append("file", file);
    body.append("title", formData.title.trim());
    body.append("class_name", formData.class_name.trim());
    if (formData.section) body.append("section", formData.section);
    if (formData.subject) body.append("subject", formData.subject);
    if (formData.academic_year) body.append("academic_year", formData.academic_year);
    if (formData.description) body.append("description", formData.description);
    if (formData.teacher_id) body.append("teacher_id", formData.teacher_id);

    try {
      setUploading(true);
      // The zip is unpacked and its manifest read server-side, so this can
      // take a moment on a large package.
      await API.post("/scorm/packages", body);
      setMessage("Package uploaded and unpacked.");
      setFormData(emptyForm);
      setFile(null);
      setPageMode("list");
      await loadPackages();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to upload that package."));
    } finally {
      setUploading(false);
    }
  }

  async function publish(pkg) {
    try {
      await API.put(`/scorm/packages/${pkg.id}`, { status: "Published" });
      setMessage("Published — learners can open it now.");
      await loadPackages();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to publish."));
    }
  }

  async function remove(id) {
    if (!window.confirm("Delete this package and its unpacked files?")) return;
    try {
      await API.delete(`/scorm/packages/${id}`);
      setMessage("Package deleted.");
      await loadPackages();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to delete."));
    }
  }

  async function openProgress(pkg) {
    setActivePackage(pkg);
    setProgress(null);
    setPageMode("progress");
    try {
      const response = await API.get(`/scorm/packages/${pkg.id}/progress`);
      setProgress(response.data);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load progress."));
    }
  }

  const filtered = packages.filter((p) =>
    `${p.title} ${p.class_name} ${p.subject} ${p.scorm_version} ${p.status}`
      .toLowerCase()
      .includes(searchText.toLowerCase())
  );

  if (pageMode === "form") {
    return (
      <div className="management-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Academics</p>
            <h2>Upload SCORM Package</h2>
          </div>
          <button type="button" className="light-button" onClick={() => setPageMode("list")}>
            <ArrowLeft size={17} /> Back
          </button>
        </section>
        {message && <div className="toast-notification">{message}</div>}

        <section className="form-panel">
          <div className="panel-header">
            <div>
              <h3>Package details</h3>
              <p>
                A SCORM 1.2 or 2004 .zip exported from your authoring tool. The manifest is read
                on upload for the entry point, version and mastery score.
              </p>
            </div>
          </div>
          <form className="classic-form" onSubmit={handleUpload}>
            <div className="form-grid">
              <div className="form-field">
                <label>Package file (.zip) *</label>
                <input type="file" accept=".zip,application/zip" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                {file && <small>{file.name} — {formatSize(file.size)}</small>}
              </div>
              <div className="form-field">
                <label>Title *</label>
                <input type="text" name="title" value={formData.title} onChange={handleChange} required />
              </div>
              <div className="form-field">
                <label>Class *</label>
                <select
                  name="class_name"
                  value={formData.class_name}
                  onChange={(e) => { handleChange(e); setFormData((prev) => ({ ...prev, section: "" })); }}
                  required
                >
                  <option value="">Select Class</option>
                  {classNames.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Section</label>
                <select name="section" value={formData.section} onChange={handleChange} disabled={!formData.class_name}>
                  <option value="">All sections</option>
                  {sectionsForClass.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Subject</label>
                <select name="subject" value={formData.subject} onChange={handleChange}>
                  <option value="">Select Subject</option>
                  {subjects.filter((s) => s.is_active !== false).map((s) => (
                    <option key={s.id} value={s.subject_name}>{s.subject_name}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Teacher</label>
                <select name="teacher_id" value={formData.teacher_id} onChange={handleChange}>
                  <option value="">Select Teacher</option>
                  {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Academic Year</label>
                <select name="academic_year" value={formData.academic_year} onChange={handleChange}>
                  <option value="">Select Academic Year</option>
                  {academicYears.map((y) => <option key={y.id} value={y.name}>{y.name}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Description</label>
                <textarea name="description" value={formData.description} onChange={handleChange} rows={3} />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="primary-button" disabled={uploading}>
                <Upload size={18} /> {uploading ? "Uploading…" : "Upload Package"}
              </button>
              <button type="button" className="light-button" onClick={() => setPageMode("list")}>Cancel</button>
            </div>
          </form>
        </section>
      </div>
    );
  }

  if (pageMode === "progress" && activePackage) {
    return (
      <div className="management-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Academics</p>
            <h2>Progress — {activePackage.title}</h2>
          </div>
          <button type="button" className="light-button" onClick={() => setPageMode("list")}>
            <ArrowLeft size={17} /> Back
          </button>
        </section>
        {message && <div className="toast-notification">{message}</div>}

        {!progress ? (
          <div className="message-box">Loading…</div>
        ) : (
          <>
            <section className="summary-strip report-summary-grid">
              <div className="summary-card">
                <Users size={22} />
                <div><span>Students</span><strong>{progress.total_students}</strong></div>
              </div>
              <div className="summary-card positive">
                <CheckCircle2 size={22} />
                <div><span>Completed</span><strong>{progress.completed_count}</strong></div>
              </div>
            </section>
            <div className="table-wrapper">
              <table className="classic-table">
                <thead>
                  <tr>
                    <th>Student</th><th>Admission No</th><th>Status</th><th>Score</th>
                    <th>Time</th><th>Sessions</th><th>Last opened</th>
                  </tr>
                </thead>
                <tbody>
                  {progress.rows.map((row) => (
                    <tr key={row.student_id}>
                      <td>{row.student_name}</td>
                      <td>{row.admission_no || "-"}</td>
                      <td>
                        <span className={
                          ["completed", "passed"].includes(row.lesson_status) ? "status active"
                            : row.lesson_status === "failed" ? "status danger" : "status pending"
                        }>
                          {row.lesson_status}
                        </span>
                      </td>
                      <td>{row.score_raw ?? "-"}</td>
                      <td>{formatDuration(row.total_time_seconds)}</td>
                      <td>{row.session_count || 0}</td>
                      <td>{row.last_accessed_at ? new Date(`${row.last_accessed_at}Z`).toLocaleString() : "-"}</td>
                    </tr>
                  ))}
                  {!progress.rows.length && <tr><td colSpan={7}>No students in this class yet.</td></tr>}
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
          <h2>SCORM Content</h2>
          <p>Interactive course packages that report their own progress and scores back to the ERP.</p>
        </div>
        <div className="module-header-actions">
          <button type="button" className="primary-button" onClick={() => { setFormData(emptyForm); setFile(null); setPageMode("form"); }}>
            <PlusCircle size={18} /> Upload Package
          </button>
        </div>
      </section>

      {message && <div className="toast-notification">{message}</div>}

      <EnhancedRecordsTable
        data={filtered}
        emptyText="No SCORM packages uploaded yet."
        loading={loading}
        loadingText="Loading packages..."
        searchPlaceholder="Search title, class, subject..."
        searchText={searchText}
        setSearchText={setSearchText}
        columns={[
          { key: "title", label: "Title", render: (p) => p.title },
          { key: "class_name", label: "Class", render: (p) => [p.class_name, p.section].filter(Boolean).join(" - ") },
          { key: "subject", label: "Subject", render: (p) => p.subject || "-" },
          { key: "scorm_version", label: "SCORM", render: (p) => p.scorm_version },
          { key: "mastery_score", label: "Pass mark", render: (p) => p.mastery_score ?? "-" },
          { key: "package_bytes", label: "Size", render: (p) => formatSize(p.package_bytes) },
          {
            key: "status",
            label: "Status",
            render: (p) => (
              <span className={p.status === "Published" ? "status active" : p.status === "Archived" ? "status inactive" : "status pending"}>
                {p.status}
              </span>
            ),
            value: (p) => p.status,
          },
          {
            key: "attempt_count",
            label: "Learners",
            render: (p) => (
              <button type="button" className="text-link-button" onClick={() => openProgress(p)}>
                {p.attempt_count || 0} started · {p.completed_count || 0} done
              </button>
            ),
            value: (p) => p.attempt_count || 0,
          },
          {
            key: "actions",
            label: "Actions",
            hideable: false,
            actions: false,
            render: (p) => (
              <div className="action-buttons">
                {p.status !== "Published" && (
                  <button type="button" className="edit-button" onClick={() => publish(p)} title="Publish">
                    <CheckCircle2 size={15} />
                  </button>
                )}
                <button type="button" className="delete-button" onClick={() => remove(p.id)} title="Delete">
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
