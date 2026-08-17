import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Copy,
  Fingerprint,
  KeyRound,
  Link2,
  PlusCircle,
  RefreshCw,
  Trash2,
} from "lucide-react";

import API from "../api";
import EnhancedRecordsTable from "../components/EnhancedRecordsTable";

const TABS = [
  ["devices", "Devices"],
  ["enrollments", "Enrollments"],
  ["punches", "Punch Log"],
  ["rules", "Attendance Rules"],
];

const emptyDeviceForm = {
  name: "",
  serial_number: "",
  location: "",
  vendor: "",
  mode: "push",
  pull_endpoint: "",
};

const emptyEnrollmentForm = {
  device_user_id: "",
  device_id: "",
  subject_type: "student",
  subject_id: "",
};

function getApiErrorMessage(error, fallback) {
  return error?.response?.data?.detail || fallback;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function Biometric() {
  const [activeTab, setActiveTab] = useState("devices");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [devices, setDevices] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [punches, setPunches] = useState([]);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [config, setConfig] = useState(null);

  const [deviceForm, setDeviceForm] = useState(emptyDeviceForm);
  const [enrollmentForm, setEnrollmentForm] = useState(emptyEnrollmentForm);

  // A device token is returned exactly once, by registration or rotation, and
  // cannot be fetched again. It is held here only until the admin dismisses it.
  const [issuedToken, setIssuedToken] = useState(null);

  const [punchDate, setPunchDate] = useState(todayIso());
  const [unmatchedOnly, setUnmatchedOnly] = useState(false);
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    loadDevices();
    loadStudents();
    loadTeachers();
    loadConfig();
  }, []);

  useEffect(() => {
    if (activeTab === "enrollments") loadEnrollments();
    if (activeTab === "punches") loadPunches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  async function loadDevices() {
    setLoading(true);
    try {
      const response = await API.get("/biometric/devices");
      setDevices(response.data);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load devices."));
    } finally {
      setLoading(false);
    }
  }

  async function loadEnrollments() {
    try {
      const response = await API.get("/biometric/enrollments");
      setEnrollments(response.data);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load enrollments."));
    }
  }

  async function loadPunches() {
    setLoading(true);
    try {
      const params = {};
      if (punchDate) params.on_date = punchDate;
      if (unmatchedOnly) params.unmatched_only = true;
      const response = await API.get("/biometric/punches", { params });
      setPunches(response.data);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load punches."));
    } finally {
      setLoading(false);
    }
  }

  async function loadStudents() {
    try {
      const response = await API.get("/students/");
      setStudents(response.data || []);
    } catch {
      setStudents([]);
    }
  }

  async function loadTeachers() {
    try {
      const response = await API.get("/teachers/");
      setTeachers(response.data || []);
    } catch {
      setTeachers([]);
    }
  }

  async function loadConfig() {
    try {
      const response = await API.get("/biometric/config");
      setConfig(response.data);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load attendance rules."));
    }
  }

  function handleDeviceChange(e) {
    const { name, value } = e.target;
    setDeviceForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleRegisterDevice(e) {
    e.preventDefault();
    if (!deviceForm.name.trim() || !deviceForm.serial_number.trim()) {
      setMessage("Device name and serial number are required.");
      return;
    }
    try {
      const payload = { ...deviceForm };
      if (payload.mode !== "pull") payload.pull_endpoint = null;
      const response = await API.post("/biometric/devices", payload);
      setIssuedToken({ device: response.data.name, token: response.data.auth_token });
      setDeviceForm(emptyDeviceForm);
      setMessage("Device registered.");
      loadDevices();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to register device."));
    }
  }

  async function handleRotateToken(device) {
    if (!window.confirm(`Rotate the token for "${device.name}"? The device will stop sending until it is reconfigured with the new token.`)) {
      return;
    }
    try {
      const response = await API.post(`/biometric/devices/${device.id}/rotate-token`);
      setIssuedToken({ device: response.data.name, token: response.data.auth_token });
      setMessage("Token rotated. The previous token no longer works.");
      loadDevices();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to rotate token."));
    }
  }

  async function handleToggleDevice(device) {
    try {
      await API.put(`/biometric/devices/${device.id}`, { is_active: !device.is_active });
      loadDevices();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to update device."));
    }
  }

  async function handleDeleteDevice(device) {
    if (!window.confirm(`Delete "${device.name}"? Its punch history will be removed too.`)) return;
    try {
      await API.delete(`/biometric/devices/${device.id}`);
      setMessage("Device deleted.");
      loadDevices();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to delete device."));
    }
  }

  async function handleAddEnrollment(e) {
    e.preventDefault();
    if (!enrollmentForm.device_user_id.trim() || !enrollmentForm.subject_id) {
      setMessage("Device user ID and a person are both required.");
      return;
    }
    try {
      const payload = {
        device_user_id: enrollmentForm.device_user_id.trim(),
        device_id: enrollmentForm.device_id ? Number(enrollmentForm.device_id) : null,
      };
      if (enrollmentForm.subject_type === "student") {
        payload.student_id = Number(enrollmentForm.subject_id);
      } else {
        payload.teacher_id = Number(enrollmentForm.subject_id);
      }
      const response = await API.post("/biometric/enrollments", payload);
      setEnrollmentForm(emptyEnrollmentForm);
      setMessage(
        response.data.relinked_punches
          ? `Mapping added. ${response.data.relinked_punches} earlier punch(es) matched to this person.`
          : "Mapping added."
      );
      loadEnrollments();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to add mapping."));
    }
  }

  async function handleDeleteEnrollment(row) {
    if (!window.confirm("Remove this mapping? Past punches stay, but stop being attributed.")) return;
    try {
      await API.delete(`/biometric/enrollments/${row.id}`);
      loadEnrollments();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to remove mapping."));
    }
  }

  async function handleSaveConfig(e) {
    e.preventDefault();
    try {
      const response = await API.put("/biometric/config", {
        derive_attendance: config.derive_attendance,
        absent_if_no_punch: config.absent_if_no_punch,
        overwrite_manual: config.overwrite_manual,
        late_after: config.late_after || null,
        half_day_before: config.half_day_before || null,
      });
      setConfig(response.data);
      setMessage("Attendance rules saved.");
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to save rules."));
    }
  }

  async function handleDerive() {
    try {
      const response = await API.post("/biometric/derive", { target_date: punchDate });
      const r = response.data;
      if (r.disabled) {
        setMessage("Attendance rules are switched off — turn on \"Write attendance from punches\" first.");
        return;
      }
      setMessage(
        `Done: ${r.created} created, ${r.updated} updated, ${r.absent_marked} marked absent, ` +
        `${r.skipped_manual} left alone because a teacher had marked them.`
      );
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to derive attendance."));
    }
  }

  function personName(row) {
    if (row.student_id) {
      const student = students.find((s) => s.id === row.student_id);
      return student
        ? `${student.first_name} ${student.last_name || ""}`.trim()
        : `Student #${row.student_id}`;
    }
    if (row.teacher_id) {
      const teacher = teachers.find((t) => t.id === row.teacher_id);
      return teacher ? teacher.name : `Teacher #${row.teacher_id}`;
    }
    return null;
  }

  function deviceName(deviceId) {
    if (!deviceId) return "All devices";
    const device = devices.find((d) => d.id === deviceId);
    return device ? device.name : `#${deviceId}`;
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Attendance</p>
          <h2>Biometric Attendance</h2>
          <p>
            Register terminals, map their user IDs to people, and turn the punches
            they send into attendance.
          </p>
        </div>
      </section>

      {message && <div className="toast-notification">{message}</div>}

      {issuedToken && (
        <section className="form-panel">
          <div className="panel-header">
            <div>
              <h3><KeyRound size={17} /> Device token for {issuedToken.device}</h3>
              <p>
                Copy this into the device or agent configuration now — it is shown
                once and cannot be retrieved later. If you lose it, rotate the
                token to issue a new one.
              </p>
            </div>
          </div>
          <div className="form-grid">
            <div className="form-field" style={{ gridColumn: "1 / -1" }}>
              <label>Token</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="text" readOnly value={issuedToken.token} style={{ fontFamily: "monospace" }} />
                <button
                  type="button"
                  className="light-button"
                  onClick={() => {
                    navigator.clipboard?.writeText(issuedToken.token);
                    setMessage("Token copied.");
                  }}
                >
                  <Copy size={15} /> Copy
                </button>
              </div>
              <small>
                The device must send it as <code>X-Device-Token</code>, together with
                <code> X-Device-Serial</code> and <code>X-School-Code</code>.
              </small>
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="primary-button" onClick={() => setIssuedToken(null)}>
              I've saved it
            </button>
          </div>
        </section>
      )}

      <div className="tabs-row tab-strip">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={activeTab === key ? "tab active" : "tab"}
            onClick={() => { setActiveTab(key); setMessage(""); }}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "devices" && (
        <>
          <section className="form-panel">
            <div className="panel-header">
              <div>
                <h3><PlusCircle size={17} /> Register a device</h3>
                <p>
                  Use <strong>Push</strong> when the terminal can call out to us — most can.
                  Use <strong>Pull</strong> only for a vendor cloud API we can reach over the
                  internet: a terminal on your own network cannot be dialled from
                  the server, and needs an on-site agent that pushes to us instead.
                </p>
              </div>
            </div>
            <form className="classic-form" onSubmit={handleRegisterDevice}>
              <div className="form-grid">
                <div className="form-field">
                  <label>Name *</label>
                  <input type="text" name="name" value={deviceForm.name} onChange={handleDeviceChange} placeholder="Main Gate" required />
                </div>
                <div className="form-field">
                  <label>Serial number *</label>
                  <input type="text" name="serial_number" value={deviceForm.serial_number} onChange={handleDeviceChange} required />
                </div>
                <div className="form-field">
                  <label>Location</label>
                  <input type="text" name="location" value={deviceForm.location} onChange={handleDeviceChange} placeholder="Reception" />
                </div>
                <div className="form-field">
                  <label>Vendor</label>
                  <input type="text" name="vendor" value={deviceForm.vendor} onChange={handleDeviceChange} placeholder="ZKTeco, eSSL, Mantra..." />
                </div>
                <div className="form-field">
                  <label>Mode</label>
                  <select name="mode" value={deviceForm.mode} onChange={handleDeviceChange}>
                    <option value="push">Push — device sends to us</option>
                    <option value="pull">Pull — we fetch from a cloud API</option>
                  </select>
                </div>
                {deviceForm.mode === "pull" && (
                  <div className="form-field">
                    <label>Pull endpoint</label>
                    <input type="url" name="pull_endpoint" value={deviceForm.pull_endpoint} onChange={handleDeviceChange} placeholder="https://vendor.example/api/punches" />
                    <small>Must be reachable from the server, not a LAN address.</small>
                  </div>
                )}
              </div>
              <div className="form-actions">
                <button type="submit" className="primary-button">Register device</button>
              </div>
            </form>
          </section>

          <EnhancedRecordsTable
            loading={loading}
            data={devices}
            searchText={searchText}
            setSearchText={setSearchText}
            searchPlaceholder="Search devices..."
            emptyText="No devices registered yet."
            columns={[
              { key: "name", label: "Name", render: (d) => d.name },
              { key: "serial_number", label: "Serial", render: (d) => d.serial_number },
              { key: "location", label: "Location", render: (d) => d.location || "-" },
              { key: "vendor", label: "Vendor", render: (d) => d.vendor || "-" },
              { key: "mode", label: "Mode", render: (d) => (d.mode === "pull" ? "Pull" : "Push") },
              {
                key: "is_active",
                label: "Status",
                render: (d) => (
                  <span className={d.is_active ? "status active" : "status danger"}>
                    {d.is_active ? "Active" : "Disabled"}
                  </span>
                ),
              },
              {
                key: "last_seen_at",
                label: "Last punch",
                render: (d) => (d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : "Never"),
              },
              {
                key: "actions",
                label: "Actions",
                render: (d) => (
                  <div className="row-actions">
                    <button type="button" title="Rotate token" onClick={() => handleRotateToken(d)}>
                      <RefreshCw size={15} />
                    </button>
                    <button type="button" title={d.is_active ? "Disable" : "Enable"} onClick={() => handleToggleDevice(d)}>
                      <Fingerprint size={15} />
                    </button>
                    <button type="button" title="Delete" onClick={() => handleDeleteDevice(d)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </>
      )}

      {activeTab === "enrollments" && (
        <>
          <section className="form-panel">
            <div className="panel-header">
              <div>
                <h3><Link2 size={17} /> Map a device user ID to a person</h3>
                <p>
                  Leave the device blank to apply the mapping on every terminal — the
                  usual case. Name a device only when that one terminal numbers
                  people differently; it then overrides the shared mapping.
                </p>
              </div>
            </div>
            <form className="classic-form" onSubmit={handleAddEnrollment}>
              <div className="form-grid">
                <div className="form-field">
                  <label>Device user ID *</label>
                  <input
                    type="text"
                    value={enrollmentForm.device_user_id}
                    onChange={(e) => setEnrollmentForm((p) => ({ ...p, device_user_id: e.target.value }))}
                    placeholder="As enrolled on the terminal"
                    required
                  />
                </div>
                <div className="form-field">
                  <label>Device</label>
                  <select
                    value={enrollmentForm.device_id}
                    onChange={(e) => setEnrollmentForm((p) => ({ ...p, device_id: e.target.value }))}
                  >
                    <option value="">All devices</option>
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label>Person type</label>
                  <select
                    value={enrollmentForm.subject_type}
                    onChange={(e) => setEnrollmentForm((p) => ({ ...p, subject_type: e.target.value, subject_id: "" }))}
                  >
                    <option value="student">Student</option>
                    <option value="teacher">Teacher</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>Person *</label>
                  <select
                    value={enrollmentForm.subject_id}
                    onChange={(e) => setEnrollmentForm((p) => ({ ...p, subject_id: e.target.value }))}
                    required
                  >
                    <option value="">Select...</option>
                    {enrollmentForm.subject_type === "student"
                      ? students.map((s) => (
                          <option key={s.id} value={s.id}>
                            {`${s.first_name} ${s.last_name || ""}`.trim()} — {s.admission_no}
                          </option>
                        ))
                      : teachers.map((t) => (
                          <option key={t.id} value={t.id}>{t.name} — {t.employee_no}</option>
                        ))}
                  </select>
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="primary-button">Add mapping</button>
              </div>
            </form>
          </section>

          <EnhancedRecordsTable
            data={enrollments}
            searchText={searchText}
            setSearchText={setSearchText}
            searchPlaceholder="Search mappings..."
            emptyText="No mappings yet. Punches will be stored but unattributed until you add some."
            columns={[
              { key: "device_user_id", label: "Device user ID", render: (r) => r.device_user_id },
              { key: "device_id", label: "Applies to", render: (r) => deviceName(r.device_id) },
              { key: "person", label: "Person", render: (r) => personName(r) || "-" },
              { key: "kind", label: "Type", render: (r) => (r.student_id ? "Student" : "Teacher") },
              {
                key: "actions",
                label: "Actions",
                render: (r) => (
                  <div className="row-actions">
                    <button type="button" title="Remove" onClick={() => handleDeleteEnrollment(r)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </>
      )}

      {activeTab === "punches" && (
        <>
          <section className="form-panel">
            <div className="form-grid">
              <div className="form-field">
                <label>Date</label>
                <input type="date" value={punchDate} onChange={(e) => setPunchDate(e.target.value)} />
              </div>
              <div className="form-field">
                <label>Filter</label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    checked={unmatchedOnly}
                    onChange={(e) => setUnmatchedOnly(e.target.checked)}
                  />
                  Unmatched only
                </label>
                <small>Punches whose device user ID has no mapping yet.</small>
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="light-button" onClick={loadPunches}>Refresh</button>
              <button type="button" className="primary-button" onClick={handleDerive}>
                Write attendance for this date
              </button>
            </div>
          </section>

          <EnhancedRecordsTable
            loading={loading}
            data={punches}
            searchText={searchText}
            setSearchText={setSearchText}
            searchPlaceholder="Search punches..."
            emptyText="No punches recorded for this date."
            columns={[
              {
                key: "punched_at",
                label: "Time",
                render: (p) => new Date(p.punched_at).toLocaleTimeString(),
              },
              { key: "device_user_id", label: "Device user ID", render: (p) => p.device_user_id },
              {
                key: "person",
                label: "Person",
                render: (p) =>
                  personName(p) || (
                    <span className="status pending">
                      <AlertTriangle size={13} /> Unmapped
                    </span>
                  ),
              },
              { key: "device_id", label: "Device", render: (p) => deviceName(p.device_id) },
              { key: "direction", label: "Direction", render: (p) => p.direction || "-" },
              {
                key: "processed_at",
                label: "Counted",
                render: (p) => (p.processed_at ? "Yes" : "Not yet"),
              },
            ]}
          />
        </>
      )}

      {activeTab === "rules" && config && (
        <section className="form-panel">
          <div className="panel-header">
            <div>
              <h3>Attendance rules</h3>
              <p>
                How punches become attendance. Every option starts off — run a
                terminal alongside manual marking until you trust it, then switch
                writing on.
              </p>
            </div>
          </div>
          <form className="classic-form" onSubmit={handleSaveConfig}>
            <div className="form-grid">
              <div className="form-field" style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    checked={config.derive_attendance}
                    onChange={(e) => setConfig({ ...config, derive_attendance: e.target.checked })}
                  />
                  Write attendance from punches
                </label>
                <small>Off means punches are still collected and shown here, but nothing is written to attendance.</small>
              </div>

              <div className="form-field">
                <label>Late after</label>
                <input
                  type="time"
                  value={config.late_after || ""}
                  onChange={(e) => setConfig({ ...config, late_after: e.target.value })}
                />
                <small>First punch after this counts as Late. Blank = never Late.</small>
              </div>
              <div className="form-field">
                <label>Half day before</label>
                <input
                  type="time"
                  value={config.half_day_before || ""}
                  onChange={(e) => setConfig({ ...config, half_day_before: e.target.value })}
                />
                <small>Last punch before this counts as Half Day. Blank = never Half Day.</small>
              </div>

              <div className="form-field" style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    checked={config.absent_if_no_punch}
                    onChange={(e) => setConfig({ ...config, absent_if_no_punch: e.target.checked })}
                  />
                  Mark mapped people with no punch as Absent
                </label>
                <small>
                  Leave off unless you are confident the terminal is reliable — if it
                  stops reporting, this marks everyone absent.
                </small>
              </div>

              <div className="form-field" style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    checked={config.overwrite_manual}
                    onChange={(e) => setConfig({ ...config, overwrite_manual: e.target.checked })}
                  />
                  Overwrite attendance a teacher marked by hand
                </label>
                <small>Off by default: a teacher's mark wins over the terminal.</small>
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="primary-button">Save rules</button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
