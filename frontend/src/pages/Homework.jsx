import { useEffect, useState } from "react";
import { ArrowLeft, Edit, Trash2, PlusCircle, ClipboardList } from "lucide-react";

import API from "../api";
import EnhancedRecordsTable from "../components/EnhancedRecordsTable";

const emptyForm = {
  academic_year: "",
  class_name: "",
  section: "",
  subject: "",
  title: "",
  description: "",
  due_date: "",
  attachment_url: "",
  teacher_id: "",
};

function getApiErrorMessage(error, fallback) {
  return error.response?.data?.detail || fallback;
}

export default function Homework() {
  const [assignments, setAssignments] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [formData, setFormData] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [pageMode, setPageMode] = useState("list");
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return undefined;
    const timeoutId = window.setTimeout(() => setMessage(""), 2000);
    return () => window.clearTimeout(timeoutId);
  }, [message]);

  async function loadAssignments() {
    try {
      setLoading(true);
      const response = await API.get("/homework/");
      setAssignments(response.data || []);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load assignments."));
    } finally {
      setLoading(false);
    }
  }

  async function loadTeachers() {
    try {
      const response = await API.get("/teachers/");
      setTeachers(response.data || []);
    } catch {
      setTeachers([]);
    }
  }

  // Sourced from their own modules rather than typed in, so homework can only
  // be assigned to a class/section that actually exists.
  async function loadPickLists() {
    const [classesRes, subjectsRes, yearsRes] = await Promise.allSettled([
      API.get("/classes/"),
      API.get("/subjects/"),
      API.get("/academic-years/"),
    ]);
    setClasses(classesRes.status === "fulfilled" ? classesRes.value.data || [] : []);
    setSubjects(subjectsRes.status === "fulfilled" ? subjectsRes.value.data || [] : []);
    setAcademicYears(yearsRes.status === "fulfilled" ? yearsRes.value.data || [] : []);
  }

  useEffect(() => {
    loadAssignments();
    loadTeachers();
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
      due_date: formData.due_date || null,
      attachment_url: formData.attachment_url.trim() || null,
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

    try {
      if (editingId) {
        await API.put(`/homework/${editingId}`, payload);
        setMessage("Assignment updated successfully.");
      } else {
        await API.post("/homework/", payload);
        setMessage("Assignment posted successfully.");
      }
      setFormData(emptyForm);
      setEditingId(null);
      setPageMode("list");
      await loadAssignments();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to save assignment."));
    }
  }

  function handleEdit(assignment) {
    setEditingId(assignment.id);
    setPageMode("form");
    setFormData({
      academic_year: assignment.academic_year || "",
      class_name: assignment.class_name || "",
      section: assignment.section || "",
      subject: assignment.subject || "",
      title: assignment.title || "",
      description: assignment.description || "",
      due_date: assignment.due_date || "",
      attachment_url: assignment.attachment_url || "",
      teacher_id: assignment.teacher_id || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this assignment?")) return;
    try {
      await API.delete(`/homework/${id}`);
      setMessage("Assignment deleted successfully.");
      await loadAssignments();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to delete assignment."));
    }
  }

  function handleCancelEdit() {
    setEditingId(null);
    setFormData(emptyForm);
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

  const filteredAssignments = assignments.filter((item) => {
    const fullText = `${item.class_name} ${item.section} ${item.subject} ${item.title} ${item.teacher_name_snapshot}`.toLowerCase();
    return fullText.includes(searchText.toLowerCase());
  });

  const assignmentForm = (
    <section className="form-panel">
      <div className="panel-header">
        <div>
          <h3>{editingId ? "Edit Assignment" : "Post Assignment"}</h3>
          <p>Visible to every guardian of a matching class + section in the portal.</p>
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
            <select name="section" value={formData.section} onChange={handleChange} disabled={!formData.class_name}>
              <option value="">All sections</option>
              {sectionsForClass.map((section) => (
                <option key={section} value={section}>{section}</option>
              ))}
            </select>
            <small>{formData.class_name ? "Blank covers every section." : "Pick a class first."}</small>
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
            <label>Teacher</label>
            <select name="teacher_id" value={formData.teacher_id} onChange={handleChange}>
              <option value="">Select Teacher</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Due Date</label>
            <input type="date" name="due_date" value={formData.due_date} onChange={handleChange} />
          </div>
          <div className="form-field">
            <label>Title *</label>
            <input type="text" name="title" value={formData.title} onChange={handleChange} required />
          </div>
          <div className="form-field">
            <label>Attachment URL</label>
            <input type="text" name="attachment_url" value={formData.attachment_url} onChange={handleChange} placeholder="Optional link to worksheet/resource" />
          </div>
          <div className="form-field">
            <label>Description</label>
            <textarea name="description" value={formData.description} onChange={handleChange} rows={3} />
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="primary-button">
            <PlusCircle size={18} />
            {editingId ? "Update Assignment" : "Post Assignment"}
          </button>
          <button type="button" className="light-button" onClick={handleCancelEdit}>
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
            <p className="eyebrow">Academics</p>
            <h2>{editingId ? "Edit Assignment" : "Post Assignment"}</h2>
          </div>
          <button type="button" className="light-button" onClick={handleCancelEdit}>
            <ArrowLeft size={17} />
            Back
          </button>
        </section>
        {message && <div className="toast-notification">{message}</div>}
        {assignmentForm}
      </div>
    );
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Academics</p>
          <h2>Homework</h2>
          <p>Post assignments for a class — guardians see them instantly in the parent portal.</p>
        </div>
        <div className="module-header-actions">
          <button type="button" className="primary-button" onClick={handleAdd}>
            <PlusCircle size={18} />
            Post Assignment
          </button>
        </div>
      </section>

      <section className="summary-strip report-summary-grid">
        <div className="summary-card">
          <ClipboardList size={22} />
          <div>
            <span>Total Assignments</span>
            <strong>{assignments.length}</strong>
          </div>
        </div>
      </section>

      {message && <div className="toast-notification">{message}</div>}

      <EnhancedRecordsTable
        data={filteredAssignments}
        emptyText="No assignments posted yet."
        loading={loading}
        loadingText="Loading assignments..."
        searchPlaceholder="Search class, subject, title, teacher..."
        searchText={searchText}
        setSearchText={setSearchText}
        columns={[
          { key: "class_name", label: "Class", render: (a) => [a.class_name, a.section].filter(Boolean).join(" - ") || "-" },
          { key: "subject", label: "Subject", render: (a) => a.subject || "-" },
          { key: "title", label: "Title", render: (a) => a.title },
          { key: "due_date", label: "Due Date", render: (a) => a.due_date || "-" },
          { key: "teacher_name_snapshot", label: "Teacher", render: (a) => a.teacher_name_snapshot || "-" },
          {
            key: "actions",
            label: "Actions",
            hideable: false,
            actions: false,
            render: (a) => (
              <div className="action-buttons">
                <button type="button" className="edit-button" onClick={() => handleEdit(a)} title="Edit">
                  <Edit size={15} />
                </button>
                <button type="button" className="delete-button" onClick={() => handleDelete(a.id)} title="Delete">
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
