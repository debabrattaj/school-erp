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

import API from "../api";

const emptyMappingForm = {
  subject_id: "",
  subject_name: "",
  teacher_id: "",
  weekly_periods: 0,
  is_active: true,
};

const emptyExamMappingForm = {
  exam_id: "",
  academic_year: "",
  exam_date: "",
  is_active: true,
  remarks: "",
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

function getMappingSubjectLabel(mapping, subjectOptions) {
  const subject = subjectOptions.find(
    (item) => String(item.id) === String(mapping.subject_id)
  );

  if (subject) return getSubjectLabel(subject);

  return mapping.subject_name || "-";
}

function getExamLabel(exam) {
  if (!exam) return "-";
  return exam.exam_name || exam.name || `Exam ID: ${exam.id}`;
}

export default function ClassDetails() {
  const { classId } = useParams();
  const navigate = useNavigate();

  const [classRecord, setClassRecord] = useState(null);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [subjectOptions, setSubjectOptions] = useState([]);
  const [classSubjects, setClassSubjects] = useState([]);
  const [exams, setExams] = useState([]);
  const [classExamMappings, setClassExamMappings] = useState([]);

  const [formData, setFormData] = useState(emptyMappingForm);
  const [editingMappingId, setEditingMappingId] = useState(null);
  const [examFormData, setExamFormData] = useState(emptyExamMappingForm);
  const [editingExamMappingId, setEditingExamMappingId] = useState(null);

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
    const response = await API.get("/subjects/");
    setSubjectOptions(
      (response.data || []).filter((subject) => subject.is_active !== false)
    );
  }

  async function loadClassSubjects() {
    const response = await API.get(`/class-subjects/?class_id=${classId}`);
    setClassSubjects(response.data || []);
  }

  async function loadExams() {
    const response = await API.get("/exams/");
    setExams(response.data || []);
  }

  async function loadClassExamMappings() {
    const response = await API.get(`/class-exam-mappings/?class_id=${classId}`);
    setClassExamMappings(response.data || []);
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
        loadExams(),
        loadClassExamMappings(),
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

  const examMap = useMemo(() => {
    const map = {};

    exams.forEach((exam) => {
      map[exam.id] = exam;
    });

    return map;
  }, [exams]);



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
    const mappedSubjectIds = new Set(
      classSubjects
        .filter((item) => String(item.id) !== String(editingMappingId))
        .map((item) => item.subject_id)
        .filter(Boolean)
        .map(String)
    );
    const mappedSubjectNames = new Set(
      classSubjects
        .filter((item) => String(item.id) !== String(editingMappingId))
        .map((item) => item.subject_name)
        .filter(Boolean)
    );

    return subjectOptions.filter((subject) => {
      if (subject.id && mappedSubjectIds.has(String(subject.id))) {
        return false;
      }

      return !mappedSubjectNames.has(subject.subject_name);
    });
  }, [subjectOptions, classSubjects, editingMappingId]);

  const availableExams = useMemo(() => {
    const mappedExamKeys = new Set(
      classExamMappings
        .filter((item) => String(item.id) !== String(editingExamMappingId))
        .map((item) => `${item.exam_id}:${item.academic_year}`)
    );

    return exams.filter(
      (exam) =>
        !mappedExamKeys.has(`${exam.id}:${examFormData.academic_year}`)
    );
  }, [classExamMappings, editingExamMappingId, examFormData.academic_year, exams]);

  function getClassTeacherName() {
    if (!classRecord) return "-";

    if (classRecord.class_teacher_id && teacherMap[classRecord.class_teacher_id]) {
      return getTeacherLabel(teacherMap[classRecord.class_teacher_id]);
    }

    return classRecord.class_teacher || "-";
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target;

    if (name === "subject_id") {
      const selectedSubject = subjectOptions.find(
        (subject) => String(subject.id) === String(value)
      );

      setFormData((prev) => ({
        ...prev,
        subject_id: value,
        subject_name: selectedSubject?.subject_name || "",
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function handleExamMappingChange(e) {
    const { name, value, type, checked } = e.target;

    setExamFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function buildPayload() {
    return {
      class_id: Number(classId),
      subject_id: formData.subject_id ? Number(formData.subject_id) : null,
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

  function buildExamMappingPayload() {
    return {
      class_id: Number(classId),
      exam_id: examFormData.exam_id ? Number(examFormData.exam_id) : null,
      academic_year: examFormData.academic_year.trim(),
      exam_date: examFormData.exam_date || null,
      is_active: Boolean(examFormData.is_active),
      remarks: examFormData.remarks || null,
    };
  }

  async function handleExamMappingSubmit(e) {
    e.preventDefault();
    setMessage("");

    try {
      const payload = buildExamMappingPayload();

      if (!payload.exam_id) {
        setMessage("Exam is required.");
        return;
      }

      if (!payload.academic_year) {
        setMessage("Academic year is required.");
        return;
      }

      if (editingExamMappingId) {
        await API.put(`/class-exam-mappings/${editingExamMappingId}`, payload);
        setMessage("Class exam mapping updated successfully.");
      } else {
        await API.post("/class-exam-mappings/", payload);
        setMessage("Exam mapped to class successfully.");
      }

      setExamFormData(emptyExamMappingForm);
      setEditingExamMappingId(null);
      await loadClassExamMappings();
    } catch (error) {
      console.error(error);
      setMessage(
        getApiErrorMessage(
          error,
          "Something went wrong while saving class exam mapping."
        )
      );
    }
  }

  function handleEdit(mapping) {
    setEditingMappingId(mapping.id);

    setFormData({
      subject_id:
        mapping.subject_id ||
        subjectOptions.find(
          (subject) => subject.subject_name === mapping.subject_name
        )?.id ||
        "",
      subject_name: mapping.subject_name || "",
      teacher_id: mapping.teacher_id || "",
      weekly_periods: mapping.weekly_periods || 0,
      is_active: Boolean(mapping.is_active),
    });

    setActiveTab("subjects");
  }

  function handleExamMappingEdit(mapping) {
    setEditingExamMappingId(mapping.id);
    setExamFormData({
      exam_id: mapping.exam_id || "",
      academic_year: mapping.academic_year || "",
      exam_date: mapping.exam_date || "",
      is_active: Boolean(mapping.is_active),
      remarks: mapping.remarks || "",
    });
    setActiveTab("exams");
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

  async function handleExamMappingDelete(mappingId) {
    const confirmDelete = window.confirm(
      "Are you sure you want to remove this exam from the class?"
    );

    if (!confirmDelete) return;

    try {
      await API.delete(`/class-exam-mappings/${mappingId}`);
      setMessage("Exam removed from class successfully.");

      if (editingExamMappingId === mappingId) {
        setEditingExamMappingId(null);
        setExamFormData(emptyExamMappingForm);
      }

      await loadClassExamMappings();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to remove exam from class."));
    }
  }

  function handleCancelEdit() {
    setEditingMappingId(null);
    setFormData(emptyMappingForm);
    setEditingExamMappingId(null);
    setExamFormData(emptyExamMappingForm);
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

        <div className="summary-card">
          <GraduationCap size={22} />
          <div>
            <span>Mapped Exams</span>
            <strong>{classExamMappings.length}</strong>
          </div>
        </div>
      </section>

      {message && <div className="message-box">{message}</div>}

      <section className="table-panel tabs-panel">
        <div className="tabs-row tab-strip">
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
            className={activeTab === "exams" ? "tab active" : "tab"}
            onClick={() => setActiveTab("exams")}
          >
            Exams
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
            <p>Total Exams: {classExamMappings.length}</p>
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
                    name="subject_id"
                    value={formData.subject_id}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select Subject</option>

                    {availableSubjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {getSubjectLabel(subject)}
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
                        <td>{getMappingSubjectLabel(mapping, subjectOptions)}</td>
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

      {activeTab === "exams" && (
        <>
          <section className="form-panel">
            <div className="panel-header">
              <div>
                <h3>
                  {editingExamMappingId
                    ? "Edit Exam Mapping"
                    : "Map Exam to Class"}
                </h3>
                <p>Assign exam masters to this class by academic year and date.</p>
              </div>
            </div>

            <form className="classic-form" onSubmit={handleExamMappingSubmit}>
              <div className="form-grid">
                <div className="form-field">
                  <label>Academic Year *</label>
                  <input
                    type="text"
                    name="academic_year"
                    value={examFormData.academic_year}
                    onChange={handleExamMappingChange}
                    placeholder="2026-27"
                    required
                  />
                </div>

                <div className="form-field">
                  <label>Exam *</label>
                  <select
                    name="exam_id"
                    value={examFormData.exam_id}
                    onChange={handleExamMappingChange}
                    required
                  >
                    <option value="">Select Exam</option>
                    {availableExams.map((exam) => (
                      <option key={exam.id} value={exam.id}>
                        {getExamLabel(exam)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label>Exam Date</label>
                  <input
                    type="date"
                    name="exam_date"
                    value={examFormData.exam_date}
                    onChange={handleExamMappingChange}
                  />
                </div>

                <div className="form-field">
                  <label>Status</label>
                  <label className="switch-row">
                    <input
                      type="checkbox"
                      name="is_active"
                      checked={Boolean(examFormData.is_active)}
                      onChange={handleExamMappingChange}
                    />
                    <span>{examFormData.is_active ? "Active" : "Inactive"}</span>
                  </label>
                </div>

                <div className="form-field full-width">
                  <label>Remarks</label>
                  <textarea
                    name="remarks"
                    rows="3"
                    value={examFormData.remarks}
                    onChange={handleExamMappingChange}
                  ></textarea>
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" className="primary-button">
                  <PlusCircle size={18} />
                  {editingExamMappingId ? "Update Mapping" : "Add Exam"}
                </button>

                {editingExamMappingId && (
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
                <h3>Exams Mapped to this Class</h3>
                <p>{classExamMappings.length} exam mapping(s) found</p>
              </div>
            </div>

            <div className="table-wrapper">
              <table className="classic-table">
                <thead>
                  <tr>
                    <th>Exam</th>
                    <th>Academic Year</th>
                    <th>Exam Date</th>
                    <th>Status</th>
                    <th>Remarks</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {classExamMappings.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="empty-table">
                        No exams are mapped to this class yet.
                      </td>
                    </tr>
                  ) : (
                    classExamMappings.map((mapping) => (
                      <tr key={mapping.id}>
                        <td>{getExamLabel(examMap[mapping.exam_id])}</td>
                        <td>{mapping.academic_year || "-"}</td>
                        <td>{mapping.exam_date || "-"}</td>
                        <td>
                          <span
                            className={
                              mapping.is_active ? "status active" : "status danger"
                            }
                          >
                            {mapping.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td>{mapping.remarks || "-"}</td>
                        <td>
                          <div className="action-buttons">
                            <button
                              type="button"
                              className="edit-button"
                              onClick={() => handleExamMappingEdit(mapping)}
                              title="Edit"
                            >
                              <Edit size={15} />
                            </button>

                            <button
                              type="button"
                              className="delete-button"
                              onClick={() => handleExamMappingDelete(mapping.id)}
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
