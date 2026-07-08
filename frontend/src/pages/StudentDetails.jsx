import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarCheck,
  Download,
  Edit,
  FileText,
  Wallet,
} from "lucide-react";

import API from "../api";
import { resolveFileUrl } from "../utils/files";
import { useMoney } from "../utils/money";
import { getModuleCustomFields } from "../services/moduleCustomFieldService";

function getFeeAmount(fee) {
  return Number(fee.total_amount ?? fee.amount ?? 0);
}

function getPaidAmount(fee) {
  return Number(fee.paid_amount ?? (String(fee.status || "").toLowerCase() === "paid" ? getFeeAmount(fee) : 0));
}

function getStudentDisplayName(student) {
  if (!student) return "-";

  return (
    student.student_name ||
    student.name ||
    `${student.first_name || ""} ${student.last_name || ""}`.trim() ||
    "Student"
  );
}

function getInitials(name) {
  return String(name || "Student")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function StudentDetails() {
  const { studentId } = useParams();
  const money = useMoney();
  const navigate = useNavigate();

  const [student, setStudent] = useState(null);
  const [classRecord, setClassRecord] = useState(null);
  const [customFields, setCustomFields] = useState([]);

  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [feeRecords, setFeeRecords] = useState([]);
  const [markRecords, setMarkRecords] = useState([]);
  const [examRecords, setExamRecords] = useState([]);
  const [enrollmentRecords, setEnrollmentRecords] = useState([]);
  const [hostelAllocations, setHostelAllocations] = useState([]);
  const [transportAssignments, setTransportAssignments] = useState([]);
  const [healthVisits, setHealthVisits] = useState([]);
  const [messAttendance, setMessAttendance] = useState([]);
  const [libraryIssues, setLibraryIssues] = useState([]);
  const [inventoryIssues, setInventoryIssues] = useState([]);

  const [activeTab, setActiveTab] = useState("profile");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return undefined;

    const timeoutId = window.setTimeout(() => {
      setMessage("");
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

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

  async function safeGet(url, fallback = []) {
    try {
      const response = await API.get(url);
      return response.data || fallback;
    } catch {
      return fallback;
    }
  }

  async function loadStudentDetails() {
    try {
      setLoading(true);
      setMessage("");

      const [
        studentData,
        classes,
        attendance,
        fees,
        marks,
        exams,
        enrollments,
        hostel,
        transport,
        health,
        mess,
        library,
        inventory,
        customValues,
      ] = await Promise.all([
        safeGet(`/students/${studentId}`, null),
        safeGet("/classes/"),
        safeGet(`/attendance/student/${studentId}`),
        safeGet(`/fees/student/${studentId}`),
        safeGet(`/marks/student/${studentId}`),
        safeGet("/exams/"),
        safeGet(`/student-enrollments/?student_id=${studentId}`),
        safeGet("/hostel/allocations/"),
        safeGet("/transport/assignments/"),
        safeGet(`/health-infirmary/visits/?student_id=${studentId}`),
        safeGet("/mess/attendance/"),
        safeGet(`/library/issues/?student_id=${studentId}`),
        safeGet("/inventory/transactions/"),
        loadStudentCustomFields(studentId),
      ]);

      if (!studentData) {
        setStudent(null);
        setMessage("Student not found.");
        return;
      }

      const matchedClass =
        classes.find((item) => Number(item.id) === Number(studentData.class_id)) ||
        classes.find(
          (item) =>
            item.class_name === studentData.class_name &&
            item.section === studentData.section
        ) ||
        null;

      setStudent(studentData);
      setClassRecord(matchedClass);
      setAttendanceRecords(attendance || []);
      setFeeRecords(fees || []);
      setMarkRecords(marks || []);
      setExamRecords(exams || []);
      setEnrollmentRecords(enrollments || []);
      setHostelAllocations(
        (hostel || []).filter((item) => Number(item.student_id) === Number(studentId))
      );
      setTransportAssignments(
        (transport || []).filter((item) => Number(item.student_id) === Number(studentId))
      );
      setHealthVisits(health || []);
      setMessAttendance(
        (mess || []).filter((item) => Number(item.student_id) === Number(studentId))
      );
      setLibraryIssues(library || []);
      setInventoryIssues(
        (inventory || []).filter(
          (item) => Number(item.issued_to_student_id) === Number(studentId)
        )
      );
      setCustomFields(customValues || []);
    } catch (error) {
      console.error(error);
      setMessage(error.response?.data?.detail || "Unable to load student details.");
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
      map[exam.id] = exam.exam_name || exam.name || `Exam ID: ${exam.id}`;
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

    return { total: attendanceRecords.length, present, absent, late };
  }, [attendanceRecords]);

  const feeSummary = useMemo(() => {
    const total = feeRecords.reduce((sum, item) => sum + getFeeAmount(item), 0);
    const paid = feeRecords.reduce((sum, item) => sum + getPaidAmount(item), 0);
    return { total, paid, pending: Math.max(total - paid, 0) };
  }, [feeRecords]);

  const marksSummary = useMemo(() => {
    if (markRecords.length === 0) {
      return { average: "0.00", pass: 0, needsImprovement: 0 };
    }

    const percentages = markRecords.map((mark) => {
      const obtained = Number(mark.marks_obtained || 0);
      const max = Number(mark.max_marks || mark.total_marks || 0);
      return max ? (obtained / max) * 100 : 0;
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

    if (["paid", "present", "pass", "active", "returned", "recovered", "closed"].includes(text)) {
      return "status active";
    }

    if (["absent", "failed", "cancelled", "lost", "damaged", "referred"].includes(text)) {
      return "status danger";
    }

    return "status warning";
  }

  function calculatePercentage(mark) {
    const obtained = Number(mark.marks_obtained || 0);
    const max = Number(mark.max_marks || mark.total_marks || 0);
    return max ? ((obtained / max) * 100).toFixed(2) : "0.00";
  }

  function getResultStatus(mark) {
    const percentage = Number(calculatePercentage(mark));
    if (percentage >= 90) return "Excellent";
    if (percentage >= 75) return "Very Good";
    if (percentage >= 60) return "Good";
    if (percentage >= 40) return "Pass";
    return "Needs Improvement";
  }

  const tabs = [
    ["profile", "Profile"],
    ["enrollment", "Enrollment"],
    ["attendance", "Attendance"],
    ["fees", "Fees"],
    ["marks", "Marks"],
    ["hostel", "Hostel"],
    ["transport", "Transport"],
    ["health", "Health"],
    ["mess", "Mess"],
    ["library", "Library"],
    ["inventory", "Inventory"],
    ["custom", "Custom Fields"],
  ];

  if (loading) {
    return (
      <div className="management-page">
        <div className="loading-box">Loading student 360 profile...</div>
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

          <button type="button" className="light-button" onClick={() => navigate("/students")}>
            <ArrowLeft size={17} />
            Back to Students
          </button>
        </section>
      </div>
    );
  }

  const studentName = getStudentDisplayName(student);
  const classDisplay = classRecord
    ? `${classRecord.class_name} - ${classRecord.section}`
    : `${student.class_name || "-"} ${student.section || ""}`.trim();
  const studentStatus = student.student_status || student.status || "Active";

  async function downloadDoc(endpoint, filePrefix) {
    try {
      const response = await API.get(`/students/${student.id}/${endpoint}`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(
        new Blob([response.data], { type: "application/pdf" })
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `${filePrefix}_${student.admission_no || student.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      const detail = error.response?.data?.detail;
      setMessage(typeof detail === "string" ? detail : "Unable to download document.");
    }
  }

  return (
    <div className="management-page student360-page">
      <section className="student360-hero">
        <div className="student360-profile">
          <div className="student360-avatar">
            {student.photo_url ? (
              <img src={resolveFileUrl(student.photo_url)} alt={studentName} />
            ) : (
              <span>{getInitials(studentName)}</span>
            )}
          </div>

          <div className="student360-title">
            <p className="eyebrow">Student 360 Profile</p>
            <h2>{studentName}</h2>
            <div className="student360-tags">
              <span>{student.admission_no || "No Admission No"}</span>
              <span>{classDisplay || "-"}</span>
              <span className={getStatusClass(studentStatus)}>{studentStatus}</span>
            </div>
          </div>
        </div>

        <div className="student360-actions">
          <button type="button" className="light-button" onClick={() => navigate("/students")}>
            <ArrowLeft size={17} />
            Back
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => navigate(`/students?edit=${student.id}`)}
          >
            <Edit size={17} />
            Edit
          </button>
          
          <button type="button" className="secondary-button" onClick={() => downloadDoc("id-card", "id_card")}>
            <Download size={17} /> ID Card
          </button>
          <button type="button" className="secondary-button" onClick={() => downloadDoc("bonafide", "bonafide")}>
            <Download size={17} /> Bonafide
          </button>
          <button type="button" className="secondary-button" onClick={() => downloadDoc("transfer-certificate", "transfer_certificate")}>
            <Download size={17} /> Transfer Cert.
          </button>
          <button type="button" className="secondary-button" onClick={() => downloadDoc("transcript", "transcript")}>
            <Download size={17} /> Transcript
          </button>
        </div>
      </section>

      {message && <div className="toast-notification">{message}</div>}

      <section className="student-profile-tabs">
        {tabs.map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            className={activeTab === tab ? "active" : ""}
            onClick={() => setActiveTab(tab)}
          >
            {label}
          </button>
        ))}
      </section>

      {activeTab === "profile" && (
        <>
          <section className="student360-panel">
            <PanelTitle title="Personal & Academic Information" text="Core student details and class lookup." />
            <div className="student360-detail-grid">
              <Detail label="Admission No" value={student.admission_no} />
              <Detail label="Name" value={getStudentDisplayName(student)} />
              <Detail label="Gender" value={student.gender} />
              <Detail
                label="Class"
                value={
                  classRecord
                    ? `${classRecord.class_name} - Section ${classRecord.section}`
                    : `${student.class_name || "-"} ${student.section || ""}`
                }
              />
              <Detail label="Status" value={student.status} />
              <Detail label="Phone" value={student.phone} />
              <Detail label="Email" value={student.email} />
            </div>
          </section>

        </>
      )}

      {activeTab === "enrollment" && (
        <RecordsTable
          title="Enrollment History"
          count={enrollmentRecords.length}
          headers={["Academic Year", "Class", "Roll No", "Status", "Promotion", "Start", "End"]}
        >
          {enrollmentRecords.map((item) => (
            <tr key={item.id}>
              <td>{item.academic_year}</td>
              <td>{item.class_display || `${item.class_name_snapshot || "-"} - ${item.section_snapshot || "-"}`}</td>
              <td>{item.roll_no || "-"}</td>
              <td><span className={getStatusClass(item.enrollment_status)}>{item.enrollment_status}</span></td>
              <td>{item.promotion_status || "-"}</td>
              <td>{item.start_date || "-"}</td>
              <td>{item.end_date || "-"}</td>
            </tr>
          ))}
        </RecordsTable>
      )}

      {activeTab === "attendance" && (
        <>
          <section className="student360-metrics">
            <SummaryCard icon={CalendarCheck} label="Total Records" value={attendanceSummary.total} />
            <SummaryCard icon={CalendarCheck} label="Present" value={attendanceSummary.present} />
            <SummaryCard icon={CalendarCheck} label="Absent" value={attendanceSummary.absent} warning />
            <SummaryCard icon={CalendarCheck} label="Late" value={attendanceSummary.late} />
          </section>
          <RecordsTable title="Attendance History" count={attendanceRecords.length} headers={["Academic Year", "Class", "Date", "Status", "Remarks"]}>
            {attendanceRecords.map((item) => (
              <tr key={item.id}>
                <td>{item.academic_year || "-"}</td>
                <td>
                  {[item.class_name_snapshot, item.section_snapshot]
                    .filter(Boolean)
                    .join(" - ") || "-"}
                </td>
                <td>{item.attendance_date || "-"}</td>
                <td><span className={getStatusClass(item.status)}>{item.status || "-"}</span></td>
                <td>{item.remarks || "-"}</td>
              </tr>
            ))}
          </RecordsTable>
        </>
      )}

      {activeTab === "fees" && (
        <>
          <section className="student360-metrics">
            <SummaryCard icon={Wallet} label="Total Fees" value={money(feeSummary.total)} />
            <SummaryCard icon={Wallet} label="Paid" value={money(feeSummary.paid)} />
            <SummaryCard icon={Wallet} label="Pending" value={money(feeSummary.pending)} warning />
          </section>
          <RecordsTable title="Fees History" count={feeRecords.length} headers={["Academic Year", "Class", "Fee Type", "Total", "Paid", "Balance", "Payment Date", "Status"]}>
            {feeRecords.map((item) => (
              <tr key={item.id}>
                <td>{item.academic_year || "-"}</td>
                <td>
                  {[item.class_name_snapshot, item.section_snapshot]
                    .filter(Boolean)
                    .join(" - ") || "-"}
                </td>
                <td>{item.fee_type || "-"}</td>
                <td>{money(getFeeAmount(item))}</td>
                <td>{money(getPaidAmount(item))}</td>
                <td>{money(item.due_amount ?? Math.max(getFeeAmount(item) - getPaidAmount(item), 0))}</td>
                <td>{item.payment_date || "-"}</td>
                <td><span className={getStatusClass(item.payment_status)}>{item.payment_status || "Unpaid"}</span></td>
              </tr>
            ))}
          </RecordsTable>
        </>
      )}

      {activeTab === "marks" && (
        <>
          <section className="student360-metrics">
            <SummaryCard icon={FileText} label="Marks Records" value={markRecords.length} />
            <SummaryCard icon={FileText} label="Average %" value={`${marksSummary.average}%`} />
            <SummaryCard icon={FileText} label="Pass" value={marksSummary.pass} />
            <SummaryCard icon={FileText} label="Needs Improvement" value={marksSummary.needsImprovement} warning />
          </section>
          <RecordsTable title="Exam / Marks History" count={markRecords.length} headers={["Exam", "Academic Year", "Subject", "Marks", "Percentage", "Result"]}>
            {markRecords.map((mark) => (
              <tr key={mark.id}>
                <td>{examMap[mark.exam_id] || "-"}</td>
                <td>{mark.academic_year || "-"}</td>
                <td>{mark.subject_name || mark.subject || "-"}</td>
                <td>{mark.marks_obtained ?? 0} / {mark.max_marks ?? mark.total_marks ?? 0}</td>
                <td>{calculatePercentage(mark)}%</td>
                <td><span className={getStatusClass(getResultStatus(mark))}>{getResultStatus(mark)}</span></td>
              </tr>
            ))}
          </RecordsTable>
        </>
      )}

      {activeTab === "hostel" && (
        <RecordsTable title="Hostel History" count={hostelAllocations.length} headers={["Block", "Room", "Bed", "Start", "End", "Status"]}>
          {hostelAllocations.map((item) => (
            <tr key={item.id}>
              <td>{item.block_name || "-"}</td>
              <td>{item.room_no || "-"}</td>
              <td>{item.bed_no || "-"}</td>
              <td>{item.start_date || "-"}</td>
              <td>{item.end_date || "-"}</td>
              <td><span className={getStatusClass(item.status)}>{item.status}</span></td>
            </tr>
          ))}
        </RecordsTable>
      )}

      {activeTab === "transport" && (
        <RecordsTable title="Transport History" count={transportAssignments.length} headers={["Route", "Vehicle", "Pickup Point", "Start", "End", "Status"]}>
          {transportAssignments.map((item) => (
            <tr key={item.id}>
              <td>{item.route_name || "-"}</td>
              <td>{item.vehicle_no || "-"}</td>
              <td>{item.stop_name || "-"}</td>
              <td>{item.start_date || "-"}</td>
              <td>{item.end_date || "-"}</td>
              <td><span className={getStatusClass(item.status)}>{item.status}</span></td>
            </tr>
          ))}
        </RecordsTable>
      )}

      {activeTab === "health" && (
        <RecordsTable title="Health Infirmary History" count={healthVisits.length} headers={["Date", "Symptoms", "Diagnosis", "Medicine", "Follow Up", "Status"]}>
          {healthVisits.map((item) => (
            <tr key={item.id}>
              <td>{item.visit_date || "-"}</td>
              <td>{item.symptoms || "-"}</td>
              <td>{item.diagnosis || "-"}</td>
              <td>{item.medicine_given || "-"}</td>
              <td>{item.follow_up_date || "-"}</td>
              <td><span className={getStatusClass(item.status)}>{item.status}</span></td>
            </tr>
          ))}
        </RecordsTable>
      )}

      {activeTab === "mess" && (
        <RecordsTable title="Mess Attendance" count={messAttendance.length} headers={["Date", "Meal", "Status", "Remarks"]}>
          {messAttendance.map((item) => (
            <tr key={item.id}>
              <td>{item.meal_date || "-"}</td>
              <td>{item.meal_type || "-"}</td>
              <td><span className={getStatusClass(item.status)}>{item.status}</span></td>
              <td>{item.remarks || "-"}</td>
            </tr>
          ))}
        </RecordsTable>
      )}

      {activeTab === "library" && (
        <RecordsTable title="Library Issue History" count={libraryIssues.length} headers={["Book", "Issue Date", "Due Date", "Return Date", "Status", "Fine"]}>
          {libraryIssues.map((item) => (
            <tr key={item.id}>
              <td>{item.accession_no ? `${item.accession_no} - ${item.book_title}` : item.book_title}</td>
              <td>{item.issue_date || "-"}</td>
              <td>{item.due_date || "-"}</td>
              <td>{item.return_date || "-"}</td>
              <td><span className={getStatusClass(item.status)}>{item.status}</span></td>
              <td>{money(item.fine_amount)}</td>
            </tr>
          ))}
        </RecordsTable>
      )}

      {activeTab === "inventory" && (
        <RecordsTable title="Inventory Issue History" count={inventoryIssues.length} headers={["Date", "Item", "Type", "Quantity", "Reference", "Remarks"]}>
          {inventoryIssues.map((item) => (
            <tr key={item.id}>
              <td>{item.transaction_date || "-"}</td>
              <td>{item.item_code ? `${item.item_code} - ${item.item_name}` : item.item_name}</td>
              <td>{item.transaction_type || "-"}</td>
              <td>{item.quantity || 0}</td>
              <td>{item.reference_no || "-"}</td>
              <td>{item.remarks || "-"}</td>
            </tr>
          ))}
        </RecordsTable>
      )}

      {activeTab === "custom" && (
        <section className="student360-panel">
          <PanelTitle title="Custom Fields" text="Extra fields added using layout builder." />
          {customFields.length === 0 ? (
            <div className="empty-table">No custom fields found.</div>
          ) : (
            <div className="student360-detail-grid">
              {customFields.map((field) => (
                <Detail
                  key={field.id || field.field_key}
                  label={field.field_label || field.field_key}
                  value={getCustomValue(field)}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, warning = false }) {
  return (
    <div className={warning ? "student360-metric warning" : "student360-metric"}>
      <span className="student360-metric-icon">
        <Icon size={18} />
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function PanelTitle({ title, text }) {
  return (
    <div className="panel-header">
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="student360-detail-item">
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

function RecordsTable({ title, count, headers, children }) {
  return (
    <section className="student360-table-panel">
      <div className="table-toolbar">
        <div>
          <h3>{title}</h3>
          <p>{count} record(s) found</p>
        </div>
      </div>

      <div className="table-wrapper">
        <table className="classic-table">
          <thead>
            <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
          </thead>
          <tbody>
            {count === 0 ? (
              <tr>
                <td colSpan={headers.length} className="empty-table">
                  No records found.
                </td>
              </tr>
            ) : (
              children
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
