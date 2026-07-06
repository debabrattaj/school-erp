import { useEffect, useMemo, useState } from "react";
import { CalendarDays, PlusCircle, RefreshCcw, Trash2, X } from "lucide-react";
import API from "../api";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DEFAULT_PERIODS = 8;

const emptyForm = {
  day_of_week: "Monday",
  period_no: 1,
  start_time: "",
  end_time: "",
  subject: "",
  teacher_id: "",
  room: "",
};

export default function Timetable() {
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [entries, setEntries] = useState([]);

  // Remember the last-viewed class/year so the grid doesn't reset to empty on
  // reload or when navigating back to this page.
  const [classId, setClassId] = useState(() => localStorage.getItem("timetable_class_id") || "");
  const [academicYear, setAcademicYear] = useState(() => localStorage.getItem("timetable_year") || "");
  const [showForm, setShowForm] = useState(false);
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
        // Only default the year if the user hasn't already got one restored.
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
      setEntries(r.data || []);
    } catch {
      setEntries([]);
    }
  }

  useEffect(() => {
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, academicYear]);

  const entryBySlot = useMemo(() => {
    const map = {};
    entries.forEach((e) => {
      map[`${e.day_of_week}-${e.period_no}`] = e;
    });
    return map;
  }, [entries]);

  const periodCount = useMemo(() => {
    const maxPeriod = entries.reduce((m, e) => Math.max(m, e.period_no), 0);
    return Math.max(maxPeriod, DEFAULT_PERIODS);
  }, [entries]);

  const teacherName = (id) => {
    const t = teachers.find((x) => String(x.id) === String(id));
    return t ? t.name : "";
  };

  function openAdd(day, period) {
    setForm({ ...emptyForm, day_of_week: day || "Monday", period_no: period || 1 });
    setShowForm(true);
    setMessage("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!classId) {
      setMessage("Select a class first.");
      return;
    }
    try {
      await API.post("/timetable/", {
        academic_year: academicYear || null,
        class_id: Number(classId),
        day_of_week: form.day_of_week,
        period_no: Number(form.period_no),
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        subject: form.subject || null,
        teacher_id: form.teacher_id ? Number(form.teacher_id) : null,
        room: form.room || null,
      });
      setShowForm(false);
      setForm(emptyForm);
      setMessage("Period added.");
      await loadEntries();
    } catch (error) {
      const detail = error.response?.data?.detail;
      setMessage(typeof detail === "string" ? detail : "Unable to add period.");
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Remove this period?")) return;
    try {
      await API.delete(`/timetable/${id}`);
      setMessage("Period removed.");
      await loadEntries();
    } catch {
      setMessage("Unable to remove period.");
    }
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Scheduling</p>
          <h2>Class Timetable</h2>
          <p>Build a weekly period schedule per class. Teacher clashes are prevented automatically.</p>
        </div>
        <div className="module-header-actions">
          <button type="button" className="secondary-button" onClick={loadEntries}>
            <RefreshCcw size={16} /> Refresh
          </button>
          <button type="button" className="primary-button" onClick={() => openAdd()} disabled={!classId}>
            <PlusCircle size={16} /> Add Period
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
                <option key={c.id} value={c.id}>
                  {c.class_name} - {c.section}
                </option>
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
          <div className="panel-header"><div><h3>Add Period</h3></div>
            <button type="button" className="light-button" onClick={() => setShowForm(false)}><X size={15} /></button>
          </div>
          <form className="classic-form" onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-field">
                <label>Day *</label>
                <select value={form.day_of_week} onChange={(e) => setForm({ ...form, day_of_week: e.target.value })}>
                  {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Period *</label>
                <input type="number" min="1" value={form.period_no} onChange={(e) => setForm({ ...form, period_no: e.target.value })} required />
              </div>
              <div className="form-field">
                <label>Start Time</label>
                <input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              </div>
              <div className="form-field">
                <label>End Time</label>
                <input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
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
            </div>
            <div className="form-actions">
              <button type="submit" className="primary-button"><PlusCircle size={16} /> Save Period</button>
              <button type="button" className="light-button" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </section>
      )}

      <section className="form-panel">
        <div className="panel-header"><div><h3><CalendarDays size={18} /> Weekly Schedule</h3></div></div>
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
              {Array.from({ length: periodCount }, (_, i) => i + 1).map((period) => (
                <tr key={period}>
                  <td style={{ fontWeight: 700 }}>P{period}</td>
                  {DAYS.map((day) => {
                    const entry = entryBySlot[`${day}-${period}`];
                    return (
                      <td key={day} style={{ minWidth: 140 }}>
                        {entry ? (
                          <div style={{ position: "relative" }}>
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
                              onClick={() => handleDelete(entry.id)}
                              title="Remove"
                              style={{ position: "absolute", top: 0, right: 0, border: "none", background: "none", cursor: "pointer", color: "#be123c" }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openAdd(day, period)}
                            style={{ border: "1px dashed #cbd5e1", background: "none", borderRadius: 6, color: "#94a3b8", width: "100%", padding: "6px", cursor: "pointer" }}
                          >
                            +
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
