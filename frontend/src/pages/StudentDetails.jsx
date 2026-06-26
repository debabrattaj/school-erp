import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  UserRound,
  BookOpen,
  Mail,
  Phone,
  CalendarCheck,
  Wallet,
  FileText,
  ClipboardList,
  RefreshCcw,
  Eye,
} from "lucide-react";

import API from "../api";
import {
  getModuleCustomFields,
} from "../services/moduleCustomFieldService";

export default function StudentDetails() {
  const { studentId } = useParams();
  const navigate = useNavigate();

  const [student, setStudent] = useState(null);
  const [classRecord, setClassRecord] = useState(null);

  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [feeRecords, setFeeRecords] = useState([]);
  const [markRecords, setMarkRecords] = useState([]);
  const [examRecords, setExamRecords] = useState([]);
  const [customFields, setCustomFields] = useState([]);

  const [activeTab, setActiveTab] = useState("profile");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadLegacyStudentCustomFields(recordId) {
    try {
      const response = await API.get(`/students/${recordId}/custom-fields`);
      return response.data || [];
    } catch {
      return [];
    }
  }

  async function loadStudentCustomFields(recordId) {
    try {
      const genericValues = await getModuleCustomFields("Students", recordId);

      if (genericValues && genericValues.length > 0) {
        return genericValues;
      }

      return await loadLegacyStudentCustomFields(recordId);
    } catch {
      return await loadLegacyStudentCustomFields(recordId);
    }
  }

  async function loadStudentDetails() {
    try {
      setLoading(true);
      setMessage("");

      const [
        studentResponse,
        classesResponse,
        attendanceResponse,
        feesResponse,
        marksResponse,
        examsResponse,
        customValues,
      ] = await Promise.all([
        API.get(`/students/${studentId}`),
        API.get("/classes/"),
        API.get("/attendance/").catch(() => ({ data: [] })),
        API.get("/fees/").catch(() => ({ data: [] })),
        API.get("/marks/").catch(() => ({ data: [] })),
        API.get("/exams/").catch(() => ({ data: [] })),
        loadStudentCustomFields(studentId),
      ]);

      const studentData = studentResponse.data;
      const classes = classesResponse.data || [];

      let matchedClass = null;

      if (studentData.class_id) {
        matchedClass = classes.find(
          (item) => Number(item.id) === Number(studentData.class_id)
        );
      }

      if (!matchedClass) {
        matchedClass = classes.find(
          (item) =>
            item.class_name === studentData.class_name &&
            item.section === studentData.section
        );
      }

      const allAttendance = attendanceResponse.data || [];
      const allFees = feesResponse.data || [];
      const allMarks = marksResponse.data || [];
      const allExams = examsResponse.data || [];

      setStudent(studentData);
      setClassRecord(matchedClass || null);

      setAttendanceRecords(
        allAttendance.filter(
          (item) => Number(item.student_id) === Number(studentId)
        )
      );

      setFeeRecords(
        allFees.filter((item) => Number(item.student_id) === Number(studentId))
      );

      setMarkRecords(
        allMarks.filter((item) => Number(item.student_id) === Number(studentId))
      );

      setExamRecords(allExams);
      setCustomFields(customValues || []);
    } catch (error) {
      console.error(error);
      setMessage(
        error.response?.data?.detail || "Unable to load student details."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStudentDetails();
  }, [studentId]);

  const examMap = useMemo(() => {
    const map = {};

    examRecords.forEach((exam) => {
      map[exam.id] = exam.exam_name || `Exam ID: ${exam.id}`;
    });

    return map;
  }, [examRecords]);

  const attendanceSummary = useMemo(() => {
    const present = attendanceRecords.filter(
      (item) => String(item.status || "").toLowerCase() === "present"
    ).length;

    const absent = attendanceRecords.filter(
      (item) => String(item.status || "").toLowerCase() === "absent"
    ).length;

    const late = attendanceRecords.filter(
      (item) => String(item.status || "").toLowerCase() === "late"
    ).length;

    return {
      total: attendanceRecords.length,
      present,
      absent,
      late,
    };
  }, [attendanceRecords]);

  const feeSummary = useMemo(() => {
    const total = feeRecords.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );

    const paid = feeRecords
      .filter((item) => String(item.status || "").toLowerCase() === "paid")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    return {
      total,
      paid,
      pending: total - paid,
    };
  }, [feeRecords]);

  const marksSummary = useMemo(() => {
    if (markRecords.length === 0) {
      return {
        average: "0.00",
        pass: 0,
        needsImprovement: 0,
      };
    }

    const percentages = markRecords.map((mark) => {
      const obtained = Number(mark.marks_obtained || 0);
      const max = Number(mark.max_marks || 0);

      if (!max) return 0;

      return (obtained / max) * 100;
    });

    const average =
      percentages.reduce((sum, value) => sum + value, 0) / percentages.length;

    return {
      average: average.toFixed(2),
      pass: percentages.filter((value) => value >= 40).length,
      needsImprovement: percentages.filter((value) => value < 40).length,
    };
  }, [markRecords]);

  function getCustomValue(field) {
    if (field.field_type === "checkbox") {
      return field.field_value === "true" ? "Yes" : "No";
    }

    return field.field_value || "-";
  }

  function getStatusClass(status) {
    const text = String(status || "").toLowerCase();

    if (["paid", "present", "pass", "active"].includes(text)) {
      return "status active";
    }

    if (["absent", "failed", "cancelled"].includes(text)) {
      return "status danger";
    }

    return "status warning";
  }

  function calculatePercentage(mark) {
    const obtained = Number(mark.marks_obtained || 0);
    const max = Number(mark.max_marks || 0);

    if (!max) return "0.00";

    return ((obtained / max) * 100).toFixed(2);
  }

  function getResultStatus(mark) {
    const percentage = Number(calculatePercentage(mark));

    if (percentage >= 90) return "Excellent";
    if (percentage >= 75) return "Very Good";
    if (percentage >= 60) return "Good";
    if (percentage >= 40) return "Pass";

    return "Needs Improvement";
  }

  if (loading) {
    return (
      <div className="management-page">
        <div className="loading-box">Loading student details...</div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="management-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Student Profile</p>
            <h2>Student not found</h2>
            <p>{message || "Unable to load student."}</p>
          </div>

          <button
            type="button"
            className="light-button"
            onClick={() => navigate("/students")}
          >
            <ArrowLeft size={17} />
            Back to Students
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Student 360 Profile</p>
          <h2>
            {student.first_name} {student.last_name}
          </h2>
          <p>Admission No: {student.admission_no || "-"}</p>
        </div>

        <div className="module-header-actions">
          <button
            type="button"
            className="light-button"
            onClick={() => navigate("/students")}
          >
            <ArrowLeft size={17} />
            Back
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={loadStudentDetails}
          >
            <RefreshCcw size={17} />
            Refresh
          </button>
        </div>
      </section>

      {message && <div className="message-box">{message}</div>}

      <section className="summary-strip report-summary-grid">
        <div className="summary-card">
          <UserRound size={22} />
          <div>
            <span>Student</span>
            <strong>
              {student.first_name} {student.last_name}
            </strong>
          </div>
        </div>

        <div className="summary-card">
          <BookOpen size={22} />
          <div>
            <span>Class</span>
            <strong>
              {classRecord ? (
                <button
                  type="button"
                  className="text-link-button"
                  onClick={() => navigate(`/classes/${classRecord.id}`)}
                >
                  {classRecord.class_name} - {classRecord.section}
                </button>
              ) : (
                `${student.class_name || "-"} ${student.section || ""}`
              )}
            </strong>
          </div>
        </div>

        <div className="summary-card">
          <CalendarCheck size={22} />
          <div>
            <span>Attendance</span>
            <strong>
              {attendanceSummary.present}/{attendanceSummary.total} Present
            </strong>
          </div>
        </div>

        <div className="summary-card warning">
          <Wallet size={22} />
          <div>
            <span>Pending Fees</span>
            <strong>₹{feeSummary.pending.toLocaleString("en-IN")}</strong>
          </div>
        </div>
      </section>

      <section className="student-profile-tabs">
        <button
          type="button"
          className={activeTab === "profile" ? "active" : ""}
          onClick={() => setActiveTab("profile")}
        >
          Profile
        </button>

        <button
          type="button"
          className={activeTab === "attendance" ? "active" : ""}
          onClick={() => setActiveTab("attendance")}
        >
          Attendance
        </button>

        <button
          type="button"
          className={activeTab === "fees" ? "active" : ""}
          onClick={() => setActiveTab("fees")}
        >
          Fees
        </button>

        <button
          type="button"
          className={activeTab === "marks" ? "active" : ""}
          onClick={() => setActiveTab("marks")}
        >
          Marks
        </button>

        <button
          type="button"
          className={activeTab === "custom" ? "active" : ""}
          onClick={() => setActiveTab("custom")}
        >
          Custom Fields
        </button>
      </section>

      {activeTab === "profile" && (
        <>
          <section className="form-panel">
            <div className="panel-header">
              <div>
                <h3>Personal & Academic Information</h3>
                <p>Core student details and class lookup.</p>
              </div>
            </div>

            <div className="details-grid">
              <p>
                <strong>Admission No:</strong> {student.admission_no || "-"}
              </p>
              <p>
                <strong>First Name:</strong> {student.first_name || "-"}
              </p>
              <p>
                <strong>Last Name:</strong> {student.last_name || "-"}
              </p>
              <p>
                <strong>Gender:</strong> {student.gender || "-"}
              </p>
              <p>
                <strong>Class:</strong>{" "}
                {classRecord ? (
                  <button
                    type="button"
                    className="text-link-button"
                    onClick={() => navigate(`/classes/${classRecord.id}`)}
                  >
                    {classRecord.class_name} - {classRecord.section}
                  </button>
                ) : (
                  `${student.class_name || "-"} ${student.section || ""}`
                )}
              </p>
              <p>
                <strong>Section:</strong> {student.section || "-"}
              </p>
              <p>
                <strong>Status:</strong> {student.status || "-"}
              </p>
              <p>
                <strong>Phone:</strong> {student.phone || "-"}
              </p>
              <p>
                <strong>Email:</strong> {student.email || "-"}
              </p>
            </div>
          </section>

          <section className="summary-strip report-summary-grid">
            <div className="summary-card">
              <Phone size={22} />
              <div>
                <span>Phone</span>
                <strong>{student.phone || "-"}</strong>
              </div>
            </div>

            <div className="summary-card">
              <Mail size={22} />
              <div>
                <span>Email</span>
                <strong>{student.email || "-"}</strong>
              </div>
            </div>

            <div className="summary-card">
              <BookOpen size={22} />
              <div>
                <span>Class Teacher</span>
                <strong>{classRecord?.class_teacher || "-"}</strong>
              </div>
            </div>

            <div className="summary-card">
              <BookOpen size={22} />
              <div>
                <span>Room No</span>
                <strong>{classRecord?.room_no || "-"}</strong>
              </div>
            </div>
          </section>
        </>
      )}

      {activeTab === "attendance" && (
        <>
          <section className="summary-strip report-summary-grid">
            <div className="summary-card">
              <CalendarCheck size={22} />
              <div>
                <span>Total Records</span>
                <strong>{attendanceSummary.total}</strong>
              </div>
            </div>

            <div className="summary-card">
              <CalendarCheck size={22} />
              <div>
                <span>Present</span>
                <strong>{attendanceSummary.present}</strong>
              </div>
            </div>

            <div className="summary-card warning">
              <CalendarCheck size={22} />
              <div>
                <span>Absent</span>
                <strong>{attendanceSummary.absent}</strong>
              </div>
            </div>

            <div className="summary-card">
              <CalendarCheck size={22} />
              <div>
                <span>Late</span>
                <strong>{attendanceSummary.late}</strong>
              </div>
            </div>
          </section>

          <section className="table-panel">
            <div className="table-toolbar">
              <div>
                <h3>Attendance History</h3>
                <p>{attendanceRecords.length} record(s) found</p>
              </div>
            </div>

            <div className="table-wrapper">
              <table className="classic-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Remarks</th>
                  </tr>
                </thead>

                <tbody>
                  {attendanceRecords.length === 0 ? (
                    <tr>
                      <td colSpan="3" className="empty-table">
                        No attendance records found.
                      </td>
                    </tr>
                  ) : (
                    attendanceRecords.map((item) => (
                      <tr key={item.id}>
                        <td>{item.attendance_date || "-"}</td>
                        <td>
                          <span className={getStatusClass(item.status)}>
                            {item.status || "-"}
                          </span>
                        </td>
                        <td>{item.remarks || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {activeTab === "fees" && (
        <>
          <section className="summary-strip report-summary-grid">
            <div className="summary-card">
              <Wallet size={22} />
              <div>
                <span>Total Fees</span>
                <strong>₹{feeSummary.total.toLocaleString("en-IN")}</strong>
              </div>
            </div>

            <div className="summary-card">
              <Wallet size={22} />
              <div>
                <span>Paid</span>
                <strong>₹{feeSummary.paid.toLocaleString("en-IN")}</strong>
              </div>
            </div>

            <div className="summary-card warning">
              <Wallet size={22} />
              <div>
                <span>Pending</span>
                <strong>₹{feeSummary.pending.toLocaleString("en-IN")}</strong>
              </div>
            </div>
          </section>

          <section className="table-panel">
            <div className="table-toolbar">
              <div>
                <h3>Fees History</h3>
                <p>{feeRecords.length} record(s) found</p>
              </div>
            </div>

            <div className="table-wrapper">
              <table className="classic-table">
                <thead>
                  <tr>
                    <th>Fee Type</th>
                    <th>Amount</th>
                    <th>Due Date</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {feeRecords.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="empty-table">
                        No fee records found.
                      </td>
                    </tr>
                  ) : (
                    feeRecords.map((item) => (
                      <tr key={item.id}>
                        <td>{item.fee_type || "-"}</td>
                        <td>
                          ₹{Number(item.amount || 0).toLocaleString("en-IN")}
                        </td>
                        <td>{item.due_date || "-"}</td>
                        <td>
                          <span className={getStatusClass(item.status)}>
                            {item.status || "Pending"}
                          </span>
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

      {activeTab === "marks" && (
        <>
          <section className="summary-strip report-summary-grid">
            <div className="summary-card">
              <FileText size={22} />
              <div>
                <span>Marks Records</span>
                <strong>{markRecords.length}</strong>
              </div>
            </div>

            <div className="summary-card">
              <FileText size={22} />
              <div>
                <span>Average %</span>
                <strong>{marksSummary.average}%</strong>
              </div>
            </div>

            <div className="summary-card">
              <FileText size={22} />
              <div>
                <span>Pass</span>
                <strong>{marksSummary.pass}</strong>
              </div>
            </div>

            <div className="summary-card warning">
              <FileText size={22} />
              <div>
                <span>Needs Improvement</span>
                <strong>{marksSummary.needsImprovement}</strong>
              </div>
            </div>
          </section>

          <section className="table-panel">
            <div className="table-toolbar">
              <div>
                <h3>Exam / Marks History</h3>
                <p>{markRecords.length} record(s) found</p>
              </div>
            </div>

            <div className="table-wrapper">
              <table className="classic-table">
                <thead>
                  <tr>
                    <th>Exam</th>
                    <th>Subject</th>
                    <th>Marks</th>
                    <th>Percentage</th>
                    <th>Result</th>
                  </tr>
                </thead>

                <tbody>
                  {markRecords.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="empty-table">
                        No marks records found.
                      </td>
                    </tr>
                  ) : (
                    markRecords.map((mark) => (
                      <tr key={mark.id}>
                        <td>{examMap[mark.exam_id] || "-"}</td>
                        <td>{mark.subject || "-"}</td>
                        <td>
                          {mark.marks_obtained ?? 0} / {mark.max_marks ?? 0}
                        </td>
                        <td>{calculatePercentage(mark)}%</td>
                        <td>
                          <span className={getStatusClass(getResultStatus(mark))}>
                            {getResultStatus(mark)}
                          </span>
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

      {activeTab === "custom" && (
        <section className="form-panel">
          <div className="panel-header">
            <div>
              <h3>Custom Fields</h3>
              <p>Extra fields added using layout builder.</p>
            </div>
          </div>

          {customFields.length === 0 ? (
            <div className="empty-table">No custom fields found.</div>
          ) : (
            <div className="details-grid">
              {customFields.map((field) => (
                <p key={field.id}>
                  <strong>{field.field_label || field.field_key}:</strong>{" "}
                  {getCustomValue(field)}
                </p>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}