import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Edit,
  Trash2,
  PlusCircle,
  FileText,
  Award,
  XCircle,
  CheckCircle,
  Layers,
} from "lucide-react";

import API from "../api";
import StudentPicker from "../components/StudentPicker";
import ManagedRecordsTable from "../components/ManagedRecordsTable";

const emptyMarkForm = {
  student_id: "",
  exam_id: "",
  academic_year: "",
  class_subject_id: "",
  subject_name: "",
  marks_obtained: "",
  max_marks: 100,
  grade: "",
  remarks: "",
};

const emptyComponentScoreRow = {
  exam_component_id: null,
  component_name: "",
  marks_obtained: "",
  max_marks: "",
  sort_order: 0,
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
  const name =
    student.name ||
    student.student_name ||
    `${student.first_name || ""} ${student.last_name || ""}`.trim() ||
    "Unknown Student";

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

function getClassLabelFromMark(mark, student) {
  const className = mark.class_name_snapshot || student?.class_name || "";
  const section = mark.section_snapshot || student?.section || "";

  if (className && section) return `${className} - Section ${section}`;
  if (className) return className;
  if (mark.class_id || student?.class_id) {
    return `Class ID: ${mark.class_id || student.class_id}`;
  }

  return "-";
}

function getExamNameForMark(mark, exam) {
  return mark.exam_name_snapshot || getExamName(exam);
}

function getExamOptionLabel(exam) {
  const name = getExamName(exam);
  return exam?.exam_type ? `${name} (${exam.exam_type})` : name;
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
  const [classExamMappings, setClassExamMappings] = useState([]);
  const [mappedSubjects, setMappedSubjects] = useState([]);
  const [examComponents, setExamComponents] = useState([]);
  const [componentScoreRows, setComponentScoreRows] = useState([]);

  const [formData, setFormData] = useState(emptyMarkForm);
  const [editingId, setEditingId] = useState(null);
  const [pageMode, setPageMode] = useState("list");

  const [searchText, setSearchText] = useState("");
  const [studentFilter, setStudentFilter] = useState("");
  const [examFilter, setExamFilter] = useState("");
  const [academicYearFilter, setAcademicYearFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");

  const [loading, setLoading] = useState(false);
  const [subjectLoading, setSubjectLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return undefined;

    const timeoutId = window.setTimeout(() => {
      setMessage("");
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

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

  async function loadClassExamMappings() {
    const response = await API.get("/class-exam-mappings/", {
      params: { active_only: true },
    });
    setClassExamMappings(response.data || []);
  }

  async function loadExamComponents() {
    const response = await API.get("/exam-components/", {
      params: { active_only: true },
    });
    setExamComponents(response.data || []);
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
        loadClassExamMappings(),
        loadExamComponents(),
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

  const selectedExamComponents = useMemo(() => {
    if (!formData.exam_id) return [];

    return examComponents
      .filter(
        (component) =>
          String(component.exam_id) === String(formData.exam_id) &&
          component.is_active !== false
      )
      .sort((first, second) => {
        const firstOrder = Number(first.sort_order || 0);
        const secondOrder = Number(second.sort_order || 0);
        return firstOrder - secondOrder || first.id - second.id;
      });
  }, [examComponents, formData.exam_id]);

  function buildScoreRowsForExam(examId, savedScores = []) {
    const components = examComponents
      .filter(
        (component) =>
          String(component.exam_id) === String(examId) &&
          component.is_active !== false
      )
      .sort((first, second) => {
        const firstOrder = Number(first.sort_order || 0);
        const secondOrder = Number(second.sort_order || 0);
        return firstOrder - secondOrder || first.id - second.id;
      });

    return components.map((component, index) => {
      const savedScore = savedScores.find(
        (score) =>
          String(score.exam_component_id) === String(component.id) ||
          score.component_name === component.component_name
      );

      return {
        exam_component_id: component.id,
        component_name: component.component_name,
        marks_obtained: savedScore?.marks_obtained ?? "",
        max_marks: savedScore?.max_marks ?? component.max_marks ?? "",
        sort_order: component.sort_order ?? index + 1,
        remarks: savedScore?.remarks || "",
      };
    });
  }

  function applyScoreRows(nextRows) {
    setComponentScoreRows(nextRows);

    if (nextRows.length === 0) return;

    const obtained = nextRows.reduce(
      (sum, row) => sum + Number(row.marks_obtained || 0),
      0
    );
    const maximum = nextRows.reduce(
      (sum, row) => sum + Number(row.max_marks || 0),
      0
    );

    setFormData((prev) => ({
      ...prev,
      marks_obtained: obtained,
      max_marks: maximum,
      grade: calculateGrade(obtained, maximum),
    }));
  }

  const subjectOptions = useMemo(() => {
    const mapped = mappedSubjects.map((item) => item.subject_name).filter(Boolean);
    const saved = marks.map((item) => item.subject_name || item.subject).filter(Boolean);

    return Array.from(new Set([...mapped, ...saved]));
  }, [mappedSubjects, marks]);

  const academicYearOptions = useMemo(() => {
    const examYears = exams.map((exam) => exam.academic_year).filter(Boolean);
    const markYears = marks.map((mark) => mark.academic_year).filter(Boolean);
    const mappingYears = classExamMappings
      .map((mapping) => mapping.academic_year)
      .filter(Boolean);

    return Array.from(new Set([...examYears, ...markYears, ...mappingYears]));
  }, [classExamMappings, exams, marks]);

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

  const availableExamOptions = useMemo(() => {
    if (!formData.student_id || !formData.academic_year) {
      return [];
    }

    const student = studentMap[formData.student_id];
    const classId = findStudentClassId(student);

    if (!classId) {
      return [];
    }

    const mappedExamIds = new Set(
      classExamMappings
        .filter(
          (mapping) =>
            Boolean(mapping.is_active) &&
            String(mapping.class_id) === String(classId) &&
            mapping.academic_year === formData.academic_year
        )
        .map((mapping) => String(mapping.exam_id))
    );

    return exams.filter((exam) => mappedExamIds.has(String(exam.id)));
  }, [
    classExamMappings,
    classes,
    exams,
    formData.academic_year,
    formData.student_id,
    studentMap,
  ]);

  async function loadMappedSubjectsForStudent(
    studentId,
    academicYear = formData.academic_year
  ) {
    const student = students.find(
      (item) => String(item.id) === String(studentId)
    );

    if (!student) {
      setMappedSubjects([]);
      return [];
    }

    const classId = findStudentClassId(student);

    if (!classId) {
      setMappedSubjects([]);
      setMessage(
        "Selected student is not linked to a class. Please assign class in Student module first."
      );
      return [];
    }

    try {
      setSubjectLoading(true);

      const response = await API.get("/class-subjects/", {
        params: {
          class_id: classId,
          academic_year: academicYear || undefined,
          active_only: true,
        },
      });
      const activeMappings = (response.data || []).filter((item) =>
        Boolean(item.is_active)
      );

      setMappedSubjects(activeMappings);

      if (activeMappings.length === 0) {
        setMessage(
          "No subjects are mapped to this student's class. Map subjects from Class Details first."
        );
      }

      return activeMappings;
    } catch (error) {
      console.error(error);
      setMappedSubjects([]);
      setMessage(
        getApiErrorMessage(error, "Unable to load mapped subjects for class.")
      );
      return [];
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
        exam_id: "",
        class_subject_id: "",
        subject_name: "",
      }));
      setComponentScoreRows([]);

      loadMappedSubjectsForStudent(value, formData.academic_year);
      return;
    }

    if (name === "academic_year") {
      setFormData((prev) => ({
        ...prev,
        academic_year: value,
        exam_id: "",
        class_subject_id: "",
        subject_name: "",
      }));
      setComponentScoreRows([]);

      if (formData.student_id) {
        loadMappedSubjectsForStudent(formData.student_id, value);
      }
      return;
    }

    if (name === "exam_id") {
      setFormData((prev) => ({
        ...prev,
        exam_id: value,
        class_subject_id: "",
        subject_name: "",
      }));
      applyScoreRows(buildScoreRowsForExam(value));

      if (formData.student_id) {
        loadMappedSubjectsForStudent(formData.student_id, formData.academic_year);
      }
      return;
    }

    if (name.startsWith("component_")) {
      const [, indexText, ...fieldParts] = name.split("_");
      const rowIndex = Number(indexText);
      const field = fieldParts.join("_");
      const nextRows = componentScoreRows.map((row, index) =>
        index === rowIndex ? { ...row, [field]: value } : row
      );

      applyScoreRows(nextRows);
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
        academic_year: formData.academic_year || "",

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
        component_scores:
          componentScoreRows.length > 0
            ? componentScoreRows
                .filter((row) => row.component_name)
                .map((row) => ({
                  exam_component_id: row.exam_component_id || null,
                  component_name: row.component_name,
                  marks_obtained: Number(row.marks_obtained || 0),
                  max_marks: Number(row.max_marks || 0),
                  sort_order: Number(row.sort_order || 0),
                  remarks: row.remarks || "",
                }))
            : null,
      };
    }

  function validateComponentScores(componentScores = []) {
    for (const score of componentScores) {
      const componentName = score.component_name || "Component";
      const obtained = Number(score.marks_obtained || 0);
      const maximum = Number(score.max_marks || 0);

      if (maximum <= 0) {
        return `${componentName} maximum marks must be greater than 0.`;
      }

      if (obtained < 0) {
        return `${componentName} marks cannot be negative.`;
      }

      if (obtained > maximum) {
        return `${componentName} marks cannot be greater than its maximum marks.`;
      }
    }

    return "";
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

      if (!payload.academic_year) {
        setMessage("Academic year is required.");
        return;
      }

      if (!payload.class_subject_id || !payload.subject_name) {
        setMessage("Subject is required. Select a mapped subject.");
        return;
      }

      const examAllowed = availableExamOptions.some(
        (exam) => String(exam.id) === String(payload.exam_id)
      );

      if (!examAllowed) {
        setMessage(
          "Selected exam is not mapped to this student's class for the academic year."
        );
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

      const componentError = validateComponentScores(payload.component_scores || []);
      if (componentError) {
        setMessage(componentError);
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
      setComponentScoreRows([]);
      setPageMode("list");

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
    setPageMode("form");

    const studentId = mark.student_id || "";
    const academicYear =
      mark.academic_year || examMap[mark.exam_id]?.academic_year || "";
    const loadedMappings = await loadMappedSubjectsForStudent(
      studentId,
      academicYear
    );

    let classSubjectId = mark.class_subject_id || "";

    if (!classSubjectId && (mark.subject_name || mark.subject)) {
      const subjectName = mark.subject_name || mark.subject;
      const matchedMapping = loadedMappings.find(
        (item) => item.subject_name === subjectName
      );
      classSubjectId = matchedMapping?.id || "";
    }

    setFormData({
      student_id: studentId,
      exam_id: mark.exam_id || "",
      academic_year: academicYear,
      class_subject_id: classSubjectId,
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
    setComponentScoreRows(buildScoreRowsForExam(mark.exam_id, mark.component_scores || []));

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
        setComponentScoreRows([]);
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
    setComponentScoreRows([]);
    setMessage("");
    setPageMode("list");
  }

  function handleAddMarks() {
    setEditingId(null);
    setFormData(emptyMarkForm);
    setMappedSubjects([]);
    setComponentScoreRows([]);
    setMessage("");
    setPageMode("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const filteredMarks = marks.filter((mark) => {
    const student = studentMap[mark.student_id];
    const exam = examMap[mark.exam_id];

    const studentName = getStudentName(student);
    const examName = getExamNameForMark(mark, exam);
    const subjectName = mark.subject_name || mark.subject || "";
    const academicYear = mark.academic_year || exam?.academic_year || "";
    const classLabel = getClassLabelFromMark(mark, student);

    const fullText = `
      ${studentName}
      ${examName}
      ${subjectName}
      ${academicYear}
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

    const matchAcademicYear = academicYearFilter
      ? academicYear === academicYearFilter
      : true;

    const matchSubject = subjectFilter
      ? subjectName === subjectFilter
      : true;

    return matchSearch && matchStudent && matchExam && matchAcademicYear && matchSubject;
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

  const componentSummary = useMemo(() => {
    const obtained = componentScoreRows.reduce(
      (sum, row) => sum + Number(row.marks_obtained || 0),
      0
    );
    const maximum = componentScoreRows.reduce(
      (sum, row) => sum + Number(row.max_marks || 0),
      0
    );
    const percentage = maximum ? Math.round((obtained / maximum) * 100) : 0;

    return {
      obtained,
      maximum,
      percentage,
      grade: calculateGrade(obtained, maximum) || "-",
    };
  }, [componentScoreRows]);

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

        {pageMode === "list" && (
          <div className="module-header-actions">
            <button type="button" className="primary-button" onClick={handleAddMarks}>
              <PlusCircle size={18} />
              Add Marks
            </button>
          </div>
        )}
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

      {message && <div className="toast-notification">{message}</div>}

      {pageMode === "form" && (
      <section className="form-panel">
        <div className="panel-header">
          <div>
            <div className="panel-header-title-row">
              <h3>{editingId ? "Edit Marks" : "Add Marks"}</h3>
              <Link to="/marks/layout" className="panel-header-link">
                <Layers size={14} />
                Customize Layout
              </Link>
            </div>
            <p>
              Select student first. Subject dropdown will show only subjects
              mapped to that student&apos;s class.
            </p>
          </div>
        </div>

        <form className="classic-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <StudentPicker
              students={students}
              value={formData.student_id}
              onChange={handleChange}
            />

            <div className="form-field">
              <label>Academic Year *</label>
              <input
                list="marks-academic-year-options"
                name="academic_year"
                value={formData.academic_year}
                onChange={handleChange}
                placeholder="2026-27"
                required
              />
            </div>

            <div className="form-field">
              <label>Exam Name *</label>
              <select
                name="exam_id"
                value={formData.exam_id}
                onChange={handleChange}
                required
                disabled={!formData.student_id || !formData.academic_year}
              >
                <option value="">
                  {!formData.student_id
                    ? "Select Student First"
                    : !formData.academic_year
                    ? "Enter Academic Year First"
                    : "Select Mapped Exam"}
                </option>

                {availableExamOptions.map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {getExamOptionLabel(exam)}
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
                disabled={!formData.student_id || !formData.academic_year || subjectLoading}
              >
                <option value="">
                  {!formData.student_id
                    ? "Select Student First"
                    : !formData.academic_year
                    ? "Enter Academic Year First"
                    : subjectLoading
                    ? "Loading Subjects..."
                    : "Select Subject"}
                </option>

                {mappedSubjects.map((mapping) => (
                  <option key={mapping.id} value={mapping.id}>
                    {mapping.subject_name} | {mapping.academic_year}
                  </option>
                ))}
              </select>
            </div>

            {componentScoreRows.length > 0 && (
              <div className="form-field full-width exam-components-card">
                <label>Component Marks</label>
                <div className="marks-component-summary">
                  <div>
                    <span>Obtained</span>
                    <strong>{componentSummary.obtained}</strong>
                  </div>
                  <div>
                    <span>Maximum</span>
                    <strong>{componentSummary.maximum}</strong>
                  </div>
                  <div>
                    <span>Percentage</span>
                    <strong>{componentSummary.percentage}%</strong>
                  </div>
                  <div>
                    <span>Grade</span>
                    <strong>{componentSummary.grade}</strong>
                  </div>
                </div>
                <div className="table-wrapper exam-components-wrapper">
                  <table className="classic-table exam-components-table marks-components-table">
                    <thead>
                      <tr>
                        <th>Component</th>
                        <th>Max Marks</th>
                        <th>Marks Obtained</th>
                        <th>Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {componentScoreRows.map((row, index) => (
                        <tr key={`${row.exam_component_id || row.component_name}-${index}`}>
                          <td>{row.component_name}</td>
                          <td>
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              name={`component_${index}_max_marks`}
                              value={row.max_marks}
                              onChange={handleChange}
                              required
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              max={row.max_marks || undefined}
                              step="0.01"
                              name={`component_${index}_marks_obtained`}
                              value={row.marks_obtained}
                              onChange={handleChange}
                              required
                            />
                          </td>
                          <td>
                            <input
                              name={`component_${index}_remarks`}
                              value={row.remarks}
                              onChange={handleChange}
                              placeholder="Optional"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="form-field">
              <label>Maximum Marks *</label>
              <input
                type="number"
                name="max_marks"
                min="1"
                value={formData.max_marks}
                onChange={handleChange}
                readOnly={componentScoreRows.length > 0}
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
                readOnly={componentScoreRows.length > 0}
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

          <datalist id="marks-academic-year-options">
            {academicYearOptions.map((year) => (
              <option key={year} value={year} />
            ))}
          </datalist>

          <div className="form-actions">
            <button type="submit" className="primary-button">
              <PlusCircle size={18} />
              {editingId ? "Update Marks" : "Add Marks"}
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
      )}

      {pageMode === "list" && (
        <>
      <section className="table-panel module-filter-panel">
        <div className="filter-row sis-filter-row">
          <StudentPicker
            students={students}
            value={studentFilter}
            onChange={(event) => setStudentFilter(event.target.value)}
            required={false}
            label="Student"
          />

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

          <div className="form-field">
            <label>Academic Year</label>
            <select
              value={academicYearFilter}
              onChange={(e) => setAcademicYearFilter(e.target.value)}
            >
              <option value="">All Years</option>

              {academicYearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
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
              setAcademicYearFilter("");
              setSubjectFilter("");
            }}
          >
            Clear Filters
          </button>
        </div>

      </section>

      <ManagedRecordsTable
        count={filteredMarks.length}
        emptyText="No marks records found."
        headers={["Student", "Class", "Exam", "Academic Year", "Subject", "Marks", "Components", "Percentage", "Grade", "Result", "Actions"]}
        loading={loading}
        loadingText="Loading marks..."
        searchPlaceholder="Search student, exam, subject..."
        searchText={searchText}
        setSearchText={setSearchText}
      >
        {filteredMarks.map((mark) => {
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
                        <td>{getClassLabelFromMark(mark, student)}</td>
                        <td>{getExamNameForMark(mark, exam)}</td>
                        <td>{mark.academic_year || exam?.academic_year || "-"}</td>
                        <td>{mark.subject_name || mark.subject || "-"}</td>
                        <td>
                          {obtained} / {maximum}
                        </td>
                        <td>
                          {mark.component_scores?.length
                            ? mark.component_scores
                                .map(
                                  (score) =>
                                    `${score.component_name}: ${score.marks_obtained}/${score.max_marks}`
                                )
                                .join(", ")
                            : "-"}
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
        })}
      </ManagedRecordsTable>
        </>
      )}
    </div>
  );
}
