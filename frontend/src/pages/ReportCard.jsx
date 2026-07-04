import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Printer, RefreshCcw } from "lucide-react";

import API from "../api";
import { useSchoolSettings } from "../SettingsContext";

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

function getStudentName(student) {
  return `${student?.first_name || ""} ${student?.last_name || ""}`.trim() || "-";
}

function getExamName(exam) {
  return exam?.exam_name || exam?.name || "-";
}

function getExamNameForMarks(marks, exam) {
  return marks.find((mark) => mark.exam_name_snapshot)?.exam_name_snapshot || getExamName(exam);
}

function getExamOptionLabel(exam) {
  const name = getExamName(exam);
  return exam?.exam_type ? `${name} (${exam.exam_type})` : name;
}

function getClassSectionForReport(marks, student) {
  const markWithClass = marks.find(
    (mark) => mark.class_name_snapshot || mark.section_snapshot
  );
  const className = markWithClass?.class_name_snapshot || student?.class_name || "";
  const section = markWithClass?.section_snapshot || student?.section || "";

  return [className, section].filter(Boolean).join(" ") || "-";
}

function calculatePercentage(obtained, total) {
  if (!total) return 0;
  return (obtained / total) * 100;
}

function calculateResult(percentage) {
  return percentage >= 40 ? "Pass" : "Needs Improvement";
}

function getComponentScore(mark, componentName) {
  return (mark.component_scores || []).find(
    (score) => score.component_name === componentName
  );
}

function formatScore(value) {
  const numberValue = Number(value || 0);
  return Number.isInteger(numberValue)
    ? String(numberValue)
    : numberValue.toFixed(2);
}

function formatComponentScore(score) {
  if (!score) return "-";
  return `${formatScore(score.marks_obtained)} / ${formatScore(score.max_marks)}`;
}

