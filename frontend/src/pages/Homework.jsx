import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Edit,
  ExternalLink,
  Inbox,
  PlusCircle,
  Trash2,
} from "lucide-react";

import API from "../api";
import EnhancedRecordsTable from "../components/EnhancedRecordsTable";
import { resolveFileUrl } from "../utils/files";

const emptyForm = {
  academic_year: "",
  class_name: "",
  section: "",
  subject: "",
  title: "",
  description: "",
  due_date: "",
  attachment_url: "",
  max_marks: "",
  accepts_submissions: true,
  allow_late_submission: true,
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
  const [activeAssignment, setActiveAssignment] = useState(null);
  const [board, setBoard] = useState(null);
  const [grades, setGrades] = useState({});
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
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
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
      max_marks: formData.max_marks === "" ? null : Number(formData.max_marks),
      accepts_submissions: !!formData.accepts_submissions,
      allow_late_submission: !!formData.allow_late_submission,
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
      max_marks: assignment.max_marks ?? "",
      accepts_submissions: assignment.accepts_submissions !== false,
      allow_late_submission: assignment.allow_late_submission !== false,
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
    setActiveAssignment(null);
    setBoard(null);
    setGrades({});
    setMessage("");
    setPageMode("list");
  }

  async function openSubmissions(assignment) {
    setActiveAssignment(assignment);
    setBoard(null);
    setGrades({});
    setPageMode("submissions");
    await loadBoard(assignment.id);
  }

  async function loadBoard(assignmentId) {
    try {
      const response = await API.get(`/homework/${assignmentId}/submissions`);
      setBoard(response.data);
      // Seed the grade inputs from what is already recorded, so a teacher
      // correcting one mark doesn't wipe the rest of the row.
      setGrades(
        Object.fromEntries(
          (response.data.submissions || []).map((s) => [
            s.id,
            { marks_awarded: s.marks_awarded ?? "", feedback: s.feedback ?? "" },
          ])
        )
      );
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load submissions."));
    }
  }

  function updateGrade(submissionId, field, value) {
    setGrades((prev) => ({
      ...prev,
      [submissionId]: { ...(prev[submissionId] || {}), [field]: value },
    }));
  }

  async function saveGrade(submission) {
    const entry = grades[submission.id] || {};
    try {
      await API.put(
        `/homework/${activeAssignment.id}/submissions/${submission.id}/grade`,
        {
          marks_awarded: entry.marks_awarded === "" ? null : Number(entry.marks_awarded),
          feedback: (entry.feedback || "").trim() || null,
        }
      );
      setMessage("Grade saved — the family can see it in the portal.");
      await loadBoard(activeAssignment.id);
      await loadAssignments();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to save grade."));
    }
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
            <label>Marks</label>
            <input
              type="number"
              name="max_marks"
              min="0"
              step="0.5"
              value={formData.max_marks}
              onChange={handleChange}
              placeholder="Out of — leave blank if not scored"
            />
          </div>
          <div className="form-field">
            <label>Submissions</label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
              <input
                type="checkbox"
                name="accepts_submissions"
                checked={formData.accepts_submissions}
                onChange={handleChange}
              />
              Students hand this in through the portal
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
              <input
                type="checkbox"
                name="allow_late_submission"
                checked={formData.allow_late_submission}
                onChange={handleChange}
                disabled={!formData.accepts_submissions}
              />
              Accept work after the due date (flagged late)
            </label>
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

  if (pageMode === "submissions" && activeAssignment) {
    return (
      <div className="management-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Academics</p>
            <h2>Submissions — {activeAssignment.title}</h2>
            <p>
              {[activeAssignment.class_name, activeAssignment.section].filter(Boolean).join(" - ")}
              {activeAssignment.subject ? ` · ${activeAssignment.subject}` : ""}
              {activeAssignment.due_date ? ` · due ${activeAssignment.due_date}` : ""}
              {activeAssignment.max_marks != null ? ` · out of ${activeAssignment.max_marks}` : ""}
            </p>
          </div>
          <button type="button" className="light-button" onClick={handleCancelEdit}>
            <ArrowLeft size={17} />
            Back
          </button>
        </section>

        {message && <div className="toast-notification">{message}</div>}

        {!board ? (
          <div className="message-box">Loading…</div>
        ) : (
          <>
            <section className="summary-strip report-summary-grid">
              <div className="summary-card">
                <Inbox size={22} />
                <div>
                  <span>Handed In</span>
                  <strong>{board.submitted_count} / {board.total_students}</strong>
                </div>
              </div>
              <div className="summary-card positive">
                <CheckCircle2 size={22} />
                <div>
                  <span>Graded</span>
                  <strong>{board.graded_count}</strong>
                </div>
              </div>
              <div className="summary-card warning">
                <ClipboardList size={22} />
                <div>
                  <span>Late</span>
                  <strong>{board.late_count}</strong>
                </div>
              </div>
            </section>

            <div className="table-wrapper">
              <table className="classic-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Admission No</th>
                    <th>Submitted</th>
                    <th>Work</th>
                    <th>Marks</th>
                    <th>Feedback</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {board.submissions.map((submission) => (
                    <tr key={submission.id}>
                      <td>{submission.student_name_snapshot || "-"}</td>
                      <td>{submission.admission_no || "-"}</td>
                      <td>
                        {submission.submitted_at
                          ? new Date(`${submission.submitted_at}Z`).toLocaleString()
                          : "-"}
                        {submission.is_late && <span className="status danger">Late</span>}
                        {submission.submitted_by && (
                          <small style={{ display: "block" }}>by {submission.submitted_by}</small>
                        )}
                      </td>
                      <td>
                        {submission.content && <div>{submission.content}</div>}
                        {submission.attachment_url && (
                          <a
                            href={resolveFileUrl(submission.attachment_url)}
                            target="_blank"
                            rel="noreferrer"
                            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                          >
                            Open file <ExternalLink size={13} />
                          </a>
                        )}
                        {!submission.content && !submission.attachment_url && "-"}
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          style={{ width: 80 }}
                          value={grades[submission.id]?.marks_awarded ?? ""}
                          onChange={(e) => updateGrade(submission.id, "marks_awarded", e.target.value)}
                        />
                        {activeAssignment.max_marks != null && ` / ${activeAssignment.max_marks}`}
                      </td>
                      <td>
                        <input
                          type="text"
                          value={grades[submission.id]?.feedback ?? ""}
                          onChange={(e) => updateGrade(submission.id, "feedback", e.target.value)}
                          placeholder="Comments for the family"
                        />
                      </td>
                      <td>
                        <button type="button" className="primary-button" onClick={() => saveGrade(submission)}>
                          {submission.status === "Graded" ? "Update" : "Grade"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {board.pending_students.map((student) => (
                    <tr key={`p-${student.student_id}`}>
                      <td>{student.student_name}</td>
                      <td>{student.admission_no || "-"}</td>
                      <td colSpan={5}>
                        <span className="status pending">Not handed in</span>
                      </td>
                    </tr>
                  ))}
                  {!board.total_students && (
                    <tr>
                      <td colSpan={7}>No students in this class yet.</td>
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
          {
            key: "submission_count",
            label: "Handed In",
            render: (a) =>
              a.accepts_submissions === false ? (
                "Not collected"
              ) : (
                <button type="button" className="text-link-button" onClick={() => openSubmissions(a)}>
                  {a.submission_count || 0} in · {a.graded_count || 0} graded
                </button>
              ),
            value: (a) => a.submission_count || 0,
          },
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
