import { useEffect, useState } from "react";
import {
  CalendarOff,
  PlusCircle,
  Check,
  X,
  Undo2,
  Users,
  Clock,
  AlertCircle,
  UserCheck,
  RefreshCcw,
} from "lucide-react";

import API from "../api";
import { hasAccess } from "../auth";
import { todayLocalDate } from "../utils/date";

const APPROVER_ROLES = ["Admin", "Principal"];

const emptyRequestForm = {
  teacher_id: "",
  leave_type_id: "",
  from_date: "",
  to_date: "",
  is_half_day: false,
  reason: "",
  academic_year: "",
};

const emptyTypeForm = {
  code: "",
  name: "",
  annual_quota: 0,
  is_paid: true,
  allow_negative_balance: false,
  is_active: true,
  remarks: "",
};

function getApiErrorMessage(error, fallbackMessage) {
  const detail = error.response?.data?.detail;

  if (Array.isArray(detail)) return detail.map((item) => item.msg).join(" | ");
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") return detail.msg || JSON.stringify(detail);

  return fallbackMessage;
}

function requestStatusClass(status) {
  if (status === "Approved") return "status active";
  if (status === "Rejected") return "status danger";
  if (status === "Cancelled") return "status pending";
  return "status warning"; // Requested
}

function coverStatusClass(status) {
  if (status === "Assigned") return "status active";
  if (status === "Cancelled") return "status pending";
  return "status warning"; // Unassigned
}

function studentLabel(students, studentId) {
  const student = students.find((s) => s.id === studentId);
  if (!student) return `Student #${studentId}`;
  const name = `${student.first_name || ""} ${student.last_name || ""}`.trim();
  return student.class_name
    ? `${name || student.admission_no} (${student.class_name}${student.section ? "-" + student.section : ""})`
    : name || student.admission_no;
}

