import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  Users,
  GraduationCap,
  PlusCircle,
  Trash2,
  RefreshCcw,
  Edit,
  X,
} from "lucide-react";

import { getMasterValues } from "../services/masterDataService";

import API from "../api";

const emptyMappingForm = {
  subject_name: "",
  teacher_id: "",
  weekly_periods: 0,
  is_active: true,
};

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

  if (detail && typeof detail === "object") {
    return detail.msg || JSON.stringify(detail);
  }

  return fallbackMessage;
}

function getTeacherLabel(teacher) {
  if (!teacher) return "-";

  const name = teacher.name || "Unknown Teacher";
  const department = teacher.department || "No Department";

  return `${name} : ${department}`;
}

function getSubjectLabel(subject) {
  if (!subject) return "-";

  const code = subject.subject_code || "";
  const name = subject.subject_name || "Unknown Subject";

  return code ? `${code} - ${name}` : name;
}

export default function ClassDetails() {
  const { classId } = useParams();
  const navigate = useNavigate();

  const [classRecord, setClassRecord] = useState(null);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
const [subjectOptions, setSubjectOptions] = useState([]);
  const [classSubjects, setClassSubjects] = useState([]);

  const [formData, setFormData] = useState(emptyMappingForm);
  const [editingMappingId, setEditingMappingId] = useState(null);

  const [activeTab, setActiveTab] = useState("students");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadClass() {
    try {
      const response = await API.get(`/classes/${classId}`);
      setClassRecord(response.data);
    } catch (error) {
      const response = await API.get("/classes/");
      const foundClass = (response.data || []).find(
        (item) => String(item.id) === String(classId)
      );
      setClassRecord(foundClass || null);
    }
  }

  async function loadStudents() {
    const response = await API.get("/students/");
    setStudents(response.data || []);
  }

  async function loadTeachers() {
    const response = await API.get("/teachers/");
    setTeachers(response.data || []);
  }

 async function loadSubjects() {
  const values = await getMasterValues("Subject");
  setSubjectOptions(values || []);
}

  async function loadClassSubjects() {
    const response = await API.get(`/class-subjects/?class_id=${classId}`);
    setClassSubjects(response.data || []);
  }

  async function loadPageData() {
    try {
      setLoading(true);
      setMessage("");

      await Promise.all([
        loadClass(),
        loadStudents(),
        loadTeachers(),
        loadSubjects(),
        loadClassSubjects(),
      ]);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load class details."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPageData();
  }, [classId]);

  const teacherMap = useMemo(() => {
    const map = {};

    teachers.forEach((teacher) => {
      map[teacher.id] = teacher;
    });

    return map;
  }, [teachers]);



  const classStudents = useMemo(() => {
    if (!classRecord) return [];

    return students.filter((student) => {
      if (student.class_id) {
        return String(student.class_id) === String(classRecord.id);
      }

      return (
        student.class_name === classRecord.class_name &&
        student.section === classRecord.section
      );
    });
  }, [students, classRecord]);

  const activeTeachers = useMemo(() => {
    return teachers.filter(
      (teacher) => String(teacher.status || "Active").toLowerCase() === "active"
    );
  }, [teachers]);

  const availableSubjects = useMemo(() => {
    const alreadyMappedSubjects = new Set(
      classSubjects
        .filter((item) => String(item.id) !== String(editingMappingId))
        .map((item) => item.subject_name)
    );

    return subjectOptions.filter(
      (subject) => !alreadyMappedSubjects.has(subject)
    );
  }, [subjectOptions, classSubjects, editingMappingId]);

  function getClassTeacherName() {
    if (!classRecord) return "-";

    if (classRecord.class_teacher_id && teacherMap[classRecord.class_teacher_id]) {
      return getTeacherLabel(teacherMap[classRecord.class_teacher_id]);
    }

    return classRecord.class_teacher || "-";
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function buildPayload() {
    return {
      class_id: Number(classId),
      subject_name: formData.subject_name || "",
      teacher_id: formData.teacher_id ? Number(formData.teacher_id) : null,
      weekly_periods: Number(formData.weekly_periods || 0),
      is_active: Boolean(formData.is_active),
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage("");

    try {
      const payload = buildPayload();

      if (!payload.subject_name) {
        setMessage("Subject is required.");
        return;
      }

      if (editingMappingId) {
        await API.put(`/class-subjects/${editingMappingId}`, payload);
        setMessage("Class subject mapping updated successfully.");
      } else {
        await API.post("/class-subjects/", payload);
        setMessage("Subject mapped to class successfully.");
      }

      setFormData(emptyMappingForm);
      setEditingMappingId(null);
      await loadClassSubjects();
    } catch (error) {
      console.error(error);
      setMessage(
        getApiErrorMessage(
          error,
          "Something went wrong while saving class subject mapping."
        )
      );
    }
  }

  function handleEdit(mapping) {
    setEditingMappingId(mapping.id);

    setFormData({
      subject_name: mapping.subject_name || "",
      teacher_id: mapping.teacher_id || "",
      weekly_periods: mapping.weekly_periods || 0,
      is_active: Boolean(mapping.is_active),
    });

    setActiveTab("subjects");
  }

  async function handleDelete(mappingId) {
    const confirmDelete = window.confirm(
      "Are you sure you want to remove this subject from the class?"
    );

    if (!confirmDelete) return;

    try {
      await API.delete(`/class-subjects/${mappingId}`);
      setMessage("Subject removed from class successfully.");

      if (editingMappingId === mappingId) {
        setEditingMappingId(null);
        setFormData(emptyMappingForm);
      }

      await loadClassSubjects();
    } catch (error) {
      console.error(error);
      setMessage(
        getApiErrorMessage(error, "Unable to remove subject from class.")
      );
    }
  }

  function handleCancelEdit() {
    setEditingMappingId(null);
    setFormData(emptyMappingForm);
    setMessage("");
  }

  if (loading && !classRecord) {
    return (
      <div className="management-page">
        <div className="loading-box">Loading class details...</div>
      </div>
    );
  }

  if (!classRecord) {
    return (
      <div className="management-page">
        <button
          type="button"
          className="light-button"
          onClick={() => navigate("/classes")}
        >
          <ArrowLeft size={17} />
          Back to Classes
        </button>

        <div className="empty-table">Class not found.</div>
      </div>
    );
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Class Details</p>
          <h2>
            {classRecord.class_name || "-"} - Section{" "}
            {classRecord.section || "-"}
          </h2>
          <p>
            Manage students and subject-teacher mapping for this class.
          </p>
        </div>

        <div className="module-header-actions">
          <button
            type="button"
            className="light-button"
            onClick={() => navigate("/classes")}
          >
            <ArrowLeft size={17} />
            Back
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={loadPageData}
          >
            <RefreshCcw size={17} />
            Refresh
          </button>
        </div>
      </section>

      <section className="summary-strip report-summary-grid">
        <div className="summary-card">
          <BookOpen size={22} />
          <div>
            <span>Class</span>
            <strong>{classRecord.class_name || "-"}</strong>
          </div>
        </div>

        <div className="summary-card">
          <GraduationCap size={22} />
          <div>
            <span>Class Teacher</span>
            <strong>{getClassTeacherName()}</strong>
          </div>
        </div>

        <div className="summary-card">
          <Users size={22} />
          <div>
            <span>Students</span>
            <strong>{classStudents.length}</strong>
          </div>
        </div>

        <div className="summary-card warning">
          <BookOpen size={22} />
          <div>
            <span>Mapped Subjects</span>
            <strong>{classSubjects.length}</strong>
          </div>
        </div>
      </section>

      {message && <div className="message-box">{message}</div>}

      <section className="table-panel">
        <div className="tabs-row">
          <button
            type="button"
            className={activeTab === "students" ? "tab active" : "tab"}
            onClick={() => setActiveTab("students")}
          >
            Students
          </button>

          <button
            type="button"
            className={activeTab === "subjects" ? "tab active" : "tab"}
            onClick={() => setActiveTab("subjects")}
          >
            Subjects
          </button>

          <button
            type="button"
            className={activeTab === "details" ? "tab active" : "tab"}
            onClick={() => setActiveTab("details")}
          >
            Details
          </button>
        </div>
      </section>

      {activeTab === "details" && (
        <section className="form-panel">
          <div className="panel-header">
            <div>
              <h3>Class Information</h3>
              <p>Basic class and class teacher details.</p>
            </div>
          </div>

          <div className="drawer-section">
            <p>Class: {classRecord.class_name || "-"}</p>
            <p>Section: {classRecord.section || "-"}</p>
            <p>Class Teacher: {getClassTeacherName()}</p>
            <p>Room No: {classRecord.room_no || "-"}</p>
            <p>Total Students: {classStudents.length}</p>
            <p>Total Subjects: {classSubjects.length}</p>
          </div>
        </section>
      )}

      {activeTab === "students" && (
        <section className="table-panel">
          <div className="table-toolbar">
            <div>
              <h3>Students in this Class</h3>
              <p>{classStudents.length} student record(s) found</p>
            </div>
          </div>

          <div className="table-wrapper">
            <table className="classic-table">
              <thead>
                <tr>
                  <th>Admission No</th>
                  <th>Student Name</th>
                  <th>Gender</th>
                  <th>Roll No</th>
                  <th>Parent Contact</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {classStudents.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="empty-table">
                      No students are assigned to this class.
                    </td>
                  </tr>
                ) : (
                  classStudents.map((student) => (
                    <tr key={student.id}>
                      <td>{student.admission_no || "-"}</td>
                      <td>{student.name || student.student_name || "-"}</td>
                      <td>{student.gender || "-"}</td>
                      <td>{student.roll_no || "-"}</td>
                      <td>
                        {student.parent_contact ||
                          student.guardian_phone ||
                          student.phone ||
                          "-"}
                      </td>
                      <td>
                        <span className="status active">
                          {student.status || "Active"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "subjects" && (
        <>
          <section className="form-panel">
            <div className="panel-header">
              <div>
                <h3>
                  {editingMappingId
                    ? "Edit Subject Mapping"
                    : "Map Subject to Class"}
                </h3>
                <p>
                  Assign subjects and subject teachers for this class.
                </p>
              </div>
            </div>

            <form className="classic-form" onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="form-field">
                  <label>Subject *</label>
                  <select
                    name="subject_name"
                    value={formData.subject_name}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select Subject</option>

                    {availableSubjects.map((subject) => (
                      <option key={subject} value={subject}>
                        {subject}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label>Subject Teacher</label>
                  <select
                    name="teacher_id"
                    value={formData.teacher_id}
                    onChange={handleChange}
                  >
                    <option value="">Select Teacher</option>

                    {activeTeachers.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {getTeacherLabel(teacher)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label>Weekly Periods</label>
                  <input
                    type="number"
                    name="weekly_periods"
                    min="0"
                    value={formData.weekly_periods}
                    onChange={handleChange}
                  />
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
                  {editingMappingId ? "Update Mapping" : "Add Subject"}
                </button>

                {editingMappingId && (
                  <button
                    type="button"
                    className="light-button"
                    onClick={handleCancelEdit}
                  >
                    <X size={17} />
                    Cancel Edit
                  </button>
                )}
              </div>
            </form>
          </section>

          <section className="table-panel">
            <div className="table-toolbar">
              <div>
                <h3>Subjects Mapped to this Class</h3>
                <p>{classSubjects.length} subject mapping(s) found</p>
              </div>
            </div>

            <div className="table-wrapper">
              <table className="classic-table">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Subject Teacher</th>
                    <th>Weekly Periods</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {classSubjects.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="empty-table">
                        No subjects are mapped to this class yet.
                      </td>
                    </tr>
                  ) : (
                    classSubjects.map((mapping) => (
                      <tr key={mapping.id}>
                        <td>{mapping.subject_name || "-"}</td>
                        <td>{getTeacherLabel(teacherMap[mapping.teacher_id])}</td>
                        <td>{mapping.weekly_periods ?? 0}</td>
                        <td>
                          <span
                            className={
                              mapping.is_active
                                ? "status active"
                                : "status danger"
                            }
                          >
                            {mapping.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td>
                          <div className="action-buttons">
                            <button
                              type="button"
                              className="edit-button"
                              onClick={() => handleEdit(mapping)}
                              title="Edit"
                            >
                              <Edit size={15} />
                            </button>

                            <button
                              type="button"
                              className="delete-button"
                              onClick={() => handleDelete(mapping.id)}
                              title="Remove"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}