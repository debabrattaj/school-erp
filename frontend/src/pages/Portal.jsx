import { useEffect, useState } from "react";
import { QrCode, X, Send } from "lucide-react";
import QRCode from "qrcode";

import API from "../api";
import { getUser } from "../auth";

const TABS = [
  ["summary", "Summary"],
  ["attendance", "Attendance"],
  ["marks", "Marks"],
  ["fees", "Fees"],
  ["timetable", "Timetable"],
  ["homework", "Homework"],
  ["messages", "Messages"],
  ["history", "History"],
];

function getApiErrorMessage(error, fallback) {
  return error?.response?.data?.detail || fallback;
}

export default function Portal() {
  const user = getUser();
  const isParent = user?.role === "Parent";
  const [children, setChildren] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [activeTab, setActiveTab] = useState("summary");
  const [message, setMessage] = useState("");
  const [paymentEnabled, setPaymentEnabled] = useState(false);
  const [upiPayment, setUpiPayment] = useState(null);
  const [upiReference, setUpiReference] = useState("");
  const [confirmingUpi, setConfirmingUpi] = useState(false);

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

  const [timetable, setTimetable] = useState([]);
  const [homework, setHomework] = useState([]);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageBody, setMessageBody] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

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
      const [summaryRes, attendanceRes, marksRes, feesRes, historyRes, timetableRes, homeworkRes] =
        await Promise.all([
          API.get(`/portal/students/${studentId}/summary`),
          API.get(`/portal/students/${studentId}/attendance`, { params }),
          API.get(`/portal/students/${studentId}/marks`, { params }),
          API.get(`/portal/students/${studentId}/fees`, { params }),
          API.get(`/portal/students/${studentId}/enrollments`),
          API.get(`/portal/students/${studentId}/timetable`),
          API.get(`/portal/students/${studentId}/homework`),
        ]);
      setSummary(summaryRes.data);
      setAttendance(attendanceRes.data);
      setMarks(marksRes.data);
      setFees(feesRes.data);
      setHistory(historyRes.data || []);
      setTimetable(timetableRes.data || []);
      setHomework(homeworkRes.data || []);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load student data."));
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(studentId) {
    if (!studentId) return;
    setMessagesLoading(true);
    try {
      const response = await API.get(`/portal/students/${studentId}/messages`);
      setMessages(response.data || []);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load messages."));
    } finally {
      setMessagesLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === "messages" && selectedId) {
      loadMessages(selectedId);
    }
  }, [activeTab, selectedId]);

  async function sendMessage(event) {
    event.preventDefault();
    const body = messageBody.trim();
    if (!body || !selectedId) return;

    setSendingMessage(true);
    try {
      await API.post(`/portal/students/${selectedId}/messages`, { body });
      setMessageBody("");
      await loadMessages(selectedId);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to send message."));
    } finally {
      setSendingMessage(false);
    }
  }

  useEffect(() => {
    loadChildren();
  }, []);

  useEffect(() => {
    loadStudentData(selectedId);
  }, [selectedId, yearFilter]);

  useEffect(() => {
    if (!isParent) return;
    API.get("/portal/payment/config")
      .then((r) => setPaymentEnabled(Boolean(r.data?.enabled)))
      .catch(() => setPaymentEnabled(false));
  }, [isParent]);

  async function openUpiPayment(fee) {
    setMessage("");
    try {
      const { data } = await API.get(
        `/portal/students/${selectedId}/fees/${fee.id}/payment/upi`
      );
      let qr = "";
      try {
        qr = await QRCode.toDataURL(data.uri, { width: 220, margin: 1 });
      } catch {
        qr = "";
      }
      setUpiReference("");
      setUpiPayment({ fee, details: data, qr });
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to start UPI payment."));
    }
  }

  function closeUpiPayment() {
    setUpiPayment(null);
    setUpiReference("");
  }

  async function confirmUpiPayment() {
    if (!upiPayment) return;

    const reference = upiReference.trim();
    if (!reference) {
      setMessage("Enter the UPI transaction reference (UTR) to confirm.");
      return;
    }

    setConfirmingUpi(true);
    try {
      await API.post(
        `/portal/students/${selectedId}/fees/${upiPayment.fee.id}/payment/upi/confirm`,
        { reference }
      );
      setMessage("UPI payment recorded.");
      closeUpiPayment();
      await loadStudentData(selectedId);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Could not record the UPI payment."));
    } finally {
      setConfirmingUpi(false);
    }
  }

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
                    {isParent && <th>Actions</th>}
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
                      {isParent && (
                        <td>
                          {paymentEnabled && fee.due_amount > 0 && (
                            <button
                              type="button"
                              className="icon-button"
                              onClick={() => openUpiPayment(fee)}
                              title="Pay via UPI"
                            >
                              <QrCode size={15} />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                  {!fees.fees.length && (
                    <tr>
                      <td colSpan={isParent ? 8 : 7}>No fee records found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            </>
          )}

          {!loading && activeTab === "timetable" && (
            <div className="table-wrapper">
            <table className="classic-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Period</th>
                  <th>Time</th>
                  <th>Subject</th>
                  <th>Teacher</th>
                  <th>Room</th>
                </tr>
              </thead>
              <tbody>
                {timetable.map((entry, index) => (
                  <tr key={index}>
                    <td>{entry.day_of_week}</td>
                    <td>{entry.period_no}</td>
                    <td>
                      {entry.start_time && entry.end_time
                        ? `${entry.start_time} - ${entry.end_time}`
                        : "-"}
                    </td>
                    <td>
                      {entry.entry_type === "period"
                        ? entry.subject || "-"
                        : entry.label || entry.entry_type}
                    </td>
                    <td>{entry.teacher_name || "-"}</td>
                    <td>{entry.room || "-"}</td>
                  </tr>
                ))}
                {!timetable.length && (
                  <tr>
                    <td colSpan={6}>No timetable published for this class yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          )}

          {!loading && activeTab === "homework" && (
            <div className="table-wrapper">
            <table className="classic-table">
              <thead>
                <tr>
                  <th>Due Date</th>
                  <th>Subject</th>
                  <th>Title</th>
                  <th>Description</th>
                  <th>Teacher</th>
                </tr>
              </thead>
              <tbody>
                {homework.map((item) => (
                  <tr key={item.id}>
                    <td>{item.due_date || "-"}</td>
                    <td>{item.subject || "-"}</td>
                    <td>{item.title}</td>
                    <td>{item.description || "-"}</td>
                    <td>{item.teacher_name || "-"}</td>
                  </tr>
                ))}
                {!homework.length && (
                  <tr>
                    <td colSpan={5}>No homework posted for this class yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          )}

          {activeTab === "messages" && (
            <div className="portal-messages">
              <div className="portal-messages-list">
                {messagesLoading && <p>Loading...</p>}
                {!messagesLoading && !messages.length && (
                  <p>No messages yet. Send one below to reach the school office.</p>
                )}
                {!messagesLoading &&
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={
                        msg.is_staff
                          ? "portal-message portal-message-staff"
                          : "portal-message portal-message-self"
                      }
                    >
                      <div className="portal-message-meta">
                        <strong>{msg.sender_name}</strong>
                        <span>{msg.sender_role}</span>
                      </div>
                      <p>{msg.body}</p>
                    </div>
                  ))}
              </div>

              <form className="portal-message-form" onSubmit={sendMessage}>
                <textarea
                  value={messageBody}
                  onChange={(event) => setMessageBody(event.target.value)}
                  placeholder="Write a message to the school..."
                  rows={2}
                />
                <button
                  type="submit"
                  className="primary-button"
                  disabled={sendingMessage || !messageBody.trim()}
                >
                  <Send size={16} /> Send
                </button>
              </form>
            </div>
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

      {upiPayment && (
        <div className="layout-modal-backdrop" onClick={closeUpiPayment}>
          <div
            className="layout-modal"
            style={{ width: "min(420px, 100%)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="layout-modal-header">
              <div>
                <h3>Pay via UPI</h3>
                <p>
                  {upiPayment.fee.fee_type || "Fee"} —{" "}
                  {selectedChild?.full_name || "-"}
                </p>
              </div>
              <button
                type="button"
                className="light-icon-button"
                onClick={closeUpiPayment}
                title="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ textAlign: "center" }}>
              {upiPayment.qr ? (
                <img
                  src={upiPayment.qr}
                  alt="UPI payment QR code"
                  style={{ width: 220, height: 220 }}
                />
              ) : (
                <p>Scan unavailable — pay using the UPI ID below.</p>
              )}

              <p style={{ margin: "10px 0 2px", fontSize: "1.05rem" }}>
                <strong>{upiPayment.details.amount}</strong>
              </p>
              <p style={{ margin: 0, color: "#667085" }}>
                to <strong>{upiPayment.details.upi_id}</strong>
                {upiPayment.details.payee_name
                  ? ` (${upiPayment.details.payee_name})`
                  : ""}
              </p>

              <p style={{ margin: "12px 0 0" }}>
                <a href={upiPayment.details.uri}>Open in UPI app</a>
              </p>
            </div>

            <div style={{ marginTop: 16 }}>
              <label htmlFor="upi-reference">
                UPI transaction reference (UTR)
              </label>
              <input
                id="upi-reference"
                type="text"
                value={upiReference}
                placeholder="e.g. 415712345678"
                onChange={(event) => setUpiReference(event.target.value)}
                style={{ width: "100%", marginTop: 6 }}
              />
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "#667085" }}>
                After the payment succeeds in the UPI app, enter its reference
                number here to record the fee as paid.
              </p>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                marginTop: 16,
              }}
            >
              <button
                type="button"
                className="secondary-button"
                onClick={closeUpiPayment}
                disabled={confirmingUpi}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={confirmUpiPayment}
                disabled={confirmingUpi}
              >
                {confirmingUpi ? "Recording…" : "Confirm payment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
