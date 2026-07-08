import { useEffect, useState } from "react";

import API from "../api";

const TABS = [
  ["summary", "Summary"],
  ["attendance", "Attendance"],
  ["marks", "Marks"],
  ["fees", "Fees"],
  ["history", "History"],
];

function getApiErrorMessage(error, fallback) {
  return error?.response?.data?.detail || fallback;
}

export default function Portal() {
  const [children, setChildren] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [activeTab, setActiveTab] = useState("summary");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return undefined;

    const timeoutId = window.setTimeout(() => {
      setMessage("");
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  const [loading, setLoading] = useState(false);

  const [summary, setSummary] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [marks, setMarks] = useState(null);
  const [fees, setFees] = useState(null);
  const [history, setHistory] = useState([]);
  const [yearFilter, setYearFilter] = useState("");

  async function loadChildren() {
    try {
      const response = await API.get("/portal/children");
      const list = response.data || [];
      setChildren(list);
      if (list.length && !selectedId) {
        setSelectedId(list[0].id);
      }
      if (!list.length) {
        setMessage(
          "No student is linked to your account yet. Please contact the school office."
        );
      }
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load your students."));
    }
  }

  async function loadStudentData(studentId) {
    if (!studentId) return;
    setLoading(true);
    setMessage("");
    const params = yearFilter ? { academic_year: yearFilter } : {};
    try {
      const [summaryRes, attendanceRes, marksRes, feesRes, historyRes] =
        await Promise.all([
          API.get(`/portal/students/${studentId}/summary`),
          API.get(`/portal/students/${studentId}/attendance`, { params }),
          API.get(`/portal/students/${studentId}/marks`, { params }),
          API.get(`/portal/students/${studentId}/fees`, { params }),
          API.get(`/portal/students/${studentId}/enrollments`),
        ]);
      setSummary(summaryRes.data);
      setAttendance(attendanceRes.data);
      setMarks(marksRes.data);
      setFees(feesRes.data);
      setHistory(historyRes.data || []);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load student data."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadChildren();
  }, []);

  useEffect(() => {
    loadStudentData(selectedId);
  }, [selectedId, yearFilter]);

  const selectedChild = children.find((child) => child.id === selectedId);
  const yearOptions = [
    ...new Set(history.map((item) => item.academic_year).filter(Boolean)),
  ];

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Family Portal</p>
          <h2>Student Portal</h2>
          <p>View attendance, marks, fees and academic history.</p>
        </div>
      </section>

      {message && <div className="toast-notification">{message}</div>}

      {children.length > 1 && (
        <section className="form-panel">
          <div className="classic-form">
            <div className="form-grid">
              <div className="form-field">
                <label>Student</label>
                <select
                  value={selectedId || ""}
                  onChange={(event) => setSelectedId(Number(event.target.value))}
                >
                  {children.map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.full_name} ({child.admission_no})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </section>
      )}

      {selectedChild && (
        <section className="form-panel">
          <div className="panel-header">
            <div>
              <h3>{selectedChild.full_name}</h3>
              <p>
                Admission No: {selectedChild.admission_no} | Class:{" "}
                {[selectedChild.class_name, selectedChild.section]
                  .filter(Boolean)
                  .join(" - ") || "-"}{" "}
                | Status: {selectedChild.student_status || "-"}
              </p>
            </div>

            <div className="form-field">
              <label>Academic Year</label>
              <select
                value={yearFilter}
                onChange={(event) => setYearFilter(event.target.value)}
              >
                <option value="">All Years</option>
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: "1rem" }}>
            {TABS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={activeTab === key ? "primary-button" : "secondary-button"}
                style={{ marginRight: "0.5rem" }}
                onClick={() => setActiveTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {loading && <p>Loading...</p>}

          {!loading && activeTab === "summary" && summary && (
            <div className="table-wrapper">
            <table className="classic-table">
              <tbody>
                <tr>
                  <th>Current Academic Year</th>
                  <td>{summary.current_academic_year || "-"}</td>
                </tr>
                <tr>
                  <th>Current Class</th>
                  <td>
                    {summary.current_enrollment
                      ? [
                          summary.current_enrollment.class_name,
                          summary.current_enrollment.section,
                        ]
                          .filter(Boolean)
                          .join(" - ")
                      : "-"}
                  </td>
                </tr>
                <tr>
                  <th>Roll No</th>
                  <td>{summary.current_enrollment?.roll_no || "-"}</td>
                </tr>
                <tr>
                  <th>House</th>
                  <td>{summary.student?.house || "-"}</td>
                </tr>
                <tr>
                  <th>Father</th>
                  <td>{summary.guardian?.father_name || "-"}</td>
                </tr>
                <tr>
                  <th>Mother</th>
                  <td>{summary.guardian?.mother_name || "-"}</td>
                </tr>
              </tbody>
            </table>
            </div>
          )}

          {!loading && activeTab === "attendance" && attendance && (
            <>
              <div className="message-box">
                Attendance:{" "}
                {attendance.attendance_percentage != null
                  ? `${attendance.attendance_percentage}%`
                  : "No records"}{" "}
                | Present: {attendance.counts.Present} | Absent:{" "}
                {attendance.counts.Absent} | Late: {attendance.counts.Late} | Half
                Day: {attendance.counts["Half Day"]}
              </div>
              <div className="table-wrapper">
              <table className="classic-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Year</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.records.slice(0, 60).map((record, index) => (
                    <tr key={index}>
                      <td>{record.date}</td>
                      <td>{record.status}</td>
                      <td>{record.academic_year || "-"}</td>
                      <td>{record.remarks || "-"}</td>
                    </tr>
                  ))}
                  {!attendance.records.length && (
                    <tr>
                      <td colSpan={4}>No attendance records found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            </>
          )}

          {!loading && activeTab === "marks" && marks && (
            <>
              {marks.exams.map((exam) => (
                <div key={exam.exam_name} style={{ marginBottom: "1.5rem" }}>
                  <h4>
                    {exam.exam_name} ({exam.academic_year || "-"}) —{" "}
                    {exam.percentage != null ? `${exam.percentage}%` : "-"}
                  </h4>
                  <div className="table-wrapper">
                  <table className="classic-table">
                    <thead>
                      <tr>
                        <th>Subject</th>
                        <th>Marks</th>
                        <th>Max</th>
                        <th>Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exam.subjects.map((subject, index) => (
                        <tr key={index}>
                          <td>{subject.subject}</td>
                          <td>{subject.marks_obtained}</td>
                          <td>{subject.max_marks}</td>
                          <td>{subject.grade || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              ))}
              {!marks.exams.length && <p>No marks recorded yet.</p>}
            </>
          )}

          {!loading && activeTab === "fees" && fees && (
            <>
              <div className="message-box">
                Total: {fees.totals.total_amount} | Paid: {fees.totals.total_paid} |{" "}
                <strong>Due: {fees.totals.total_due}</strong>
              </div>
              <div className="table-wrapper">
              <table className="classic-table">
                <thead>
                  <tr>
                    <th>Fee Type</th>
                    <th>Year</th>
                    <th>Total</th>
                    <th>Paid</th>
                    <th>Due</th>
                    <th>Status</th>
                    <th>Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {fees.fees.map((fee) => (
                    <tr key={fee.id}>
                      <td>{fee.fee_type}</td>
                      <td>{fee.academic_year || "-"}</td>
                      <td>{fee.total_amount}</td>
                      <td>{fee.paid_amount}</td>
                      <td>{fee.due_amount}</td>
                      <td>{fee.payment_status}</td>
                      <td>{fee.receipt_no || "-"}</td>
                    </tr>
                  ))}
                  {!fees.fees.length && (
                    <tr>
                      <td colSpan={7}>No fee records found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            </>
          )}

          {!loading && activeTab === "history" && (
            <div className="table-wrapper">
            <table className="classic-table">
              <thead>
                <tr>
                  <th>Academic Year</th>
                  <th>Class</th>
                  <th>Roll No</th>
                  <th>Status</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item, index) => (
                  <tr key={index}>
                    <td>{item.academic_year}</td>
                    <td>
                      {[item.class_name, item.section].filter(Boolean).join(" - ") ||
                        "-"}
                    </td>
                    <td>{item.roll_no || "-"}</td>
                    <td>{item.enrollment_status}</td>
                    <td>{item.promotion_status}</td>
                  </tr>
                ))}
                {!history.length && (
                  <tr>
                    <td colSpan={5}>No enrollment history yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