export default function Leave() {
  const canApprove = hasAccess(APPROVER_ROLES);

  const [activeTab, setActiveTab] = useState("requests");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [teachers, setTeachers] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [uncoveredTodayCount, setUncoveredTodayCount] = useState(0);

  const [requestForm, setRequestForm] = useState(emptyRequestForm);
  const [requests, setRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestTeacherFilter, setRequestTeacherFilter] = useState("");
  const [requestStatusFilter, setRequestStatusFilter] = useState("");

  const [typeForm, setTypeForm] = useState(emptyTypeForm);

  const [balanceTeacherId, setBalanceTeacherId] = useState("");
  const [balanceYear, setBalanceYear] = useState("");
  const [balances, setBalances] = useState([]);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [balancesLoaded, setBalancesLoaded] = useState(false);

  const [coverDate, setCoverDate] = useState(todayLocalDate());
  const [coverStatusFilter, setCoverStatusFilter] = useState("");
  const [cover, setCover] = useState([]);
  const [coverLoading, setCoverLoading] = useState(false);
  const [candidatesDrawer, setCandidatesDrawer] = useState(null);

  const [students, setStudents] = useState([]);
  const [studentRequests, setStudentRequests] = useState([]);
  const [studentRequestsLoading, setStudentRequestsLoading] = useState(false);
  const [studentRequestStatusFilter, setStudentRequestStatusFilter] = useState("");

  useEffect(() => {
    if (!message) return undefined;
    const timeoutId = window.setTimeout(() => setMessage(""), 2500);
    return () => window.clearTimeout(timeoutId);
  }, [message]);

  async function refreshSummaryCounts() {
    try {
      const [pendingResponse, coverResponse] = await Promise.all([
        API.get("/leave/requests", { params: { status: "Requested" } }),
        API.get("/leave/cover", { params: { status: "Unassigned" } }),
      ]);
      setPendingCount((pendingResponse.data || []).length);
      setUncoveredTodayCount((coverResponse.data || []).length);
    } catch (error) {
      console.error(error);
    }
  }

  async function loadBaseData() {
    try {
      setLoading(true);
      setMessage("");

      const [teacherResponse, typeResponse, studentResponse] = await Promise.all([
        API.get("/teachers/"),
        API.get("/leave/types"),
        API.get("/students/"),
      ]);
      setTeachers(teacherResponse.data || []);
      setLeaveTypes(typeResponse.data || []);
      setStudents(studentResponse.data || []);
      await refreshSummaryCounts();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load staff and leave types."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBaseData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadRequests() {
    try {
      setRequestsLoading(true);
      const response = await API.get("/leave/requests", {
        params: {
          teacher_id: requestTeacherFilter || undefined,
          status: requestStatusFilter || undefined,
        },
      });
      setRequests(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load leave requests."));
    } finally {
      setRequestsLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab !== "requests") return;
    loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, requestTeacherFilter, requestStatusFilter]);

  async function loadCover() {
    try {
      setCoverLoading(true);
      const response = await API.get("/leave/cover", {
        params: {
          on_date: coverDate || undefined,
          status: coverStatusFilter || undefined,
        },
      });
      setCover(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load substitute cover."));
    } finally {
      setCoverLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab !== "cover") return;
    loadCover();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, coverDate, coverStatusFilter]);

  function handleRequestFormChange(e) {
    const { name, value, type, checked } = e.target;
    setRequestForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  }

  async function submitRequest(e) {
    e.preventDefault();
    setMessage("");

    if (
      !requestForm.teacher_id ||
      !requestForm.leave_type_id ||
      !requestForm.from_date ||
      !requestForm.to_date
    ) {
      setMessage("Teacher, leave type and dates are required.");
      return;
    }

    const payload = {
      teacher_id: Number(requestForm.teacher_id),
      leave_type_id: Number(requestForm.leave_type_id),
      from_date: requestForm.from_date,
      to_date: requestForm.to_date,
      is_half_day: Boolean(requestForm.is_half_day),
      reason: requestForm.reason || null,
      academic_year: requestForm.academic_year || null,
    };

    try {
      const response = await API.post("/leave/requests", payload);
      setMessage(`Leave request submitted — ${response.data.days} day(s).`);
      setRequestForm(emptyRequestForm);
      await loadRequests();
      await refreshSummaryCounts();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to submit leave request."));
    }
  }

  async function approveRequest(request) {
    const note = window.prompt("Approval note (optional):") || undefined;
    try {
      const response = await API.post(`/leave/requests/${request.id}/approve`, { note });
      setMessage(
        `Approved — ${response.data.days_deducted} day(s) deducted, ${response.data.covers_raised} cover slot(s) raised, ${response.data.remaining} remaining.`
      );
      await loadRequests();
      await refreshSummaryCounts();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to approve leave request."));
    }
  }

  async function rejectRequest(request) {
    const note = window.prompt("Rejection note (optional):") || undefined;
    try {
      await API.post(`/leave/requests/${request.id}/reject`, { note });
      setMessage("Leave request rejected.");
      await loadRequests();
      await refreshSummaryCounts();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to reject leave request."));
    }
  }

  async function cancelRequest(request) {
    const confirmCancel = window.confirm("Cancel this leave request?");
    if (!confirmCancel) return;

    const note = window.prompt("Cancellation note (optional):") || undefined;
    try {
      const response = await API.post(`/leave/requests/${request.id}/cancel`, { note });
      setMessage(
        `Cancelled — ${response.data.days_restored} day(s) restored, ${response.data.unassigned_covers_removed} unfilled cover slot(s) dropped.`
      );
      await loadRequests();
      await refreshSummaryCounts();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to cancel leave request."));
    }
  }

  async function loadStudentRequests() {
    try {
      setStudentRequestsLoading(true);
      const response = await API.get("/student-leave-requests/", {
        params: { status: studentRequestStatusFilter || undefined },
      });
      setStudentRequests(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load student leave requests."));
    } finally {
      setStudentRequestsLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab !== "student") return;
    loadStudentRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, studentRequestStatusFilter]);

  async function approveStudentRequest(request) {
    const note = window.prompt("Approval note (optional):") || undefined;
    try {
      await API.post(`/student-leave-requests/${request.id}/approve`, { note });
      setMessage("Approved — attendance marked Excused for the working days in range.");
      await loadStudentRequests();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to approve leave request."));
    }
  }

  async function rejectStudentRequest(request) {
    const note = window.prompt("Rejection note (optional):") || undefined;
    try {
      await API.post(`/student-leave-requests/${request.id}/reject`, { note });
      setMessage("Student leave request rejected.");
      await loadStudentRequests();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to reject leave request."));
    }
  }

  function handleTypeFormChange(e) {
    const { name, value, type, checked } = e.target;
    setTypeForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  }

  async function submitType(e) {
    e.preventDefault();
    setMessage("");

    if (!typeForm.code.trim() || !typeForm.name.trim()) {
      setMessage("Code and name are required.");
      return;
    }

    const payload = {
      ...typeForm,
      code: typeForm.code.trim(),
      name: typeForm.name.trim(),
      annual_quota: Number(typeForm.annual_quota || 0),
      remarks: typeForm.remarks || null,
    };

    try {
      await API.post("/leave/types", payload);
      setMessage("Leave type added.");
      setTypeForm(emptyTypeForm);
      await loadBaseData();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to add leave type."));
    }
  }

  async function loadBalances(e) {
    if (e) e.preventDefault();
    if (!balanceTeacherId) {
      setMessage("Select a teacher first.");
      return;
    }

    try {
      setBalancesLoading(true);
      const response = await API.get("/leave/balances", {
        params: { teacher_id: Number(balanceTeacherId), academic_year: balanceYear || undefined },
      });
      setBalances(response.data || []);
      setBalancesLoaded(true);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load leave balances."));
    } finally {
      setBalancesLoading(false);
    }
  }

  async function openCandidates(coverSlot) {
    setCandidatesDrawer({ cover: coverSlot, candidates: [], loading: true });
    try {
      const response = await API.get(`/leave/cover/${coverSlot.id}/candidates`);
      setCandidatesDrawer({ cover: coverSlot, candidates: response.data || [], loading: false });
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load substitute candidates."));
      setCandidatesDrawer(null);
    }
  }

  async function assignSubstitute(coverSlot, teacherId) {
    try {
      await API.post(`/leave/cover/${coverSlot.id}/assign`, { substitute_teacher_id: teacherId });
      setMessage("Substitute assigned.");
      setCandidatesDrawer(null);
      await loadCover();
      await refreshSummaryCounts();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to assign substitute."));
    }
  }

  async function unassignSubstitute(coverSlot) {
    const confirmUnassign = window.confirm(
      `Remove the assigned substitute for period ${coverSlot.period_no ?? "-"}?`
    );
    if (!confirmUnassign) return;

    try {
      await API.post(`/leave/cover/${coverSlot.id}/unassign`);
      setMessage("Substitute unassigned.");
      await loadCover();
      await refreshSummaryCounts();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to unassign substitute."));
    }
  }

  const activeLeaveTypes = leaveTypes.filter((t) => t.is_active);

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Staff Leave & Substitution</p>
          <h2>Leave</h2>
          <p>Manage staff leave types, requests, balances, and daily substitute cover.</p>
        </div>
      </section>

      <section className="summary-strip report-summary-grid">
        <div className="summary-card">
          <Users size={22} />
          <div>
            <span>Teaching Staff</span>
            <strong>{teachers.length}</strong>
          </div>
        </div>
        <div className="summary-card">
          <CalendarOff size={22} />
          <div>
            <span>Leave Types</span>
            <strong>{leaveTypes.length}</strong>
          </div>
        </div>
        <div className="summary-card warning">
          <Clock size={22} />
          <div>
            <span>Pending Approvals</span>
            <strong>{pendingCount}</strong>
          </div>
        </div>
        <div className="summary-card negative">
          <AlertCircle size={22} />
          <div>
            <span>Uncovered Slots Today</span>
            <strong>{uncoveredTodayCount}</strong>
          </div>
        </div>
      </section>

      {message && <div className="toast-notification">{message}</div>}

      <section className="table-panel">
        <div className="student-profile-tabs">
          {[
            ["requests", "Requests"],
            ["student", "Student Leave"],
            ["balances", "Balances"],
            ["types", "Leave Types"],
            ["cover", "Substitute Cover"],
          ].map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              className={activeTab === tab ? "active" : ""}
              onClick={() => setActiveTab(tab)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {activeTab === "requests" && (
        <>
          <section className="form-panel">
            <PanelTitle title="Apply for Leave" text="Submit a leave request for a staff member." />
            <form className="classic-form" onSubmit={submitRequest}>
              <div className="form-grid">
                <div className="form-field">
                  <label>Teacher *</label>
                  <select name="teacher_id" value={requestForm.teacher_id} onChange={handleRequestFormChange} required>
                    <option value="">Select Teacher</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label>Leave Type *</label>
                  <select name="leave_type_id" value={requestForm.leave_type_id} onChange={handleRequestFormChange} required>
                    <option value="">Select Leave Type</option>
                    {activeLeaveTypes.map((t) => (
                      <option key={t.id} value={t.id}>{t.name} ({t.code})</option>
                    ))}
                  </select>
                </div>
                <TextField label="From *" type="date" name="from_date" value={requestForm.from_date} onChange={handleRequestFormChange} required />
                <TextField label="To *" type="date" name="to_date" value={requestForm.to_date} onChange={handleRequestFormChange} required />
                <TextField label="Academic Year" name="academic_year" value={requestForm.academic_year} onChange={handleRequestFormChange} placeholder="2026-27" />
                <div className="form-field">
                  <label>Half Day</label>
                  <label className="switch-row">
                    <input type="checkbox" name="is_half_day" checked={requestForm.is_half_day} onChange={handleRequestFormChange} />
                    <span>{requestForm.is_half_day ? "Half Day" : "Full Day"}</span>
                  </label>
                </div>
                <div className="form-field full-width">
                  <label>Reason</label>
                  <textarea name="reason" value={requestForm.reason} onChange={handleRequestFormChange} rows="3"></textarea>
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="primary-button">
                  <PlusCircle size={18} />
                  Submit Request
                </button>
              </div>
            </form>
          </section>

          <section className="table-panel">
            <div className="panel-header">
              <div><h3>Leave Requests</h3></div>
            </div>
            <div className="filter-row sis-filter-row">
              <div className="form-field">
                <label>Teacher</label>
                <select value={requestTeacherFilter} onChange={(e) => setRequestTeacherFilter(e.target.value)}>
                  <option value="">All Teachers</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Status</label>
                <select value={requestStatusFilter} onChange={(e) => setRequestStatusFilter(e.target.value)}>
                  <option value="">All Statuses</option>
                  <option value="Requested">Requested</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
            </div>
            <div className="table-wrapper">
              <table className="classic-table">
                <thead>
                  <tr>
                    <th>Teacher</th><th>Leave Type</th><th>From</th><th>To</th><th>Days</th>
                    <th>Reason</th><th>Status</th><th>Decision</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requestsLoading && <tr><td colSpan={9}>Loading...</td></tr>}
                  {!requestsLoading && requests.map((r) => (
                    <tr key={r.id}>
                      <td>{r.teacher_name || "-"}</td>
                      <td>{r.leave_type || "-"}</td>
                      <td>{r.from_date}</td>
                      <td>{r.to_date}</td>
                      <td>{r.days}{r.is_half_day ? " (half)" : ""}</td>
                      <td>{r.reason || "-"}</td>
                      <td><span className={requestStatusClass(r.status)}>{r.status}</span></td>
                      <td>{r.decided_by ? `${r.decided_by}${r.decision_note ? ` — ${r.decision_note}` : ""}` : "-"}</td>
                      <td>
                        <div className="action-buttons">
                          {canApprove && r.status === "Requested" && (
                            <>
                              <button type="button" className="edit-button" onClick={() => approveRequest(r)} title="Approve">
                                <Check size={15} />
                              </button>
                              <button type="button" className="delete-button" onClick={() => rejectRequest(r)} title="Reject">
                                <X size={15} />
                              </button>
                            </>
                          )}
                          {(r.status === "Requested" || r.status === "Approved") && (
                            <button type="button" className="delete-button" onClick={() => cancelRequest(r)} title="Cancel">
                              <Undo2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!requestsLoading && !requests.length && (
                    <tr><td colSpan={9}>No leave requests found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {activeTab === "student" && (
        <section className="table-panel">
          <div className="panel-header">
            <div>
              <h3>Student Leave Requests</h3>
              <p>Guardian-submitted absence requests from the parent/student portal. Approving marks Attendance Excused for the working days in range.</p>
            </div>
          </div>
          <div className="filter-row sis-filter-row">
            <div className="form-field">
              <label>Status</label>
              <select value={studentRequestStatusFilter} onChange={(e) => setStudentRequestStatusFilter(e.target.value)}>
                <option value="">All Statuses</option>
                <option value="Requested">Requested</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
          </div>
          <div className="table-wrapper">
            <table className="classic-table">
              <thead>
                <tr>
                  <th>Student</th><th>From</th><th>To</th>
                  <th>Reason</th><th>Status</th><th>Decision</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {studentRequestsLoading && <tr><td colSpan={7}>Loading...</td></tr>}
                {!studentRequestsLoading && studentRequests.map((r) => (
                  <tr key={r.id}>
                    <td>{studentLabel(students, r.student_id)}</td>
                    <td>{r.from_date}</td>
                    <td>{r.to_date}</td>
                    <td>{r.reason || "-"}</td>
                    <td><span className={requestStatusClass(r.status)}>{r.status}</span></td>
                    <td>{r.decided_by ? `${r.decided_by}${r.decision_note ? ` — ${r.decision_note}` : ""}` : "-"}</td>
                    <td>
                      {r.status === "Requested" && (
                        <div className="action-buttons">
                          <button type="button" className="edit-button" onClick={() => approveStudentRequest(r)} title="Approve">
                            <Check size={15} />
                          </button>
                          <button type="button" className="delete-button" onClick={() => rejectStudentRequest(r)} title="Reject">
                            <X size={15} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {!studentRequestsLoading && !studentRequests.length && (
                  <tr><td colSpan={7}>No student leave requests found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "balances" && (
        <section className="table-panel">
          <div className="panel-header">
            <div>
              <h3>Leave Balances</h3>
              <p>Entitlement, used and remaining days for each active leave type.</p>
            </div>
          </div>
          <form className="filter-row sis-filter-row" onSubmit={loadBalances}>
            <div className="form-field">
              <label>Teacher *</label>
              <select value={balanceTeacherId} onChange={(e) => setBalanceTeacherId(e.target.value)}>
                <option value="">Select Teacher</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Academic Year</label>
              <input value={balanceYear} onChange={(e) => setBalanceYear(e.target.value)} placeholder="2026-27" />
            </div>
            <div className="form-field" style={{ alignSelf: "flex-end" }}>
              <button type="submit" className="primary-button" disabled={balancesLoading}>
                <RefreshCcw size={16} />
                {balancesLoading ? "Loading..." : "Load Balances"}
              </button>
            </div>
          </form>
          <div className="table-wrapper">
            <table className="classic-table">
              <thead>
                <tr><th>Leave Type</th><th>Paid</th><th>Entitled</th><th>Used</th><th>Remaining</th></tr>
              </thead>
              <tbody>
                {balancesLoading && <tr><td colSpan={5}>Loading...</td></tr>}
                {!balancesLoading && balances.map((b) => (
                  <tr key={b.leave_type_id}>
                    <td>{b.leave_type}</td>
                    <td>{b.is_paid ? "Yes" : "No"}</td>
                    <td>{b.entitled_days}</td>
                    <td>{b.used_days}</td>
                    <td>{b.remaining_days}</td>
                  </tr>
                ))}
                {!balancesLoading && balancesLoaded && !balances.length && (
                  <tr><td colSpan={5}>No active leave types found.</td></tr>
                )}
                {!balancesLoading && !balancesLoaded && (
                  <tr><td colSpan={5}>Select a teacher and load balances.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "types" && (
        <>
          {canApprove && (
            <section className="form-panel">
              <PanelTitle title="Add Leave Type" text="Define a leave category and its yearly entitlement." />
              <form className="classic-form" onSubmit={submitType}>
                <div className="form-grid">
                  <TextField label="Code *" name="code" value={typeForm.code} onChange={handleTypeFormChange} required placeholder="CL" />
                  <TextField label="Name *" name="name" value={typeForm.name} onChange={handleTypeFormChange} required placeholder="Casual Leave" />
                  <TextField label="Annual Quota" type="number" name="annual_quota" value={typeForm.annual_quota} onChange={handleTypeFormChange} min="0" step="0.5" />
                  <div className="form-field">
                    <label>Paid</label>
                    <label className="switch-row">
                      <input type="checkbox" name="is_paid" checked={typeForm.is_paid} onChange={handleTypeFormChange} />
                      <span>{typeForm.is_paid ? "Paid" : "Unpaid"}</span>
                    </label>
                  </div>
                  <div className="form-field">
                    <label>Allow Negative Balance</label>
                    <label className="switch-row">
                      <input type="checkbox" name="allow_negative_balance" checked={typeForm.allow_negative_balance} onChange={handleTypeFormChange} />
                      <span>{typeForm.allow_negative_balance ? "Allowed" : "Not Allowed"}</span>
                    </label>
                  </div>
                  <div className="form-field">
                    <label>Status</label>
                    <label className="switch-row">
                      <input type="checkbox" name="is_active" checked={typeForm.is_active} onChange={handleTypeFormChange} />
                      <span>{typeForm.is_active ? "Active" : "Inactive"}</span>
                    </label>
                  </div>
                  <div className="form-field full-width">
                    <label>Remarks</label>
                    <textarea name="remarks" value={typeForm.remarks} onChange={handleTypeFormChange} rows="3"></textarea>
                  </div>
                </div>
                <div className="form-actions">
                  <button type="submit" className="primary-button">
                    <PlusCircle size={18} />
                    Add Leave Type
                  </button>
                </div>
              </form>
            </section>
          )}

          <section className="table-panel">
            <div className="panel-header"><div><h3>Leave Types</h3></div></div>
            <div className="table-wrapper">
              <table className="classic-table">
                <thead>
                  <tr><th>Code</th><th>Name</th><th>Annual Quota</th><th>Paid</th><th>Negative Balance</th><th>Status</th><th>Remarks</th></tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={7}>Loading...</td></tr>}
                  {!loading && leaveTypes.map((t) => (
                    <tr key={t.id}>
                      <td>{t.code}</td>
                      <td>{t.name}</td>
                      <td>{t.annual_quota}</td>
                      <td>{t.is_paid ? "Yes" : "No"}</td>
                      <td>{t.allow_negative_balance ? "Yes" : "No"}</td>
                      <td><span className={t.is_active ? "status active" : "status danger"}>{t.is_active ? "Active" : "Inactive"}</span></td>
                      <td>{t.remarks || "-"}</td>
                    </tr>
                  ))}
                  {!loading && !leaveTypes.length && (
                    <tr><td colSpan={7}>No leave types configured yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {activeTab === "cover" && (
        <section className="table-panel">
          <div className="panel-header">
            <div>
              <h3>Substitute Cover</h3>
              <p>Periods raised automatically when leave is approved, waiting to be filled.</p>
            </div>
          </div>
          <div className="filter-row sis-filter-row">
            <div className="form-field">
              <label>Date</label>
              <input type="date" value={coverDate} onChange={(e) => setCoverDate(e.target.value)} />
            </div>
            <div className="form-field">
              <label>Status</label>
              <select value={coverStatusFilter} onChange={(e) => setCoverStatusFilter(e.target.value)}>
                <option value="">All Statuses</option>
                <option value="Unassigned">Unassigned</option>
                <option value="Assigned">Assigned</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          <div className="table-wrapper">
            <table className="classic-table">
              <thead>
                <tr>
                  <th>Period</th><th>Class</th><th>Subject</th><th>Room</th>
                  <th>Absent Teacher</th><th>Substitute</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {coverLoading && <tr><td colSpan={8}>Loading...</td></tr>}
                {!coverLoading && cover.map((c) => (
                  <tr key={c.id}>
                    <td>{c.period_no ?? "-"}</td>
                    <td>{[c.class_name, c.section].filter(Boolean).join(" - ") || "-"}</td>
                    <td>{c.subject || "-"}</td>
                    <td>{c.room || "-"}</td>
                    <td>{c.absent_teacher || "-"}</td>
                    <td>{c.substitute_teacher || "-"}</td>
                    <td><span className={coverStatusClass(c.status)}>{c.status}</span></td>
                    <td>
                      {canApprove && (
                        <div className="action-buttons">
                          {c.status === "Unassigned" && (
                            <button type="button" className="edit-button" onClick={() => openCandidates(c)} title="Find Substitute">
                              <UserCheck size={15} />
                            </button>
                          )}
                          {c.status === "Assigned" && (
                            <button type="button" className="delete-button" onClick={() => unassignSubstitute(c)} title="Unassign">
                              <Undo2 size={15} />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {!coverLoading && !cover.length && (
                  <tr><td colSpan={8}>No cover slots for this date.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {candidatesDrawer && (
        <div className="student-drawer-backdrop">
          <aside className="student-drawer">
            <button type="button" className="drawer-close" onClick={() => setCandidatesDrawer(null)}>
              <X size={18} />
            </button>
            <div className="student-profile-head">
              <div className="student-avatar"><UserCheck size={42} /></div>
              <h3>Period {candidatesDrawer.cover.period_no ?? "-"}</h3>
              <p>
                {[candidatesDrawer.cover.class_name, candidatesDrawer.cover.section].filter(Boolean).join(" - ") || "-"}
                {candidatesDrawer.cover.subject ? ` — ${candidatesDrawer.cover.subject}` : ""}
              </p>
              <p>In place of {candidatesDrawer.cover.absent_teacher || "-"} on {candidatesDrawer.cover.cover_date}</p>
            </div>
            <div className="drawer-section">
              {candidatesDrawer.loading && <p>Loading candidates...</p>}
              {!candidatesDrawer.loading && !candidatesDrawer.candidates.length && (
                <p>No teachers found.</p>
              )}
              {!candidatesDrawer.loading && candidatesDrawer.candidates.map((candidate) => (
                <div
                  key={candidate.teacher_id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 0",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div>
                    <strong>{candidate.name}</strong>
                    <p style={{ margin: "2px 0 0" }}>
                      {candidate.subject ? `${candidate.subject} · ` : ""}
                      {candidate.teaches_this_subject ? "Teaches this subject" : "Different subject"}
                    </p>
                    {!candidate.available && candidate.unavailable_reason && (
                      <p style={{ margin: "2px 0 0", color: "var(--danger, #dc2626)" }}>
                        {candidate.unavailable_reason}
                      </p>
                    )}
                  </div>
                  {candidate.available ? (
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => assignSubstitute(candidatesDrawer.cover, candidate.teacher_id)}
                    >
                      Assign
                    </button>
                  ) : (
                    <span className="status danger">Unavailable</span>
                  )}
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}
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

function TextField({ label, ...props }) {
  return (
    <div className="form-field">
      <label>{label}</label>
      <input {...props} />
    </div>
  );
}
