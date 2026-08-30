import { useEffect, useState } from "react";
import {
  DoorOpen,
  PlusCircle,
  Check,
  X,
  LogIn,
  LogOut,
  Ban,
  Undo2,
  ShieldAlert,
  Users,
} from "lucide-react";

import API from "../api";
import { hasAccess } from "../auth";
import { todayLocalDate } from "../utils/date";
import StudentPicker from "../components/StudentPicker";

const DESK_ROLES = ["Admin", "Principal"];

const emptyVisitorForm = {
  visitor_name: "",
  phone: "",
  email: "",
  address: "",
  visitor_type: "",
  organisation: "",
  id_proof_type: "",
  id_proof_number: "",
  purpose: "",
  party_size: 1,
  vehicle_number: "",
  host_student_id: "",
  host_teacher_id: "",
  host_department: "",
  visit_date: "",
  remarks: "",
  check_in_now: true,
};

const emptyPassForm = {
  pass_type: "Student",
  student_id: "",
  teacher_id: "",
  pass_date: "",
  reason: "",
  expected_return: false,
  expected_return_at: "",
  remarks: "",
};

const emptyBlockForm = {
  name: "",
  reason: "",
  phone: "",
  id_proof_number: "",
};

const emptyReleaseForm = {
  collected_by_name: "",
  collected_by_relation: "",
  collected_by_phone: "",
  collected_by_id_proof: "",
};

function getApiErrorMessage(error, fallbackMessage) {
  const detail = error.response?.data?.detail;

  if (Array.isArray(detail)) return detail.map((item) => item.msg).join(" | ");
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") return detail.msg || JSON.stringify(detail);

  return fallbackMessage;
}

function visitorStatusClass(status) {
  if (status === "In") return "status active";
  if (status === "Out") return "status pending";
  if (status === "Denied") return "status danger";
  return "status warning"; // Expected
}

