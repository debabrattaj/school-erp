import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import ReportDocumentEditor from "../components/ReportDocumentEditor";
import { createReportDocument } from "../components/reportDocument";
import { Download, FileText, Printer } from "lucide-react";

import API from "../api";
import { reportTextStyle } from "../components/ReportTextToolbar";
import CustomSelect from "../components/CustomSelect";
import ReportCardDesignEditor, { DEFAULT_REPORT_DESIGN } from "../components/ReportCardDesignEditor";
import { useSchoolSettings } from "../SettingsContext";

import { REPORT_CARD_TEMPLATE_OPTIONS, NEW_REPORT_CARD_TEMPLATES } from "../config/reportCardTemplates";
import "./ReportCardTemplates.css";
import { DEFAULT_MARK_COLORS, MARK_BAND_LABELS, scoreBand, contrastingText } from "../config/reportCardColors";

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

export default function ReportCard({ designer = false }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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
        setSelectedStudentId(searchParams.get("student") || String(nextStudents[0].id));
      }

      if (!selectedExamId && nextExams[0]?.id) {
        setSelectedExamId(searchParams.get("exam") || String(nextExams[0].id));
      }

      if (!academicYear) {
        setAcademicYear(searchParams.get("year") || settings?.academic_year || nextExams[0]?.academic_year || "2026-27");
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

  useEffect(() => {
    const id = searchParams.get("template");
    if (id) API.get("/marks/templates").then(({data}) => {
      const row = data.find(item => String(item.id) === id);
      if (row) openSavedDesign(row.configuration); else setMessage("Saved template was not found.");
    }).catch(() => setMessage("Unable to load the saved report template."));
    if (searchParams.get("student")) setSelectedStudentId(searchParams.get("student"));
    if (searchParams.get("exam")) setSelectedExamId(searchParams.get("exam"));
    if (searchParams.get("year")) setAcademicYear(searchParams.get("year"));
  }, [searchParams]);
  const [design, setDesign] = useState(DEFAULT_REPORT_DESIGN);
  const [markColors, setMarkColors] = useState(DEFAULT_MARK_COLORS);
  const passPercentage = reportData?.pass_percentage ?? (settings?.pass_percentage || 40);
  const [downloading, setDownloading] = useState(false);
  const template = templateOverride || settings?.report_card_template || "classic";

  const editableDesign = NEW_REPORT_CARD_TEMPLATES.some((item) => item.value === template);
  const accent = design.accent_color || ({heritage:"#1e3554",scholar:"#195548",horizon:"#086879",ledger:"#252525",studio:"#73415b"}[template] || "#2563eb");
  function openSavedDesign(configuration) {
    const {template: base, mark_colors: colours, ...details} = configuration;
    setTemplateOverride(base); setMarkColors(colours); setDesign({...DEFAULT_REPORT_DESIGN,...details});
  }
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
    setDownloading(true);
    try {
      const response = editableDesign ? await API.post("/marks/report-card-preview", {...design,template,mark_colors:markColors}, {
        params: {student_id:selectedStudentId, exam_id:selectedExamId}, responseType:"blob",
      }) : await API.get("/marks/report-card", {
        params: { student_id: selectedStudentId, exam_id: selectedExamId, template, ...Object.fromEntries(Object.entries(markColors).map(([key,value]) => [`${key}_color`,value])) },
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(
        new Blob([response.data], { type: "application/pdf" })
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `report_card_${selectedStudent?.admission_no || selectedStudentId}_${template}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      let detail = error.response?.data?.detail;
      if (error.response?.data instanceof Blob) {
        try { detail = JSON.parse(await error.response.data.text()).detail; } catch { /* Non-JSON response. */ }
      }
      setMessage(typeof detail === "string" ? detail : "Unable to download report card.");
    } finally {
      setDownloading(false);
    }
  }

  function reportLink(path, id=searchParams.get("template")) {
    const query = new URLSearchParams();
    if (id) query.set("template",id);
    if (selectedStudentId) query.set("student",selectedStudentId);
    if (selectedExamId) query.set("exam",selectedExamId);
    if (academicYear) query.set("year",academicYear);
    return `${path}?${query}`;
  }
  const previewData = {...reportData, school_name:settings?.school_name || "School",student_name:selectedStudent ? getStudentName(selectedStudent) : null,admission_no:selectedStudent?.admission_no,class_label:reportClassSection,exam_name:reportExamName,academic_year:academicYear};
  return (
    <div className="management-page report-card-page">
      <section className="page-heading no-print">
        <div>
          <p className="eyebrow">Assessments</p>
          <h2>{designer ? "Report Card Template Designer" : "Report Card"}</h2>
          <p>Generate a printable academic report by student, exam, and academic year.</p>
        </div>

        <div className="module-header-actions">
          {designer && <div className="form-field report-card-template-picker">
            <CustomSelect
              value={template}
              onChange={setTemplateOverride}
              options={REPORT_CARD_TEMPLATE_OPTIONS}
            />
          </div>}
          <Link className="secondary-button" to={reportLink(designer ? "/report-card" : "/report-card/designer")}>{designer ? "Back to report" : "Template Designer"}</Link>
          <button type="button" className="secondary-button" onClick={handleDownloadPdf} disabled={downloading || loading || !marks.length} aria-busy={downloading}>
            {downloading ? <span className="spinner" aria-hidden="true" /> : <Download size={18} />}
            {downloading ? "Preparing PDF…" : "Download PDF"}
          </button>
          <button type="button" className="primary-button" onClick={handlePrint}>
            <Printer size={18} />
            Print
          </button>
        </div>
      </section>

      {message && <div className="toast-notification no-print">{message}</div>}

      {designer && <>
      <section className="report-template-gallery no-print" aria-label="Report card designs">
        <div><h3>Choose your report card design</h3><p>Select a design, preview it below, then download. Your institution's default stays unchanged.</p></div>
        <div className="report-template-options">
          {NEW_REPORT_CARD_TEMPLATES.map((option) => (
            <button type="button" key={option.value} className={`report-template-option design-${option.value}`}
              aria-pressed={template === option.value} onClick={() => setTemplateOverride(option.value)}>
              <span className="report-template-mini" aria-hidden="true"><i /><b>ACADEMIC REPORT</b><em /><em /><em /><small>RESULTS · ATTENDANCE</small></span>
              <strong>{option.label}</strong><span>{option.description}</span>
              <small>{template === option.value ? "Selected design" : "Preview design"}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="report-color-panel no-print" aria-label="Marks highlight colours">
        <div><h3>Make the marks easy to read</h3><p>Choose colours for this download. Text contrast adjusts automatically.</p></div>
        <div className="report-color-options">{Object.entries(MARK_BAND_LABELS).map(([key,label]) => (
          <label key={key}>{label}<input type="color" aria-label={`${label} colour`} value={markColors[key]} onChange={(event) => setMarkColors((prev) => ({...prev,[key]:event.target.value}))} /><span>{markColors[key].toUpperCase()}</span></label>
        ))}<div className="report-color-reset"><button type="button" className="light-button" onClick={() => setMarkColors(DEFAULT_MARK_COLORS)}>Reset colours</button></div></div>
      </section>

      <ReportCardDesignEditor design={design} template={template} markColors={markColors} onChange={setDesign} onOpen={openSavedDesign} accent={accent} selectedId={searchParams.get("template")} onUse={id=>navigate(reportLink("/report-card",id))} />
      </>}

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

      {designer && editableDesign && !design.document_json && <button type="button" className="primary-button no-print" onClick={()=>setDesign({...design,document_json:createReportDocument(design,template)})}>Edit entire report as a document</button>}
      {designer && editableDesign && design.document_json && <button type="button" className="secondary-button no-print" onClick={()=>{if(window.confirm("Restore the original designed layout for this draft? Your saved template will stay unchanged until you save."))setDesign(prev=>({...prev,document_json:null}));}}>Restore original template layout</button>}
      {editableDesign && design.document_json ? <ReportDocumentEditor document={design.document_json} onChange={document_json=>setDesign(prev=>({...prev,document_json}))} data={previewData} colours={markColors} readOnly={!designer} template={template} accent={accent}/> : (
      <section className={`report-card-paper print-area template-${template} ${NEW_REPORT_CARD_TEMPLATES.some((item) => item.value === template) ? "report-designed" : ""}`} style={editableDesign ? {
        "--rc-ink":accent, "--rc-tint":`${accent}12`, "--rc-header-text":contrastingText(accent),
        "--rc-heading-font":design.font_family === "serif" ? "Georgia, serif" : design.font_family === "sans" ? "Arial, sans-serif" : undefined,
      } : undefined}>
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
          <h2 style={editableDesign ? reportTextStyle(design,"title") : undefined}>{editableDesign ? design.title : "Report Card"}</h2>
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
                    const percentage = mark.percentage ?? calculatePercentage(obtained, maximum);
                    const band = scoreBand(mark, passPercentage);
                    const highlight = band ? { backgroundColor: markColors[band], color: contrastingText(markColors[band]) } : {};

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
                        <td style={highlight} className="mark-highlight" title={band ? MARK_BAND_LABELS[band] : "Not assessed"}>{formatScore(obtained)}{band && <small>{MARK_BAND_LABELS[band]}</small>}</td>
                        <td>{formatScore(maximum)}</td>
                        <td>{percentage.toFixed(2)}%</td>
                        <td style={highlight} className="mark-highlight">{mark.grade || "-"}</td>
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
              {(!editableDesign || design.show_rank) && <div>
                <span>Class Rank</span>
                <strong>{reportData?.rank ? `${reportData.rank} of ${reportData.out_of}` : "-"}</strong>
              </div>}
              {(!editableDesign || design.show_attendance) && <div>
                <span>Attendance</span>
                <strong>
                  {reportData?.attendance_percent != null ? `${reportData.attendance_percent.toFixed(2)}%` : "-"}
                </strong>
              </div>}
            </div>
          </>
        )}

        <div className="report-mark-legend">{Object.entries(MARK_BAND_LABELS).map(([key,label]) => <span key={key}><i style={{backgroundColor:markColors[key]}} />{label}</span>)}</div>
        <p className="report-mark-key">Top: 90% and above. Passed: 75–89.99%. Average band: passing scores below 75% (not the class average). Failed: below {passPercentage}% or grade F. Failure rules take priority; absent and exempt subjects are not colour-coded.</p>
        {editableDesign && design.show_feedback && (
          <section className="report-card-feedback"><h3 style={reportTextStyle(design,"feedback_title")}>{design.feedback_title}</h3><p style={reportTextStyle(design,"feedback_prompt")}>{design.feedback_prompt}</p><div /><div /></section>
        )}
        <div className="report-card-signatures">
          <div style={editableDesign ? reportTextStyle(design,"teacher_label") : undefined}>{editableDesign ? design.teacher_label : "Class Teacher"}</div>
          <div style={editableDesign ? reportTextStyle(design,"coordinator_label") : undefined}>{editableDesign ? design.coordinator_label : "Exam Coordinator"}</div>
          <div style={editableDesign ? reportTextStyle(design,"principal_label") : undefined}>{editableDesign ? design.principal_label : "Principal"}</div>
        </div>
      </section>)}

      <div className="form-actions no-print">
        <button type="button" className="light-button" onClick={handlePrint}>
          <Download size={17} />
          Print / Save PDF
        </button>
      </div>
    </div>
  );
}
