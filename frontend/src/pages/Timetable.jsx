import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Coffee, Plus, PlusCircle, RefreshCcw, Trash2, Utensils, X } from "lucide-react";
import API from "../api";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DEFAULT_PERIODS = 8;

const emptyForm = {
  day_of_week: "Monday",
  period_no: 1,
  subject: "",
  teacher_id: "",
  room: "",
  start_time: "",
  end_time: "",
  label: "",
};

export default function Timetable() {
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [entries, setEntries] = useState([]);

  const [classId, setClassId] = useState(() => localStorage.getItem("timetable_class_id") || "");
  const [academicYear, setAcademicYear] = useState(() => localStorage.getItem("timetable_year") || "");
  const [rowCount, setRowCount] = useState(DEFAULT_PERIODS);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formType, setFormType] = useState("period"); // period | recess | break
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return undefined;
    const id = window.setTimeout(() => setMessage(""), 2500);
    return () => window.clearTimeout(id);
  }, [message]);

  useEffect(() => {
    API.get("/classes/").then((r) => setClasses(r.data || [])).catch(() => {});
    API.get("/teachers/").then((r) => setTeachers(r.data || [])).catch(() => {});
    API.get("/academic-years/")
      .then((r) => {
        const years = r.data || [];
        setAcademicYears(years);
        if (!localStorage.getItem("timetable_year")) {
          const current = years.find((y) => y.is_current) || years[0];
          if (current) setAcademicYear(current.name);
        }
      })
      .catch(() => {});
  }, []);

  function selectClass(id) {
    setClassId(id);
    localStorage.setItem("timetable_class_id", id);
  }
  function selectYear(year) {
    setAcademicYear(year);
    localStorage.setItem("timetable_year", year);
  }

  async function loadEntries() {
    if (!classId) {
      setEntries([]);
      return;
    }
    try {
      const params = { class_id: classId };
      if (academicYear) params.academic_year = academicYear;
      const r = await API.get("/timetable/", { params });
      const data = r.data || [];
      setEntries(data);
      const maxPeriod = data.reduce((m, e) => Math.max(m, e.period_no), 0);
      setRowCount(Math.max(maxPeriod, DEFAULT_PERIODS));
    } catch {
      setEntries([]);
    }
  }

  useEffect(() => {
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, academicYear]);

  const breakByRow = useMemo(() => {
    const map = {};
    entries.forEach((e) => {
      if (e.entry_type && e.entry_type !== "period") map[e.period_no] = e;
    });
    return map;
  }, [entries]);

  const periodBySlot = useMemo(() => {
    const map = {};
    entries.forEach((e) => {
      if (!e.entry_type || e.entry_type === "period") {
        map[`${e.day_of_week}-${e.period_no}`] = e;
      }
    });
    return map;
  }, [entries]);

  const teacherName = (id) => {
    const t = teachers.find((x) => String(x.id) === String(id));
    return t ? t.name : "";
  };

  function openAddPeriod(day, period) {
    setEditingId(null);
    setFormType("period");
    setForm({ ...emptyForm, day_of_week: day || "Monday", period_no: period || 1 });
    setShowForm(true);
    setMessage("");
  }

  function openEditPeriod(entry) {
    setEditingId(entry.id);
    setFormType("period");
    setForm({
      day_of_week: entry.day_of_week,
      period_no: entry.period_no,
      subject: entry.subject || "",
      teacher_id: entry.teacher_id || "",
      room: entry.room || "",
      start_time: entry.start_time || "",
      end_time: entry.end_time || "",
      label: "",
    });
    setShowForm(true);
    setMessage("");
  }

  function openEditBreak(entry) {
    setEditingId(entry.id);
    setFormType(entry.entry_type || "recess");
    setForm({
      ...emptyForm,
      period_no: entry.period_no,
      label: entry.label || "",
      start_time: entry.start_time || "",
      end_time: entry.end_time || "",
    });
    setShowForm(true);
    setMessage("");
  }

  function addRow() {
    setRowCount((n) => n + 1);
  }

  async function addBreak(type) {
    if (!classId) {
      setMessage("Select a class first.");
      return;
    }
    const nextRow = rowCount + 1;
    try {
      await API.post("/timetable/", {
        academic_year: academicYear || null,
        class_id: Number(classId),
        day_of_week: "*",
        period_no: nextRow,
        entry_type: type,
        label: type === "recess" ? "Recess" : "Lunch Break",
      });
      setRowCount(nextRow);
      setMessage(`${type === "recess" ? "Recess" : "Break"} added.`);
      await loadEntries();
    } catch (error) {
      const detail = error.response?.data?.detail;
      setMessage(typeof detail === "string" ? detail : "Unable to add break.");
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!classId) {
      setMessage("Select a class first.");
      return;
    }
    const isBreak = formType !== "period";
    const body = {
      academic_year: academicYear || null,
      class_id: Number(classId),
      period_no: Number(form.period_no),
      start_time: form.start_time || null,
      end_time: form.end_time || null,
    };
    if (isBreak) {
      Object.assign(body, { entry_type: formType, day_of_week: "*", label: form.label || null });
    } else {
      Object.assign(body, {
        entry_type: "period",
        day_of_week: form.day_of_week,
        subject: form.subject || null,
        teacher_id: form.teacher_id ? Number(form.teacher_id) : null,
        room: form.room || null,
      });
    }
    try {
      if (editingId) {
        await API.put(`/timetable/${editingId}`, body);
        setMessage("Period updated.");
      } else {
        await API.post("/timetable/", body);
        setMessage("Period added.");
      }
      setShowForm(false);
      setForm(emptyForm);
      setEditingId(null);
      await loadEntries();
    } catch (error) {
      const detail = error.response?.data?.detail;
      setMessage(typeof detail === "string" ? detail : "Unable to save.");
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Remove this row?")) return;
    try {
      await API.delete(`/timetable/${id}`);
      setMessage("Removed.");
      await loadEntries();
    } catch {
      setMessage("Unable to remove.");
    }
  }

  // Build ordered rows; teaching-period rows get a running "P{n}" label.
  const rows = [];
  let periodCounter = 0;
  for (let p = 1; p <= rowCount; p += 1) {
    const brk = breakByRow[p];
    if (brk) {
      rows.push({ type: "break", period_no: p, entry: brk });
    } else {
      periodCounter += 1;
      rows.push({ type: "period", period_no: p, label: `P${periodCounter}` });
    }
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Scheduling</p>
          <h2>Class Timetable</h2>
          <p>Build a weekly period schedule per class. Click a cell to edit; teacher clashes are prevented automatically.</p>
        </div>
        <div className="module-header-actions">
          <button type="button" className="secondary-button" onClick={loadEntries}>
            <RefreshCcw size={16} /> Refresh
          </button>
        </div>
      </section>

      {message && <div className="toast-notification">{message}</div>}

      <section className="form-panel">
        <div className="form-grid" style={{ padding: "1rem" }}>
          <div className="form-field">
            <label>Class</label>
            <select value={classId} onChange={(e) => selectClass(e.target.value)}>
              <option value="">Select a class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.class_name} - {c.section}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Academic Year</label>
            <select value={academicYear} onChange={(e) => selectYear(e.target.value)}>
              <option value="">All</option>
              {academicYears.map((y) => (
                <option key={y.id} value={y.name}>{y.name}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {showForm && (
        <section className="form-panel">
          <div className="panel-header">
            <div><h3>{editingId ? "Edit" : "Add"} {formType === "period" ? "Period" : formType === "recess" ? "Recess" : "Break"}</h3></div>
            <button type="button" className="light-button" onClick={() => { setShowForm(false); setEditingId(null); }}><X size={15} /></button>
          </div>
          <form className="classic-form" onSubmit={handleSubmit}>
            <div className="form-grid">
              {formType === "period" ? (
                <>
                  <div className="form-field">
                    <label>Day *</label>
                    <select value={form.day_of_week} onChange={(e) => setForm({ ...form, day_of_week: e.target.value })}>
                      {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Row (Period No.) *</label>
                    <input type="number" min="1" value={form.period_no} onChange={(e) => setForm({ ...form, period_no: e.target.value })} required />
                  </div>
                  <div className="form-field">
                    <label>Subject</label>
                    <input type="text" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Mathematics" />
                  </div>
                  <div className="form-field">
                    <label>Teacher</label>
                    <select value={form.teacher_id} onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}>
                      <option value="">Unassigned</option>
                      {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Room</label>
                    <input type="text" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="R1" />
                  </div>
                </>
              ) : (
                <div className="form-field">
                  <label>Label</label>
                  <input type="text" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder={formType === "recess" ? "Recess" : "Lunch Break"} />
                </div>
              )}
              <div className="form-field">
                <label>Start Time</label>
                <input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              </div>
              <div className="form-field">
                <label>End Time</label>
                <input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="primary-button"><PlusCircle size={16} /> {editingId ? "Update" : "Save"}</button>
              <button type="button" className="light-button" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</button>
            </div>
          </form>
        </section>
      )}

      <section className="form-panel">
        <div className="panel-header">
          <div><h3><CalendarDays size={18} /> Weekly Schedule</h3></div>
          <div className="module-header-actions">
            <button type="button" className="secondary-button" onClick={addRow} disabled={!classId}><Plus size={15} /> Add Row</button>
            <button type="button" className="secondary-button" onClick={() => addBreak("recess")} disabled={!classId}><Coffee size={15} /> Add Recess</button>
            <button type="button" className="secondary-button" onClick={() => addBreak("break")} disabled={!classId}><Utensils size={15} /> Add Break</button>
          </div>
        </div>
        {!classId ? (
          <div style={{ padding: "1.5rem", color: "#64748b" }}>Select a class to view its timetable.</div>
        ) : (
          <div className="table-wrapper"><table className="classic-table">
            <thead>
              <tr>
                <th>Period</th>
                {DAYS.map((d) => <th key={d}>{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                row.type === "break" ? (
                  <tr key={`b-${row.period_no}`}>
                    <td style={{ fontWeight: 700, color: "#94a3b8" }}>—</td>
                    <td colSpan={DAYS.length} style={{ background: "#fff7ed", textAlign: "center", position: "relative" }}>
                      <button
                        type="button"
                        onClick={() => openEditBreak(row.entry)}
                        style={{ border: "none", background: "none", cursor: "pointer", fontWeight: 700, color: "#b45309" }}
                      >
                        {row.entry.label || (row.entry.entry_type === "recess" ? "Recess" : "Break")}
                        {(row.entry.start_time || row.entry.end_time) && (
                          <span style={{ fontWeight: 400, color: "#92400e" }}>
                            {" "}· {row.entry.start_time}{row.entry.end_time ? `–${row.entry.end_time}` : ""}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(row.entry.id)}
                        title="Remove"
                        style={{ position: "absolute", top: 6, right: 8, border: "none", background: "none", cursor: "pointer", color: "#be123c" }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={`p-${row.period_no}`}>
                    <td style={{ fontWeight: 700 }}>{row.label}</td>
                    {DAYS.map((day) => {
                      const entry = periodBySlot[`${day}-${row.period_no}`];
                      return (
                        <td key={day} style={{ minWidth: 140 }}>
                          {entry ? (
                            <div style={{ position: "relative", cursor: "pointer" }} onClick={() => openEditPeriod(entry)} title="Click to edit">
                              <strong>{entry.subject || "-"}</strong>
                              <div style={{ fontSize: "0.78rem", color: "#64748b" }}>
                                {entry.teacher_name_snapshot || teacherName(entry.teacher_id) || "—"}
                                {entry.room ? ` · ${entry.room}` : ""}
                              </div>
                              {(entry.start_time || entry.end_time) && (
                                <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
                                  {entry.start_time}{entry.end_time ? `–${entry.end_time}` : ""}
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={(ev) => { ev.stopPropagation(); handleDelete(entry.id); }}
                                title="Remove"
                                style={{ position: "absolute", top: 0, right: 0, border: "none", background: "none", cursor: "pointer", color: "#be123c" }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openAddPeriod(day, row.period_no)}
                              style={{ border: "1px dashed #cbd5e1", background: "none", borderRadius: 6, color: "#94a3b8", width: "100%", padding: "6px", cursor: "pointer" }}
                            >
                              +
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                )
              ))}
            </tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
