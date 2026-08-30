import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Printer } from "lucide-react";

import API from "../api";
import CustomSelect from "../components/CustomSelect";
import { useSchoolSettings } from "../SettingsContext";

const REPORT_CARD_TEMPLATE_OPTIONS = [
  { value: "classic", label: "Classic" },
  { value: "modern", label: "Modern" },
  { value: "compact", label: "Compact" },
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
  // "" means the school's own default (settings.report_card_template)
  // still applies; picking one from the dropdown overrides it for this
  // download only. Derived at render time instead of synced into state via
  // an effect -- one fewer render, and settings can still arrive after
  // this component mounts without needing to be "caught" separately.
  const [templateOverride, setTemplateOverride] = useState("");
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return undefined;

    const timeoutId = window.setTimeout(() => {
      setMessage("");
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

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

  async function loadMarksAndReportData() {
    if (!selectedStudentId || !selectedExamId) {
      setMarks([]);
      setReportData(null);
      return;
    }

    try {
      setLoading(true);
      setMessage("");

      // The component-score breakdown table reads the raw marks list; the
      // totals/grade/result/rank/attendance panel below it reads
      // report-card-data instead -- the same computation the downloaded
      // PDF uses, so the two can never disagree with each other the way
      // this page's own client-side math used to disagree with the PDF.
      const [marksResponse, reportDataResponse] = await Promise.all([
        API.get("/marks/", {
          params: {
            student_id: selectedStudentId,
            exam_id: selectedExamId,
            academic_year: academicYear || undefined,
          },
        }),
        API.get("/marks/report-card-data", {
          params: { student_id: selectedStudentId, exam_id: selectedExamId },
        }).catch((error) => {
          if (error.response?.status === 404) return { data: null };
          throw error;
        }),
      ]);
      setMarks(marksResponse.data || []);
      setReportData(reportDataResponse.data);
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
    loadMarksAndReportData();
  }, [selectedStudentId, selectedExamId, academicYear]);

  const template = templateOverride || settings?.report_card_template || "classic";

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

  function handlePrint() {
    window.print();
  }

  async function handleDownloadPdf() {
    if (!selectedStudentId || !selectedExamId) {
      setMessage("Select a student and exam first.");
      return;
    }
    try {
      const response = await API.get("/marks/report-card", {
        params: { student_id: selectedStudentId, exam_id: selectedExamId, template },
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(
        new Blob([response.data], { type: "application/pdf" })
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `report_card_${selectedStudent?.admission_no || selectedStudentId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      const detail = error.response?.data?.detail;
      setMessage(typeof detail === "string" ? detail : "Unable to download report card.");
    }
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
          <div className="form-field report-card-template-picker">
            <CustomSelect
              value={template}
              onChange={setTemplateOverride}
              options={REPORT_CARD_TEMPLATE_OPTIONS}
            />
          </div>
          <button type="button" className="secondary-button" onClick={handleDownloadPdf}>
            <Download size={18} />
            Download PDF
          </button>
          <button type="button" className="primary-button" onClick={handlePrint}>
            <Printer size={18} />
            Print
          </button>
        </div>
      </section>

      {message && <div className="toast-notification no-print">{message}</div>}

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

      <section className={`report-card-paper print-area template-${template}`}>
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
          <div className="report-card-empty">
            <span className="spinner" aria-hidden="true" />
            Loading report card...
          </div>
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
                    <td>{formatScore(reportData?.total_obtained ?? 0)}</td>
                    <td>{formatScore(reportData?.total_max ?? 0)}</td>
                    <td>{(reportData?.percentage ?? 0).toFixed(2)}%</td>
                    <td colSpan="2">{reportData?.result || "-"}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="report-card-result-grid">
              <div>
                <span>Total Marks</span>
                <strong>
                  {formatScore(reportData?.total_obtained ?? 0)} / {formatScore(reportData?.total_max ?? 0)}
                </strong>
              </div>
              <div>
                <span>Percentage</span>
                <strong>{(reportData?.percentage ?? 0).toFixed(2)}%</strong>
              </div>
              <div>
                <span>Overall Grade</span>
                <strong>{reportData?.overall_grade || "-"}</strong>
              </div>
              <div>
                <span>Result</span>
                <strong>{reportData?.result || "-"}</strong>
              </div>
              <div>
                <span>Class Rank</span>
                <strong>{reportData?.rank ? `${reportData.rank} of ${reportData.out_of}` : "-"}</strong>
              </div>
              <div>
                <span>Attendance</span>
                <strong>
                  {reportData?.attendance_percent != null ? `${reportData.attendance_percent.toFixed(2)}%` : "-"}
                </strong>
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