export default function ReportCard() {
  const { settings } = useSchoolSettings();
  const [students, setStudents] = useState([]);
  const [exams, setExams] = useState([]);
  const [classExamMappings, setClassExamMappings] = useState([]);
  const [marks, setMarks] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedExamId, setSelectedExamId] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadInitialData() {
    try {
      setLoading(true);
      setMessage("");
      const [studentsResponse, examsResponse, mappingsResponse] = await Promise.all([
        API.get("/students/"),
        API.get("/exams/"),
        API.get("/class-exam-mappings/", { params: { active_only: true } }),
      ]);

      const nextStudents = studentsResponse.data || [];
      const nextExams = examsResponse.data || [];
      const nextMappings = mappingsResponse.data || [];
      setStudents(nextStudents);
      setExams(nextExams);
      setClassExamMappings(nextMappings);

      if (!selectedStudentId && nextStudents[0]?.id) {
        setSelectedStudentId(String(nextStudents[0].id));
      }

      if (!selectedExamId && nextExams[0]?.id) {
        setSelectedExamId(String(nextExams[0].id));
      }

      if (!academicYear) {
        setAcademicYear(settings?.academic_year || nextExams[0]?.academic_year || "2026-27");
      }
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load report card data."));
    } finally {
      setLoading(false);
    }
  }

  async function loadMarks() {
    if (!selectedStudentId || !selectedExamId) {
      setMarks([]);
      return;
    }

    try {
      setLoading(true);
      setMessage("");
      const response = await API.get("/marks/", {
        params: {
          student_id: selectedStudentId,
          exam_id: selectedExamId,
          academic_year: academicYear || undefined,
        },
      });
      setMarks(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load marks for report card."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    loadMarks();
  }, [selectedStudentId, selectedExamId, academicYear]);

  const selectedStudent = students.find((student) => String(student.id) === String(selectedStudentId));
  const selectedExam = exams.find((exam) => String(exam.id) === String(selectedExamId));
  const selectedExamMapping = classExamMappings.find(
    (mapping) =>
      String(mapping.class_id) === String(selectedStudent?.class_id) &&
      String(mapping.exam_id) === String(selectedExamId) &&
      mapping.academic_year === academicYear &&
      mapping.is_active !== false
  );
  const mappedExamOptions = useMemo(() => {
    if (!selectedStudent?.class_id || !academicYear) return exams;

    const mappedExamIds = new Set(
      classExamMappings
        .filter(
          (mapping) =>
            String(mapping.class_id) === String(selectedStudent.class_id) &&
            mapping.academic_year === academicYear &&
            mapping.is_active !== false
        )
        .map((mapping) => String(mapping.exam_id))
    );

    return exams.filter((exam) => mappedExamIds.has(String(exam.id)));
  }, [academicYear, classExamMappings, exams, selectedStudent]);
  const reportExamName = getExamNameForMarks(marks, selectedExam);
  const reportClassSection = getClassSectionForReport(marks, selectedStudent);
  const componentColumns = useMemo(() => {
    const columns = [];
    const seen = new Set();

    marks.forEach((mark) => {
      (mark.component_scores || []).forEach((score) => {
        if (!score.component_name || seen.has(score.component_name)) return;
        seen.add(score.component_name);
        columns.push({
          name: score.component_name,
          sortOrder: Number(score.sort_order || columns.length + 1),
        });
      });
    });

    return columns.sort((first, second) => first.sortOrder - second.sortOrder);
  }, [marks]);

  useEffect(() => {
    if (mappedExamOptions.length === 0) {
      if (selectedExamId) setSelectedExamId("");
      return;
    }

    const selectedStillMapped = mappedExamOptions.some(
      (exam) => String(exam.id) === String(selectedExamId)
    );

    if (!selectedStillMapped) {
      setSelectedExamId(String(mappedExamOptions[0].id));
    }
  }, [mappedExamOptions, selectedExamId]);

  const totals = useMemo(() => {
    const obtained = marks.reduce((sum, mark) => sum + Number(mark.marks_obtained || 0), 0);
    const maximum = marks.reduce(
      (sum, mark) => sum + Number(mark.max_marks || mark.total_marks || 0),
      0
    );
    const percentage = calculatePercentage(obtained, maximum);

    return {
      obtained,
      maximum,
      percentage,
      result: marks.length ? calculateResult(percentage) : "-",
    };
  }, [marks]);

  const gradeSummary = useMemo(() => {
    if (!marks.length) return "-";
    const failing = marks.some((mark) => {
      const maxMarks = Number(mark.max_marks || mark.total_marks || 0);
      return calculatePercentage(Number(mark.marks_obtained || 0), maxMarks) < 40;
    });
    if (failing) return "Review Required";
    if (totals.percentage >= 90) return "Outstanding";
    if (totals.percentage >= 75) return "Very Good";
    if (totals.percentage >= 60) return "Good";
    return "Satisfactory";
  }, [marks, totals.percentage]);

  function handlePrint() {
    window.print();
  }

  return (
    <div className="management-page report-card-page">
      <section className="page-heading no-print">
        <div>
          <p className="eyebrow">Assessments</p>
          <h2>Report Card</h2>
          <p>Generate a printable academic report by student, exam, and academic year.</p>
        </div>

        <div className="module-header-actions">
          <button type="button" className="secondary-button" onClick={loadInitialData}>
            <RefreshCcw size={17} />
            Refresh
          </button>
          <button type="button" className="primary-button" onClick={handlePrint}>
            <Printer size={18} />
            Print
          </button>
        </div>
      </section>

      {message && <div className="message-box no-print">{message}</div>}

      <section className="table-panel module-filter-panel no-print">
        <div className="filter-row sis-filter-row">
          <div className="form-field">
            <label>Student</label>
            <select value={selectedStudentId} onChange={(event) => setSelectedStudentId(event.target.value)}>
              <option value="">Select Student</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.admission_no} - {getStudentName(student)}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Exam Name</label>
            <select value={selectedExamId} onChange={(event) => setSelectedExamId(event.target.value)}>
              <option value="">Select Exam</option>
              {mappedExamOptions.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {getExamOptionLabel(exam)}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Academic Year</label>
            <input
              type="text"
              value={academicYear}
              onChange={(event) => setAcademicYear(event.target.value)}
              placeholder="2026-27"
            />
          </div>
        </div>
      </section>

      <section className="report-card-paper print-area">
        <header className="report-card-header">
          <div className="school-logo-box">
            {settings?.logo_url ? <img src={settings.logo_url} alt="School logo" /> : <FileText size={34} />}
          </div>
          <div>
            <h1>{settings?.school_name || "International School"}</h1>
            <p>{settings?.tagline || settings?.address || "Academic Performance Report"}</p>
          </div>
        </header>

        <div className="report-card-title">
          <h2>Report Card</h2>
          <p>
            {reportExamName} | Academic Year {academicYear || selectedExam?.academic_year || "-"}
          </p>
        </div>

        <div className="report-card-info-grid">
          <div>
            <span>Student Name</span>
            <strong>{selectedStudent ? getStudentName(selectedStudent) : "-"}</strong>
          </div>
          <div>
            <span>Admission No</span>
            <strong>{selectedStudent?.admission_no || "-"}</strong>
          </div>
          <div>
            <span>Class / Section</span>
            <strong>{reportClassSection}</strong>
          </div>
          <div>
            <span>Exam Name</span>
            <strong>{reportExamName}</strong>
          </div>
          <div>
            <span>Exam Type</span>
            <strong>{selectedExam?.exam_type || "-"}</strong>
          </div>
          <div>
            <span>Exam Date</span>
            <strong>{selectedExamMapping?.exam_date || "-"}</strong>
          </div>
          <div>
            <span>Academic Year</span>
            <strong>{academicYear || selectedExam?.academic_year || "-"}</strong>
          </div>
        </div>

        {loading ? (
          <div className="report-card-empty">Loading report card...</div>
        ) : marks.length === 0 ? (
          <div className="report-card-empty">
            No marks found for the selected student, exam, and academic year.
          </div>
        ) : (
          <>
            <div className="report-card-table-wrapper">
              <table className="report-card-table">
                <thead>
                  <tr>
                    <th>Subject</th>
                    {componentColumns.map((component) => (
                      <th key={component.name}>{component.name}</th>
                    ))}
                    <th>Marks Obtained</th>
                    <th>Max Marks</th>
                    <th>Percentage</th>
                    <th>Grade</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {marks.map((mark) => {
                    const obtained = Number(mark.marks_obtained || 0);
                    const maximum = Number(mark.max_marks || mark.total_marks || 0);
                    const percentage = calculatePercentage(obtained, maximum);

                    return (
                      <tr key={mark.id}>
                        <td>{mark.subject_name || mark.subject || "-"}</td>
                        {componentColumns.map((component) => {
                          const score = getComponentScore(mark, component.name);
                          return (
                            <td key={component.name}>
                              {formatComponentScore(score)}
                            </td>
                          );
                        })}
                        <td>{formatScore(obtained)}</td>
                        <td>{formatScore(maximum)}</td>
                        <td>{percentage.toFixed(2)}%</td>
                        <td>{mark.grade || "-"}</td>
                        <td>{mark.remarks || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    {componentColumns.map((component) => {
                      const componentObtained = marks.reduce((sum, mark) => {
                        const score = getComponentScore(mark, component.name);
                        return sum + Number(score?.marks_obtained || 0);
                      }, 0);
                      const componentMaximum = marks.reduce((sum, mark) => {
                        const score = getComponentScore(mark, component.name);
                        return sum + Number(score?.max_marks || 0);
                      }, 0);

                      return (
                        <td key={component.name}>
                          {formatScore(componentObtained)} / {formatScore(componentMaximum)}
                        </td>
                      );
                    })}
                    <td>{formatScore(totals.obtained)}</td>
                    <td>{formatScore(totals.maximum)}</td>
                    <td>{totals.percentage.toFixed(2)}%</td>
                    <td colSpan="2">{totals.result}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="report-card-result-grid">
              <div>
                <span>Total Marks</span>
                <strong>
                  {formatScore(totals.obtained)} / {formatScore(totals.maximum)}
                </strong>
              </div>
              <div>
                <span>Percentage</span>
                <strong>{totals.percentage.toFixed(2)}%</strong>
              </div>
              <div>
                <span>Result</span>
                <strong>{totals.result}</strong>
              </div>
              <div>
                <span>Performance</span>
                <strong>{gradeSummary}</strong>
              </div>
            </div>
          </>
        )}

        <div className="report-card-signatures">
          <div>Class Teacher</div>
          <div>Exam Coordinator</div>
          <div>Principal</div>
        </div>
      </section>

      <div className="form-actions no-print">
        <button type="button" className="light-button" onClick={handlePrint}>
          <Download size={17} />
          Print / Save PDF
        </button>
      </div>
    </div>
  );
}