function passStatusClass(status) {
  if (status === "Approved") return "status active";
  if (status === "Out") return "status warning";
  if (status === "Returned") return "status pending";
  if (status === "Rejected" || status === "Cancelled") return "status danger";
  return "status warning"; // Requested
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

export default function Gate() {
  const canManage = hasAccess(DESK_ROLES);

  const [activeTab, setActiveTab] = useState("visitors");
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState(null);

  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);

  const [visitorForm, setVisitorForm] = useState(emptyVisitorForm);
  const [visitors, setVisitors] = useState([]);
  const [visitorsLoading, setVisitorsLoading] = useState(false);
  const [visitorStatusFilter, setVisitorStatusFilter] = useState("");

  const [passForm, setPassForm] = useState(emptyPassForm);
  const [passes, setPasses] = useState([]);
  const [passesLoading, setPassesLoading] = useState(false);
  const [passStatusFilter, setPassStatusFilter] = useState("");
  const [stillOutOnly, setStillOutOnly] = useState(false);
  const [releaseTarget, setReleaseTarget] = useState(null);
  const [releaseForm, setReleaseForm] = useState(emptyReleaseForm);

  const [blockForm, setBlockForm] = useState(emptyBlockForm);
  const [blocked, setBlocked] = useState([]);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [showLifted, setShowLifted] = useState(false);

  useEffect(() => {
    if (!message) return undefined;
    const timeoutId = window.setTimeout(() => setMessage(""), 2500);
    return () => window.clearTimeout(timeoutId);
  }, [message]);

  async function loadSummary() {
    try {
      const response = await API.get("/gate/summary");
      setSummary(response.data);
    } catch (error) {
      console.error(error);
    }
  }

  async function loadReferenceData() {
    try {
      const [studentResponse, teacherResponse] = await Promise.all([
        API.get("/students/"),
        API.get("/teachers/"),
      ]);
      setStudents(studentResponse.data || []);
      setTeachers(teacherResponse.data || []);
    } catch (error) {
      console.error(error);
    }
  }

  async function loadVisitors() {
    try {
      setVisitorsLoading(true);
      const response = await API.get("/gate/visitors", {
        params: visitorStatusFilter ? { status: visitorStatusFilter } : {},
      });
      setVisitors(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load visitors."));
    } finally {
      setVisitorsLoading(false);
    }
  }

  async function loadPasses() {
    try {
      setPassesLoading(true);
      const response = stillOutOnly
        ? await API.get("/gate/passes/still-out")
        : await API.get("/gate/passes", {
            params: passStatusFilter ? { status: passStatusFilter } : {},
          });
      setPasses(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load gate passes."));
    } finally {
      setPassesLoading(false);
    }
  }

  async function loadBlocked() {
    try {
      setBlockedLoading(true);
      const response = await API.get("/gate/blocked", {
        params: { include_lifted: showLifted },
      });
      setBlocked(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load the blocked list."));
    } finally {
      setBlockedLoading(false);
    }
  }

  useEffect(() => {
    loadSummary();
    loadReferenceData();
  }, []);

  useEffect(() => {
    loadVisitors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitorStatusFilter]);

  useEffect(() => {
    loadPasses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passStatusFilter, stillOutOnly]);

  useEffect(() => {
    loadBlocked();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLifted]);

  function handleVisitorFormChange(event) {
    const { name, value, type, checked } = event.target;
    setVisitorForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function submitVisitor(event) {
    event.preventDefault();
    try {
      const payload = {
        ...visitorForm,
        party_size: Number(visitorForm.party_size) || 1,
        host_student_id: visitorForm.host_student_id || null,
        host_teacher_id: visitorForm.host_teacher_id || null,
        visit_date: visitorForm.visit_date || null,
      };
      await API.post("/gate/visitors", payload);
      setMessage(payload.check_in_now ? "Visitor checked in." : "Visitor registered.");
      setVisitorForm(emptyVisitorForm);
      await Promise.all([loadVisitors(), loadSummary()]);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to register visitor."));
    }
  }

  async function checkInVisitor(visitor) {
    try {
      await API.post(`/gate/visitors/${visitor.id}/check-in`);
      setMessage(`${visitor.visitor_name} checked in.`);
      await Promise.all([loadVisitors(), loadSummary()]);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to check in visitor."));
    }
  }

  async function checkOutVisitor(visitor) {
    try {
      await API.post(`/gate/visitors/${visitor.id}/check-out`);
      setMessage(`${visitor.visitor_name} checked out.`);
      await Promise.all([loadVisitors(), loadSummary()]);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to check out visitor."));
    }
  }

  async function denyVisitor(visitor) {
    const note = window.prompt("Reason for denying entry:") || undefined;
    try {
      await API.post(`/gate/visitors/${visitor.id}/deny`, { note });
      setMessage(`${visitor.visitor_name} denied entry.`);
      await Promise.all([loadVisitors(), loadSummary()]);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to deny visitor."));
    }
  }

  function handlePassFormChange(event) {
    const { name, value, type, checked } = event.target;
    setPassForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function submitPass(event) {
    event.preventDefault();
    try {
      const payload = {
        ...passForm,
        student_id: passForm.pass_type === "Student" ? passForm.student_id || null : null,
        teacher_id: passForm.pass_type === "Staff" ? passForm.teacher_id || null : null,
        pass_date: passForm.pass_date || null,
        expected_return_at: passForm.expected_return_at || null,
      };
      await API.post("/gate/passes", payload);
      setMessage("Gate pass created.");
      setPassForm(emptyPassForm);
      await Promise.all([loadPasses(), loadSummary()]);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to create gate pass."));
    }
  }

  async function approvePass(pass) {
    const note = window.prompt("Approval note (optional):") || undefined;
    try {
      await API.post(`/gate/passes/${pass.id}/approve`, { note });
      setMessage(`Pass ${pass.pass_no} approved.`);
      await Promise.all([loadPasses(), loadSummary()]);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to approve pass."));
    }
  }

  async function rejectPass(pass) {
    const note = window.prompt("Rejection note (optional):") || undefined;
    try {
      await API.post(`/gate/passes/${pass.id}/reject`, { note });
      setMessage(`Pass ${pass.pass_no} rejected.`);
      await Promise.all([loadPasses(), loadSummary()]);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to reject pass."));
    }
  }

  async function cancelPass(pass) {
    const note = window.prompt("Cancellation note (optional):") || undefined;
    try {
      await API.post(`/gate/passes/${pass.id}/cancel`, { note });
      setMessage(`Pass ${pass.pass_no} cancelled.`);
      await Promise.all([loadPasses(), loadSummary()]);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to cancel pass."));
    }
  }

  function openRelease(pass) {
    setReleaseTarget(pass);
    setReleaseForm(emptyReleaseForm);
  }

  function handleReleaseFormChange(event) {
    const { name, value } = event.target;
    setReleaseForm((prev) => ({ ...prev, [name]: value }));
  }

  async function confirmRelease(event) {
    event.preventDefault();
    if (!releaseTarget) return;
    try {
      await API.post(`/gate/passes/${releaseTarget.id}/release`, releaseForm);
      setMessage(`Pass ${releaseTarget.pass_no} released.`);
      setReleaseTarget(null);
      await Promise.all([loadPasses(), loadSummary()]);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to release pass."));
    }
  }

  async function returnPass(pass) {
    try {
      await API.post(`/gate/passes/${pass.id}/return`);
      setMessage(`Return recorded for ${pass.pass_no}.`);
      await Promise.all([loadPasses(), loadSummary()]);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to record return."));
    }
  }

  function handleBlockFormChange(event) {
    const { name, value } = event.target;
    setBlockForm((prev) => ({ ...prev, [name]: value }));
  }

  async function submitBlock(event) {
    event.preventDefault();
    try {
      await API.post("/gate/blocked", blockForm);
      setMessage(`${blockForm.name} added to the blocked list.`);
      setBlockForm(emptyBlockForm);
      await Promise.all([loadBlocked(), loadSummary()]);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to add to blocked list."));
    }
  }

  async function liftBlock(block) {
    const confirmLift = window.confirm(`Lift the block on ${block.name}?`);
    if (!confirmLift) return;
    const note = window.prompt("Note (optional):") || undefined;
    try {
      await API.post(`/gate/blocked/${block.id}/lift`, { note });
      setMessage(`Block on ${block.name} lifted.`);
      await Promise.all([loadBlocked(), loadSummary()]);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to lift block."));
    }
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">People & Access</p>
          <h2>Gate Register</h2>
          <p>Log visitors, issue gate passes, and manage the blocked list.</p>
        </div>
      </section>

      <section className="summary-strip report-summary-grid">
        <div className="summary-card">
          <Users size={22} />
          <div>
            <span>Visitors On Campus</span>
            <strong>{summary?.visitors_on_campus ?? "-"}</strong>
          </div>
        </div>
        <div className="summary-card">
          <DoorOpen size={22} />
          <div>
            <span>Visitors Today</span>
            <strong>{summary?.visitors_today ?? "-"}</strong>
          </div>
        </div>
        <div className="summary-card warning">
          <LogOut size={22} />
          <div>
            <span>Students Out</span>
            <strong>{summary?.students_out ?? "-"}</strong>
          </div>
        </div>
        <div className="summary-card warning">
          <LogOut size={22} />
          <div>
            <span>Staff Out</span>
            <strong>{summary?.staff_out ?? "-"}</strong>
          </div>
        </div>
        <div className="summary-card negative">
          <ShieldAlert size={22} />
          <div>
            <span>Overdue Returns</span>
            <strong>{summary?.overdue_returns ?? "-"}</strong>
          </div>
        </div>
        <div className="summary-card negative">
          <Ban size={22} />
          <div>
            <span>Active Blocks</span>
            <strong>{summary?.active_blocks ?? "-"}</strong>
          </div>
        </div>
      </section>

      {message && <div className="toast-notification">{message}</div>}

      <section className="table-panel">
        <div className="student-profile-tabs">
          {[
            ["visitors", "Visitors"],
            ["passes", "Gate Passes"],
            ["blocked", "Blocked List"],
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

      {activeTab === "visitors" && (
        <>
          {canManage && (
            <section className="form-panel">
              <PanelTitle title="Log Visitor" text="Register a visitor and, if they've arrived, check them in." />
              <form className="classic-form" onSubmit={submitVisitor}>
                <div className="form-grid">
                  <TextField label="Visitor Name *" name="visitor_name" value={visitorForm.visitor_name} onChange={handleVisitorFormChange} required />
                  <TextField label="Phone" name="phone" value={visitorForm.phone} onChange={handleVisitorFormChange} />
                  <TextField label="Email" name="email" type="email" value={visitorForm.email} onChange={handleVisitorFormChange} />
                  <TextField label="Organisation" name="organisation" value={visitorForm.organisation} onChange={handleVisitorFormChange} />
                  <div className="form-field">
                    <label>Visitor Type</label>
                    <select name="visitor_type" value={visitorForm.visitor_type} onChange={handleVisitorFormChange}>
                      <option value="">Select Type</option>
                      <option value="Parent">Parent</option>
                      <option value="Vendor">Vendor</option>
                      <option value="Guest">Guest</option>
                      <option value="Alumni">Alumni</option>
                      <option value="Official">Official</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <TextField label="ID Proof Type" name="id_proof_type" value={visitorForm.id_proof_type} onChange={handleVisitorFormChange} placeholder="Aadhaar, Passport…" />
                  <TextField label="ID Proof Number" name="id_proof_number" value={visitorForm.id_proof_number} onChange={handleVisitorFormChange} />
                  <TextField label="Vehicle Number" name="vehicle_number" value={visitorForm.vehicle_number} onChange={handleVisitorFormChange} />
                  <TextField label="Party Size" name="party_size" type="number" min="1" value={visitorForm.party_size} onChange={handleVisitorFormChange} />
                  <TextField label="Visit Date" name="visit_date" type="date" value={visitorForm.visit_date || todayLocalDate()} onChange={handleVisitorFormChange} />
                  <TextField label="Purpose" name="purpose" value={visitorForm.purpose} onChange={handleVisitorFormChange} />
                  <TextField label="Address" name="address" value={visitorForm.address} onChange={handleVisitorFormChange} />

                  <StudentPicker
                    students={students}
                    value={visitorForm.host_student_id}
                    onChange={handleVisitorFormChange}
                    name="host_student_id"
                    required={false}
                    label="Host Student"
                  />

                  <div className="form-field">
                    <label>Host Teacher</label>
                    <select name="host_teacher_id" value={visitorForm.host_teacher_id} onChange={handleVisitorFormChange}>
                      <option value="">None</option>
                      {teachers.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>

                  <TextField label="Host Department" name="host_department" value={visitorForm.host_department} onChange={handleVisitorFormChange} />

                  <div className="form-field">
                    <label>Check In Now</label>
                    <label className="switch-row">
                      <input type="checkbox" name="check_in_now" checked={visitorForm.check_in_now} onChange={handleVisitorFormChange} />
                      <span>{visitorForm.check_in_now ? "Check in immediately" : "Register as expected"}</span>
                    </label>
                  </div>

                  <div className="form-field full-width">
                    <label>Remarks</label>
                    <textarea name="remarks" value={visitorForm.remarks} onChange={handleVisitorFormChange} rows="2"></textarea>
                  </div>
                </div>
                <div className="form-actions">
                  <button type="submit" className="primary-button">
                    <PlusCircle size={18} />
                    {visitorForm.check_in_now ? "Register & Check In" : "Register Visitor"}
                  </button>
                </div>
              </form>
            </section>
          )}

          <section className="table-panel">
            <div className="panel-header">
              <div><h3>Today's Visitors</h3></div>
            </div>
            <div className="filter-row sis-filter-row">
              <div className="form-field">
                <label>Status</label>
                <select value={visitorStatusFilter} onChange={(e) => setVisitorStatusFilter(e.target.value)}>
                  <option value="">All Statuses</option>
                  <option value="Expected">Expected</option>
                  <option value="In">In</option>
                  <option value="Out">Out</option>
                  <option value="Denied">Denied</option>
                </select>
              </div>
            </div>
            <div className="table-wrapper">
              <table className="classic-table">
                <thead>
                  <tr>
                    <th>Pass No</th><th>Visitor</th><th>Phone</th><th>Purpose</th>
                    <th>Host</th><th>In</th><th>Out</th><th>Status</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visitorsLoading && <tr><td colSpan={9}>Loading...</td></tr>}
                  {!visitorsLoading && visitors.map((v) => (
                    <tr key={v.id}>
                      <td>{v.pass_no}</td>
                      <td>{v.visitor_name}</td>
                      <td>{v.phone || "-"}</td>
                      <td>{v.purpose || "-"}</td>
                      <td>{v.host_student || v.host_teacher || v.host_department || "-"}</td>
                      <td>{v.checked_in_at ? new Date(v.checked_in_at).toLocaleTimeString() : "-"}</td>
                      <td>{v.checked_out_at ? new Date(v.checked_out_at).toLocaleTimeString() : "-"}</td>
                      <td><span className={visitorStatusClass(v.status)}>{v.status}</span></td>
                      <td>
                        {canManage && (
                          <div className="action-buttons">
                            {v.status === "Expected" && (
                              <>
                                <button type="button" className="edit-button" onClick={() => checkInVisitor(v)} title="Check In">
                                  <LogIn size={15} />
                                </button>
                                <button type="button" className="delete-button" onClick={() => denyVisitor(v)} title="Deny Entry">
                                  <Ban size={15} />
                                </button>
                              </>
                            )}
                            {v.status === "In" && (
                              <button type="button" className="edit-button" onClick={() => checkOutVisitor(v)} title="Check Out">
                                <LogOut size={15} />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!visitorsLoading && !visitors.length && (
                    <tr><td colSpan={9}>No visitors found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {activeTab === "passes" && (
        <>
          <section className="form-panel">
            <PanelTitle title="Issue Gate Pass" text="Request a pass for a student or staff member to leave campus." />
            <form className="classic-form" onSubmit={submitPass}>
              <div className="form-grid">
                <div className="form-field">
                  <label>Pass Type</label>
                  <select name="pass_type" value={passForm.pass_type} onChange={handlePassFormChange}>
                    <option value="Student">Student</option>
                    <option value="Staff">Staff</option>
                  </select>
                </div>

                {passForm.pass_type === "Student" ? (
                  <StudentPicker
                    students={students}
                    value={passForm.student_id}
                    onChange={handlePassFormChange}
                    name="student_id"
                    required
                    label="Student *"
                  />
                ) : (
                  <div className="form-field">
                    <label>Staff Member *</label>
                    <select name="teacher_id" value={passForm.teacher_id} onChange={handlePassFormChange} required>
                      <option value="">Select Staff</option>
                      {teachers.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <TextField label="Pass Date" name="pass_date" type="date" value={passForm.pass_date || todayLocalDate()} onChange={handlePassFormChange} />
                <TextField label="Reason" name="reason" value={passForm.reason} onChange={handlePassFormChange} />

                <div className="form-field">
                  <label>Expected to Return</label>
                  <label className="switch-row">
                    <input type="checkbox" name="expected_return" checked={passForm.expected_return} onChange={handlePassFormChange} />
                    <span>{passForm.expected_return ? "Yes" : "No"}</span>
                  </label>
                </div>

                {passForm.expected_return && (
                  <TextField label="Expected Return At" name="expected_return_at" type="datetime-local" value={passForm.expected_return_at} onChange={handlePassFormChange} />
                )}

                <div className="form-field full-width">
                  <label>Remarks</label>
                  <textarea name="remarks" value={passForm.remarks} onChange={handlePassFormChange} rows="2"></textarea>
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="primary-button">
                  <PlusCircle size={18} />
                  Request Pass
                </button>
              </div>
            </form>
          </section>

          {releaseTarget && (
            <section className="form-panel">
              <PanelTitle title={`Release Pass ${releaseTarget.pass_no}`} text="Record who collected them before opening the gate." />
              <form className="classic-form" onSubmit={confirmRelease}>
                <div className="form-grid">
                  <TextField label="Collected By" name="collected_by_name" value={releaseForm.collected_by_name} onChange={handleReleaseFormChange} />
                  <TextField label="Relation" name="collected_by_relation" value={releaseForm.collected_by_relation} onChange={handleReleaseFormChange} placeholder="Father, Guardian…" />
                  <TextField label="Phone" name="collected_by_phone" value={releaseForm.collected_by_phone} onChange={handleReleaseFormChange} />
                  <TextField label="ID Proof" name="collected_by_id_proof" value={releaseForm.collected_by_id_proof} onChange={handleReleaseFormChange} />
                </div>
                <div className="form-actions">
                  <button type="submit" className="primary-button">
                    <DoorOpen size={18} />
                    Confirm Release
                  </button>
                  <button type="button" className="secondary-button" onClick={() => setReleaseTarget(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            </section>
          )}

          <section className="table-panel">
            <div className="panel-header">
              <div><h3>Gate Passes</h3></div>
            </div>
            <div className="filter-row sis-filter-row">
              <div className="form-field">
                <label>Status</label>
                <select value={passStatusFilter} onChange={(e) => setPassStatusFilter(e.target.value)} disabled={stillOutOnly}>
                  <option value="">All Statuses</option>
                  <option value="Requested">Requested</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                  <option value="Out">Out</option>
                  <option value="Returned">Returned</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
              <div className="form-field">
                <label>View</label>
                <label className="switch-row">
                  <input type="checkbox" checked={stillOutOnly} onChange={(e) => setStillOutOnly(e.target.checked)} />
                  <span>Still Out Only</span>
                </label>
              </div>
            </div>
            <div className="table-wrapper">
              <table className="classic-table">
                <thead>
                  <tr>
                    <th>Pass No</th><th>Type</th><th>Person</th><th>Reason</th>
                    <th>Status</th><th>Collected By</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {passesLoading && <tr><td colSpan={7}>Loading...</td></tr>}
                  {!passesLoading && passes.map((p) => (
                    <tr key={p.id}>
                      <td>{p.pass_no}</td>
                      <td>{p.pass_type}</td>
                      <td>{p.student || p.teacher || "-"}</td>
                      <td>{p.reason || "-"}</td>
                      <td>
                        <span className={passStatusClass(p.status)}>{p.status}</span>
                        {p.overdue && <span className="status danger" style={{ marginLeft: 6 }}>Overdue</span>}
                      </td>
                      <td>{p.collected_by_name || "-"}</td>
                      <td>
                        <div className="action-buttons">
                          {p.status === "Requested" && (
                            <>
                              <button type="button" className="edit-button" onClick={() => approvePass(p)} title="Approve">
                                <Check size={15} />
                              </button>
                              <button type="button" className="delete-button" onClick={() => rejectPass(p)} title="Reject">
                                <X size={15} />
                              </button>
                            </>
                          )}
                          {p.status === "Approved" && canManage && (
                            <button type="button" className="edit-button" onClick={() => openRelease(p)} title="Release">
                              <DoorOpen size={15} />
                            </button>
                          )}
                          {p.status === "Out" && p.expected_return && canManage && (
                            <button type="button" className="edit-button" onClick={() => returnPass(p)} title="Record Return">
                              <Undo2 size={15} />
                            </button>
                          )}
                          {(p.status === "Requested" || p.status === "Approved") && (
                            <button type="button" className="delete-button" onClick={() => cancelPass(p)} title="Cancel">
                              <X size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!passesLoading && !passes.length && (
                    <tr><td colSpan={7}>No gate passes found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {activeTab === "blocked" && (
        <>
          {canManage && (
            <section className="form-panel">
              <PanelTitle title="Add to Blocked List" text="Bar a visitor from being registered at the gate." />
              <form className="classic-form" onSubmit={submitBlock}>
                <div className="form-grid">
                  <TextField label="Name *" name="name" value={blockForm.name} onChange={handleBlockFormChange} required />
                  <TextField label="Phone" name="phone" value={blockForm.phone} onChange={handleBlockFormChange} />
                  <TextField label="ID Proof Number" name="id_proof_number" value={blockForm.id_proof_number} onChange={handleBlockFormChange} />
                  <div className="form-field full-width">
                    <label>Reason *</label>
                    <textarea name="reason" value={blockForm.reason} onChange={handleBlockFormChange} rows="2" required></textarea>
                  </div>
                </div>
                <div className="form-actions">
                  <button type="submit" className="primary-button">
                    <PlusCircle size={18} />
                    Add to Blocked List
                  </button>
                </div>
              </form>
            </section>
          )}

          <section className="table-panel">
            <div className="panel-header">
              <div><h3>Blocked List</h3></div>
            </div>
            <div className="filter-row sis-filter-row">
              <div className="form-field">
                <label>View</label>
                <label className="switch-row">
                  <input type="checkbox" checked={showLifted} onChange={(e) => setShowLifted(e.target.checked)} />
                  <span>Include Lifted</span>
                </label>
              </div>
            </div>
            <div className="table-wrapper">
              <table className="classic-table">
                <thead>
                  <tr>
                    <th>Name</th><th>Phone</th><th>ID Proof</th><th>Reason</th>
                    <th>Blocked By</th><th>Status</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {blockedLoading && <tr><td colSpan={7}>Loading...</td></tr>}
                  {!blockedLoading && blocked.map((b) => (
                    <tr key={b.id}>
                      <td>{b.name}</td>
                      <td>{b.phone || "-"}</td>
                      <td>{b.id_proof_number || "-"}</td>
                      <td>{b.reason}</td>
                      <td>{b.blocked_by || "-"}</td>
                      <td><span className={b.is_active ? "status danger" : "status pending"}>{b.is_active ? "Active" : "Lifted"}</span></td>
                      <td>
                        {canManage && b.is_active && (
                          <div className="action-buttons">
                            <button type="button" className="delete-button" onClick={() => liftBlock(b)} title="Lift Block">
                              <Undo2 size={15} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!blockedLoading && !blocked.length && (
                    <tr><td colSpan={7}>No blocked visitors found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
