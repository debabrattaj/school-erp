import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Edit,
  HeartPulse,
  Hospital,
  PlusCircle,
  RefreshCcw,
  Search,
  Trash2,
} from "lucide-react";

import API from "../api";
import StudentPicker from "../components/StudentPicker";

const emptyVisitForm = {
  student_id: "",
  visit_date: new Date().toISOString().slice(0, 10),
  visit_time: "",
  symptoms: "",
  diagnosis: "",
  treatment: "",
  medicine_given: "",
  attended_by: "",
  referred_to_hospital: false,
  follow_up_date: "",
  status: "Open",
  remarks: "",
};

function getApiErrorMessage(error, fallbackMessage) {
  const detail = error.response?.data?.detail;

  if (Array.isArray(detail)) return detail.map((item) => item.msg).join(" | ");
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") return detail.msg || JSON.stringify(detail);

  return fallbackMessage;
}

function getStudentName(student) {
  if (!student) return "-";

  const name =
    student.student_name ||
    student.name ||
    `${student.first_name || ""} ${student.last_name || ""}`.trim() ||
    "Unknown Student";

  return student.admission_no ? `${student.admission_no} - ${name}` : name;
}

export default function HealthInfirmary() {
  const [visits, setVisits] = useState([]);
  const [students, setStudents] = useState([]);
  const [visitForm, setVisitForm] = useState(emptyVisitForm);
  const [editingId, setEditingId] = useState(null);
  const [pageMode, setPageMode] = useState("list");
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadPageData() {
    try {
      setLoading(true);
      setMessage("");

      const [visitResponse, studentResponse] = await Promise.all([
        API.get("/health-infirmary/visits/"),
        API.get("/students/"),
      ]);

      setVisits(visitResponse.data || []);
      setStudents(studentResponse.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load health infirmary data."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPageData();
  }, []);

  const filteredVisits = useMemo(() => {
    return visits.filter((visit) => {
      const matchesStatus = statusFilter ? visit.status === statusFilter : true;
      const searchValue = [
        visit.student_name,
        visit.admission_no,
        visit.class_name,
        visit.section,
        visit.symptoms,
        visit.diagnosis,
        visit.medicine_given,
        visit.attended_by,
        visit.status,
      ]
        .join(" ")
        .toLowerCase();

      return matchesStatus && searchValue.includes(searchText.toLowerCase());
    });
  }, [searchText, statusFilter, visits]);

  const openCases = visits.filter((visit) =>
    ["Open", "Under Observation"].includes(visit.status)
  ).length;
  const referredCases = visits.filter((visit) => visit.referred_to_hospital).length;
  const followUps = visits.filter((visit) => visit.follow_up_date).length;

  function handleChange(event) {
    const { name, value, type, checked } = event.target;
    setVisitForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function resetForm() {
    setVisitForm(emptyVisitForm);
    setEditingId(null);
    setPageMode("list");
  }

  async function saveVisit(event) {
    event.preventDefault();
    setMessage("");

    const payload = {
      ...visitForm,
      student_id: Number(visitForm.student_id),
      symptoms: visitForm.symptoms.trim(),
      diagnosis: visitForm.diagnosis.trim() || null,
      treatment: visitForm.treatment.trim() || null,
      medicine_given: visitForm.medicine_given.trim() || null,
      attended_by: visitForm.attended_by.trim() || null,
      visit_time: visitForm.visit_time || null,
      follow_up_date: visitForm.follow_up_date || null,
      remarks: visitForm.remarks.trim() || null,
    };

    if (!payload.student_id || !payload.visit_date || !payload.symptoms) {
      setMessage("Student, visit date and symptoms are required.");
      return;
    }

    try {
      if (editingId) {
        await API.put(`/health-infirmary/visits/${editingId}`, payload);
        setMessage("Health visit updated successfully.");
      } else {
        await API.post("/health-infirmary/visits/", payload);
        setMessage("Health visit added successfully.");
      }

      resetForm();
      await loadPageData();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save health visit."));
    }
  }

  function editVisit(visit) {
    setEditingId(visit.id);
    setPageMode("form");
    setVisitForm({
      student_id: visit.student_id || "",
      visit_date: visit.visit_date || emptyVisitForm.visit_date,
      visit_time: visit.visit_time || "",
      symptoms: visit.symptoms || "",
      diagnosis: visit.diagnosis || "",
      treatment: visit.treatment || "",
      medicine_given: visit.medicine_given || "",
      attended_by: visit.attended_by || "",
      referred_to_hospital: Boolean(visit.referred_to_hospital),
      follow_up_date: visit.follow_up_date || "",
      status: visit.status || "Open",
      remarks: visit.remarks || "",
    });
  }

  function addVisit() {
    setVisitForm(emptyVisitForm);
    setEditingId(null);
    setMessage("");
    setPageMode("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteVisit(visitId) {
    const confirmDelete = window.confirm("Delete this health visit record?");
    if (!confirmDelete) return;

    try {
      await API.delete(`/health-infirmary/visits/${visitId}`);
      setMessage("Health visit deleted successfully.");
      resetForm();
      await loadPageData();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete health visit."));
    }
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Student Health</p>
          <h2>Health Infirmary</h2>
          <p>
            Record student infirmary visits, medicine given, hospital referrals,
            and follow-up status.
          </p>
        </div>

        <div className="module-header-actions">
          <button type="button" className="secondary-button" onClick={loadPageData}>
            <RefreshCcw size={17} />
            Refresh
          </button>

          <button type="button" className="primary-button" onClick={addVisit}>
            <PlusCircle size={18} />
            Add Visit
          </button>
        </div>
      </section>

      <section className="summary-strip report-summary-grid">
        <SummaryCard icon={HeartPulse} label="Total Visits" value={visits.length} />
        <SummaryCard icon={Activity} label="Open Cases" value={openCases} />
        <SummaryCard icon={Hospital} label="Referred" value={referredCases} warning />
        <SummaryCard icon={RefreshCcw} label="Follow Ups" value={followUps} />
      </section>

      {message && <div className="message-box">{message}</div>}

      {pageMode === "form" && (
      <section className="form-panel">
        <div className="panel-header">
          <div>
            <h3>{editingId ? "Edit Health Visit" : "Add Health Visit"}</h3>
            <p>Keep a clean medical log for daily infirmary and residential care.</p>
          </div>
        </div>

        <form className="classic-form" onSubmit={saveVisit}>
          <div className="form-grid">
            <StudentPicker
              students={students}
              value={visitForm.student_id}
              onChange={handleChange}
            />

            <TextField
              label="Visit Date *"
              type="date"
              name="visit_date"
              value={visitForm.visit_date}
              onChange={handleChange}
              required
            />
            <TextField
              label="Visit Time"
              type="time"
              name="visit_time"
              value={visitForm.visit_time}
              onChange={handleChange}
            />
            <TextField
              label="Attended By"
              name="attended_by"
              value={visitForm.attended_by}
              onChange={handleChange}
              placeholder="Nurse / doctor name"
            />

            <div className="form-field full-width">
              <label>Symptoms *</label>
              <textarea
                name="symptoms"
                value={visitForm.symptoms}
                onChange={handleChange}
                rows="3"
                required
              ></textarea>
            </div>

            <div className="form-field full-width">
              <label>Diagnosis</label>
              <textarea
                name="diagnosis"
                value={visitForm.diagnosis}
                onChange={handleChange}
                rows="3"
              ></textarea>
            </div>

            <div className="form-field full-width">
              <label>Treatment</label>
              <textarea
                name="treatment"
                value={visitForm.treatment}
                onChange={handleChange}
                rows="3"
              ></textarea>
            </div>

            <TextField
              label="Medicine Given"
              name="medicine_given"
              value={visitForm.medicine_given}
              onChange={handleChange}
            />

            <TextField
              label="Follow-up Date"
              type="date"
              name="follow_up_date"
              value={visitForm.follow_up_date}
              onChange={handleChange}
            />

            <div className="form-field">
              <label>Status</label>
              <select name="status" value={visitForm.status} onChange={handleChange}>
                <option value="Open">Open</option>
                <option value="Under Observation">Under Observation</option>
                <option value="Recovered">Recovered</option>
                <option value="Referred">Referred</option>
                <option value="Closed">Closed</option>
              </select>
            </div>

            <div className="form-field">
              <label>Hospital Referral</label>
              <label className="switch-row">
                <input
                  type="checkbox"
                  name="referred_to_hospital"
                  checked={visitForm.referred_to_hospital}
                  onChange={handleChange}
                />
                <span>{visitForm.referred_to_hospital ? "Required" : "Not Required"}</span>
              </label>
            </div>

            <div className="form-field full-width">
              <label>Remarks</label>
              <textarea
                name="remarks"
                value={visitForm.remarks}
                onChange={handleChange}
                rows="3"
              ></textarea>
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="primary-button">
              <PlusCircle size={18} />
              {editingId ? "Update Visit" : "Add Visit"}
            </button>
            <button type="button" className="light-button" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </form>
      </section>
      )}

      {pageMode === "list" && (
      <section className="table-panel">
        <div className="table-toolbar">
          <div>
            <h3>Health Visit Records</h3>
            <p>{filteredVisits.length} record(s) found</p>
          </div>

          <div className="table-search">
            <Search size={17} />
            <input
              type="text"
              placeholder="Search student, symptom, medicine..."
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </div>
        </div>

        <div className="student-profile-tabs">
          {["", "Open", "Under Observation", "Recovered", "Referred", "Closed"].map(
            (status) => (
              <button
                key={status || "All"}
                type="button"
                className={statusFilter === status ? "active" : ""}
                onClick={() => setStatusFilter(status)}
              >
                {status || "All"}
              </button>
            )
          )}
        </div>

        {loading ? (
          <div className="loading-box">Loading health records...</div>
        ) : (
          <div className="table-wrapper">
            <table className="classic-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Visit Date</th>
                  <th>Symptoms</th>
                  <th>Medicine</th>
                  <th>Follow Up</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredVisits.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="empty-table">
                      No health visit records found.
                    </td>
                  </tr>
                ) : (
                  filteredVisits.map((visit) => (
                    <tr key={visit.id}>
                      <td>
                        {visit.admission_no
                          ? `${visit.admission_no} - ${visit.student_name}`
                          : visit.student_name}
                      </td>
                      <td>
                        {visit.class_name || "-"}
                        {visit.section ? `-${visit.section}` : ""}
                      </td>
                      <td>
                        {visit.visit_date || "-"}
                        {visit.visit_time ? ` ${visit.visit_time}` : ""}
                      </td>
                      <td>{visit.symptoms}</td>
                      <td>{visit.medicine_given || "-"}</td>
                      <td>{visit.follow_up_date || "-"}</td>
                      <td>
                        <span className={getStatusClass(visit)}>{visit.status}</span>
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button
                            type="button"
                            className="edit-button"
                            onClick={() => editVisit(visit)}
                            title="Edit"
                          >
                            <Edit size={15} />
                          </button>
                          <button
                            type="button"
                            className="delete-button"
                            onClick={() => deleteVisit(visit.id)}
                            title="Delete"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
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

function SummaryCard({ icon: Icon, label, value, warning = false }) {
  return (
    <div className={warning ? "summary-card warning" : "summary-card"}>
      <Icon size={22} />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
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

function getStatusClass(visit) {
  if (visit.referred_to_hospital || visit.status === "Referred") return "status danger";
  if (["Open", "Under Observation"].includes(visit.status)) return "status pending";
  return "status active";
}
