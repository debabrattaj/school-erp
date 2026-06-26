import { useEffect, useMemo, useState } from "react";
import {
  Edit,
  Trash2,
  PlusCircle,
  Search,
  RefreshCcw,
  FileText,
  Award,
  XCircle,
  CheckCircle,
} from "lucide-react";

import API from "../api";

const emptyMarkForm = {
  student_id: "",
  exam_id: "",
  class_subject_id: "",
  subject_name: "",
  marks_obtained: "",
  max_marks: 100,
  grade: "",
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

function getStudentName(student) {
  if (!student) return "-";

  const admissionNo = student.admission_no || "";
  const name = student.name || student.student_name || "Unknown Student";

  return admissionNo ? `${admissionNo} - ${name}` : name;
}

function getExamName(exam) {
  if (!exam) return "-";

  return (
    exam.exam_name ||
    exam.name ||
    exam.exam_title ||
    exam.title ||
    `Exam ID: ${exam.id}`
  );
}

function getClassLabelFromStudent(student) {
  if (!student) return "-";

  const className = student.class_name || "";
  const section = student.section || "";

  if (className && section) return `${className} - Section ${section}`;
  if (className) return className;
  if (student.class_id) return `Class ID: ${student.class_id}`;

  return "-";
}

function calculateGrade(marksObtained, maxMarks) {
  const obtained = Number(marksObtained);
  const maximum = Number(maxMarks);

  if (Number.isNaN(obtained) || Number.isNaN(maximum) || maximum <= 0) {
    return "";
  }

  const percentage = (obtained / maximum) * 100;

  if (percentage >= 90) return "A+";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B+";
  if (percentage >= 60) return "B";
  if (percentage >= 50) return "C";
  if (percentage >= 40) return "D";

  return "F";
}

function getResultStatus(mark) {
  const obtained = Number(mark.marks_obtained ?? mark.marks ?? 0);
  const maximum = Number(mark.max_marks ?? 100);

  if (!maximum) return "Pending";

  const percentage = (obtained / maximum) * 100;

  return percentage >= 40 ? "Pass" : "Fail";
}

export default function Marks() {
  const [marks, setMarks] = useState([]);
  const [students, setStudents] = useState([]);
  const [exams, setExams] = useState([]);
  const [classes, setClasses] = useState([]);
  const [mappedSubjects, setMappedSubjects] = useState([]);

  const [formData, setFormData] = useState(emptyMarkForm);
  const [editingId, setEditingId] = useState(null);

  const [searchText, setSearchText] = useState("");
  const [studentFilter, setStudentFilter] = useState("");
  const [examFilter, setExamFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");

  const [loading, setLoading] = useState(false);
  const [subjectLoading, setSubjectLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadMarks() {
    const response = await API.get("/marks/");
    setMarks(response.data || []);
  }

  async function loadStudents() {
    const response = await API.get("/students/");
    setStudents(response.data || []);
  }

  async function loadExams() {
    const response = await API.get("/exams/");
    setExams(response.data || []);
  }

  async function loadClasses() {
    const response = await API.get("/classes/");
    setClasses(response.data || []);
  }

  async function loadPageData() {
    try {
      setLoading(true);
      setMessage("");

      await Promise.all([
        loadMarks(),
        loadStudents(),
        loadExams(),
        loadClasses(),
      ]);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load marks data."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPageData();
  }, []);

  const studentMap = useMemo(() => {
    const map = {};

    students.forEach((student) => {
      map[student.id] = student;
    });

    return map;
  }, [students]);

  const examMap = useMemo(() => {
    const map = {};

    exams.forEach((exam) => {
      map[exam.id] = exam;
    });

    return map;
  }, [exams]);

  const classMap = useMemo(() => {
    const map = {};

    classes.forEach((classRecord) => {
      map[classRecord.id] = classRecord;
    });

    return map;
  }, [classes]);

  const subjectOptions = useMemo(() => {
    const mapped = mappedSubjects.map((item) => item.subject_name).filter(Boolean);
    const saved = marks.map((item) => item.subject_name || item.subject).filter(Boolean);

    return Array.from(new Set([...mapped, ...saved]));
  }, [mappedSubjects, marks]);

  function findStudentClassId(student) {
    if (!student) return null;

    if (student.class_id) {
      return student.class_id;
    }

    const matchedClass = classes.find(
      (item) =>
        item.class_name === student.class_name &&
        item.section === student.section
    );

    return matchedClass?.id || null;
  }

  async function loadMappedSubjectsForStudent(studentId) {
    const student = students.find(
      (item) => String(item.id) === String(studentId)
    );

    if (!student) {
      setMappedSubjects([]);
      return;
    }

    const classId = findStudentClassId(student);

    if (!classId) {
      setMappedSubjects([]);
      setMessage(
        "Selected student is not linked to a class. Please assign class in Student module first."
      );
      return;
    }

    try {
      setSubjectLoading(true);

      const response = await API.get(`/class-subjects/?class_id=${classId}`);
      const activeMappings = (response.data || []).filter((item) =>
        Boolean(item.is_active)
      );

      setMappedSubjects(activeMappings);

      if (activeMappings.length === 0) {
        setMessage(
          "No subjects are mapped to this student's class. Map subjects from Class Details first."
        );
      }
    } catch (error) {
      console.error(error);
      setMappedSubjects([]);
      setMessage(
        getApiErrorMessage(error, "Unable to load mapped subjects for class.")
      );
    } finally {
      setSubjectLoading(false);
    }
  }

  function handleChange(e) {
    const { name, value } = e.target;

    if (name === "student_id") {
      setFormData((prev) => ({
        ...prev,
        student_id: value,
        class_subject_id: "",
        subject_name: "",
      }));

      loadMappedSubjectsForStudent(value);
      return;
    }

    if (name === "class_subject_id") {
      const selectedMapping = mappedSubjects.find(
        (item) => String(item.id) === String(value)
      );

      setFormData((prev) => ({
        ...prev,
        class_subject_id: value,
        subject_name: selectedMapping?.subject_name || "",
      }));

      return;
    }

    if (name === "marks_obtained" || name === "max_marks") {
      const nextForm = {
        ...formData,
        [name]: value,
      };

      const grade = calculateGrade(
        nextForm.marks_obtained,
        nextForm.max_marks
      );

      setFormData({
        ...nextForm,
        grade,
      });

      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function buildPayload() {
      const selectedMapping = mappedSubjects.find(
        (item) => String(item.id) === String(formData.class_subject_id)
      );

      const subjectName =
        formData.subject_name || selectedMapping?.subject_name || "";

      const obtainedMarks = formData.marks_obtained
        ? Number(formData.marks_obtained)
        : 0;

      const maximumMarks = formData.max_marks
        ? Number(formData.max_marks)
        : 100;

      return {
        student_id: formData.student_id ? Number(formData.student_id) : null,
        exam_id: formData.exam_id ? Number(formData.exam_id) : null,

        class_subject_id: formData.class_subject_id
          ? Number(formData.class_subject_id)
          : null,

        subject_name: subjectName,

        // old backend compatibility
        subject: subjectName,

        marks_obtained: obtainedMarks,

        // new frontend name
        max_marks: maximumMarks,

        // old backend required name
        total_marks: maximumMarks,

        // old backend compatibility if it used "marks"
        marks: obtainedMarks,

        grade: formData.grade || "",
        remarks: formData.remarks || "",
      };
    }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage("");

    try {
      const payload = buildPayload();

      if (!payload.student_id) {
        setMessage("Student is required.");
        return;
      }

      if (!payload.exam_id) {
        setMessage("Exam is required.");
        return;
      }

      if (!payload.class_subject_id || !payload.subject_name) {
        setMessage("Subject is required. Select a mapped subject.");
        return;
      }

      if (payload.marks_obtained > payload.max_marks) {
        setMessage("Marks obtained cannot be greater than maximum marks.");
        return;
      }

      if (payload.marks_obtained < 0 || payload.max_marks <= 0) {
        setMessage("Marks values are invalid.");
        return;
      }

      if (editingId) {
        await API.put(`/marks/${editingId}`, payload);
        setMessage("Marks updated successfully.");
      } else {
        await API.post("/marks/", payload);
        setMessage("Marks added successfully.");
      }

      setFormData(emptyMarkForm);
      setEditingId(null);
      setMappedSubjects([]);

      await loadMarks();
    } catch (error) {
      console.error(error);
      setMessage(
        getApiErrorMessage(error, "Something went wrong while saving marks.")
      );
    }
  }

  async function handleEdit(mark) {
    setEditingId(mark.id);

    const studentId = mark.student_id || "";
    await loadMappedSubjectsForStudent(studentId);

    setFormData({
      student_id: studentId,
      exam_id: mark.exam_id || "",
      class_subject_id: mark.class_subject_id || "",
      subject_name: mark.subject_name || mark.subject || "",
      marks_obtained:
        mark.marks_obtained !== undefined && mark.marks_obtained !== null
          ? mark.marks_obtained
          : mark.marks || "",
      max_marks:
        mark.max_marks !== undefined && mark.max_marks !== null
          ? mark.max_marks
          : 100,
      grade: mark.grade || "",
      remarks: mark.remarks || "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(markId) {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this marks record?"
    );

    if (!confirmDelete) return;

    try {
      await API.delete(`/marks/${markId}`);
      setMessage("Marks record deleted successfully.");

      if (editingId === markId) {
        setEditingId(null);
        setFormData(emptyMarkForm);
        setMappedSubjects([]);
      }

      await loadMarks();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete marks record."));
    }
  }

  function handleCancelEdit() {
    setEditingId(null);
    setFormData(emptyMarkForm);
    setMappedSubjects([]);
    setMessage("");
  }

  const filteredMarks = marks.filter((mark) => {
    const student = studentMap[mark.student_id];
    const exam = examMap[mark.exam_id];

    const studentName = getStudentName(student);
    const examName = getExamName(exam);
    const subjectName = mark.subject_name || mark.subject || "";
    const classLabel = getClassLabelFromStudent(student);

    const fullText = `
      ${studentName}
      ${examName}
      ${subjectName}
      ${classLabel}
      ${mark.grade}
      ${mark.remarks}
    `.toLowerCase();

    const matchSearch = fullText.includes(searchText.toLowerCase());

    const matchStudent = studentFilter
      ? String(mark.student_id) === String(studentFilter)
      : true;

    const matchExam = examFilter
      ? String(mark.exam_id) === String(examFilter)
      : true;

    const matchSubject = subjectFilter
      ? subjectName === subjectFilter
      : true;

    return matchSearch && matchStudent && matchExam && matchSubject;
  });

  const totalMarksRecords = marks.length;

  const passCount = marks.filter((mark) => getResultStatus(mark) === "Pass").length;

  const failCount = marks.filter((mark) => getResultStatus(mark) === "Fail").length;

  const averagePercentage = useMemo(() => {
    if (marks.length === 0) return 0;

    const totalPercentage = marks.reduce((sum, mark) => {
      const obtained = Number(mark.marks_obtained ?? mark.marks ?? 0);
      const maximum = Number(mark.max_marks ?? 100);

      if (!maximum) return sum;

      return sum + (obtained / maximum) * 100;
    }, 0);

    return Math.round(totalPercentage / marks.length);
  }, [marks]);

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Academic Evaluation</p>
          <h2>Marks Management</h2>
          <p>
            Enter marks using subjects mapped to the selected student&apos;s class.
          </p>
        </div>

        <div className="module-header-actions">
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
          <FileText size={22} />
          <div>
            <span>Total Records</span>
            <strong>{totalMarksRecords}</strong>
          </div>
        </div>

        <div className="summary-card">
          <CheckCircle size={22} />
          <div>
            <span>Passed</span>
            <strong>{passCount}</strong>
          </div>
        </div>

        <div className="summary-card warning">
          <XCircle size={22} />
          <div>
            <span>Failed</span>
            <strong>{failCount}</strong>
          </div>
        </div>

        <div className="summary-card">
          <Award size={22} />
          <div>
            <span>Average</span>
            <strong>{averagePercentage}%</strong>
          </div>
        </div>
      </section>

      {message && <div className="message-box">{message}</div>}

      <section className="form-panel">
        <div className="panel-header">
          <div>
            <h3>{editingId ? "Edit Marks" : "Add Marks"}</h3>
            <p>
              Select student first. Subject dropdown will show only subjects
              mapped to that student&apos;s class.
            </p>
          </div>
        </div>

        <form className="classic-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-field">
              <label>Student *</label>
              <select
                name="student_id"
                value={formData.student_id}
                onChange={handleChange}
                required
              >
                <option value="">Select Student</option>

                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {getStudentName(student)} | {getClassLabelFromStudent(student)}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Exam *</label>
              <select
                name="exam_id"
                value={formData.exam_id}
                onChange={handleChange}
                required
              >
                <option value="">Select Exam</option>

                {exams.map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {getExamName(exam)}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Subject *</label>
              <select
                name="class_subject_id"
                value={formData.class_subject_id}
                onChange={handleChange}
                required
                disabled={!formData.student_id || subjectLoading}
              >
                <option value="">
                  {!formData.student_id
                    ? "Select Student First"
                    : subjectLoading
                    ? "Loading Subjects..."
                    : "Select Subject"}
                </option>

                {mappedSubjects.map((mapping) => (
                  <option key={mapping.id} value={mapping.id}>
                    {mapping.subject_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Maximum Marks *</label>
              <input
                type="number"
                name="max_marks"
                min="1"
                value={formData.max_marks}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-field">
              <label>Marks Obtained *</label>
              <input
                type="number"
                name="marks_obtained"
                min="0"
                max={formData.max_marks || undefined}
                value={formData.marks_obtained}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-field">
              <label>Grade</label>
              <input
                type="text"
                name="grade"
                value={formData.grade}
                onChange={handleChange}
                placeholder="Auto calculated"
              />
            </div>

            <div className="form-field full-width">
              <label>Remarks</label>
              <textarea
                name="remarks"
                rows="3"
                value={formData.remarks}
                onChange={handleChange}
                placeholder="Optional remarks"
              ></textarea>
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="primary-button">
              <PlusCircle size={18} />
              {editingId ? "Update Marks" : "Add Marks"}
            </button>

            {editingId && (
              <button
                type="button"
                className="light-button"
                onClick={handleCancelEdit}
              >
                Cancel Edit
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="table-panel">
        <div className="table-toolbar">
          <div>
            <h3>Marks Records</h3>
            <p>{filteredMarks.length} marks record(s) found</p>
          </div>

          <div className="table-search">
            <Search size={17} />
            <input
              type="text"
              placeholder="Search student, exam, subject..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
        </div>

        <div className="filter-row sis-filter-row">
          <div className="form-field">
            <label>Student</label>
            <select
              value={studentFilter}
              onChange={(e) => setStudentFilter(e.target.value)}
            >
              <option value="">All Students</option>

              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {getStudentName(student)}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Exam</label>
            <select
              value={examFilter}
              onChange={(e) => setExamFilter(e.target.value)}
            >
              <option value="">All Exams</option>

              {exams.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {getExamName(exam)}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Subject</label>
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
            >
              <option value="">All Subjects</option>

              {subjectOptions.map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="light-button"
            onClick={() => {
              setSearchText("");
              setStudentFilter("");
              setExamFilter("");
              setSubjectFilter("");
            }}
          >
            Clear Filters
          </button>
        </div>

        {loading ? (
          <div className="loading-box">Loading marks...</div>
        ) : (
          <div className="table-wrapper">
            <table className="classic-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Exam</th>
                  <th>Subject</th>
                  <th>Marks</th>
                  <th>Percentage</th>
                  <th>Grade</th>
                  <th>Result</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredMarks.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="empty-table">
                      No marks records found.
                    </td>
                  </tr>
                ) : (
                  filteredMarks.map((mark) => {
                    const student = studentMap[mark.student_id];
                    const exam = examMap[mark.exam_id];

                    const obtained = Number(
                      mark.marks_obtained ?? mark.marks ?? 0
                    );
                    const maximum = Number(mark.max_marks ?? 100);
                    const percentage = maximum
                      ? Math.round((obtained / maximum) * 100)
                      : 0;

                    const result = getResultStatus(mark);

                    return (
                      <tr key={mark.id}>
                        <td>{getStudentName(student)}</td>
                        <td>{getClassLabelFromStudent(student)}</td>
                        <td>{getExamName(exam)}</td>
                        <td>{mark.subject_name || mark.subject || "-"}</td>
                        <td>
                          {obtained} / {maximum}
                        </td>
                        <td>{percentage}%</td>
                        <td>{mark.grade || calculateGrade(obtained, maximum) || "-"}</td>
                        <td>
                          <span
                            className={
                              result === "Pass"
                                ? "status active"
                                : "status danger"
                            }
                          >
                            {result}
                          </span>
                        </td>
                        <td>
                          <div className="action-buttons">
                            <button
                              type="button"
                              className="edit-button"
                              onClick={() => handleEdit(mark)}
                              title="Edit"
                            >
                              <Edit size={15} />
                            </button>

                            <button
                              type="button"
                              className="delete-button"
                              onClick={() => handleDelete(mark.id)}
                              title="Delete"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}