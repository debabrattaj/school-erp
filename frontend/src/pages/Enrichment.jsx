import { useEffect, useMemo, useState } from "react";
import { Award, CheckCircle, Edit, PlusCircle, RefreshCcw, Trash2, Users } from "lucide-react";

import API from "../api";
import EnhancedRecordsTable from "../components/EnhancedRecordsTable";

const emptyActivityForm = {
  activity_code: "",
  activity_name: "",
  activity_type: "Club",
  category: "",
  coordinator: "",
  start_date: "",
  end_date: "",
  venue: "",
  eligible_classes: "",
  capacity: "",
  enrolled_count: "0",
  fee_amount: "0",
  status: "Planned",
  description: "",
  remarks: "",
};

const activityTypes = ["Club", "Sport", "Competition", "Trip", "Service Learning", "CAS", "Workshop", "Event"];
const statuses = ["Planned", "Open", "Full", "Completed", "Cancelled"];

function getApiErrorMessage(error, fallbackMessage) {
  const detail = error.response?.data?.detail;
  if (Array.isArray(detail)) return detail.map((item) => `${Array.isArray(item.loc) ? item.loc.join(".") : "field"}: ${item.msg}`).join(" | ");
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") return detail.msg || JSON.stringify(detail);
  return fallbackMessage;
}

export default function Enrichment() {
  const [activities, setActivities] = useState([]);
  const [formData, setFormData] = useState(emptyActivityForm);
  const [editingId, setEditingId] = useState(null);
  const [pageMode, setPageMode] = useState("list");
  const [searchText, setSearchText] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadActivities() {
    try {
      setLoading(true);
      setMessage("");
      const response = await API.get("/enrichment/");
      setActivities(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load enrichment activities."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadActivities();
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  }

  function buildPayload() {
    return {
      activity_code: formData.activity_code.trim(),
      activity_name: formData.activity_name.trim(),
      activity_type: formData.activity_type,
      category: formData.category.trim() || null,
      coordinator: formData.coordinator.trim() || null,
      start_date: formData.start_date || null,
      end_date: formData.end_date || null,
      venue: formData.venue.trim() || null,
      eligible_classes: formData.eligible_classes.trim() || null,
      capacity: formData.capacity === "" ? null : Number(formData.capacity),
      enrolled_count: formData.enrolled_count === "" ? 0 : Number(formData.enrolled_count),
      fee_amount: formData.fee_amount === "" ? 0 : Number(formData.fee_amount),
      status: formData.status,
      description: formData.description.trim() || null,
      remarks: formData.remarks.trim() || null,
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    try {
      const payload = buildPayload();
      if (!payload.activity_name) {
        setMessage("Activity name is required.");
        return;
      }
      if (editingId) {
        await API.put(`/enrichment/${editingId}`, payload);
        setMessage("Activity updated successfully.");
      } else {
        await API.post("/enrichment/", payload);
        setMessage("Activity added successfully.");
      }
      setFormData(emptyActivityForm);
      setEditingId(null);
      setPageMode("list");
      await loadActivities();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save activity."));
    }
  }

  function handleAddActivity() {
    setEditingId(null);
    setFormData(emptyActivityForm);
    setMessage("");
    setPageMode("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEdit(activity) {
    setEditingId(activity.id);
    setFormData({
      activity_code: activity.activity_code || "",
      activity_name: activity.activity_name || "",
      activity_type: activity.activity_type || "Club",
      category: activity.category || "",
      coordinator: activity.coordinator || "",
      start_date: activity.start_date || "",
      end_date: activity.end_date || "",
      venue: activity.venue || "",
      eligible_classes: activity.eligible_classes || "",
      capacity: activity.capacity ?? "",
      enrolled_count: activity.enrolled_count ?? "0",
      fee_amount: activity.fee_amount ?? "0",
      status: activity.status || "Planned",
      description: activity.description || "",
      remarks: activity.remarks || "",
    });
    setPageMode("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(activityId) {
    if (!window.confirm("Are you sure you want to delete this activity?")) return;
    try {
      await API.delete(`/enrichment/${activityId}`);
      setMessage("Activity deleted successfully.");
      await loadActivities();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete activity."));
    }
  }

  function handleCancel() {
    setEditingId(null);
    setFormData(emptyActivityForm);
    setMessage("");
    setPageMode("list");
  }

  const filteredActivities = activities.filter((activity) => {
    const matchType = typeFilter ? activity.activity_type === typeFilter : true;
    const matchStatus = statusFilter ? activity.status === statusFilter : true;
    const fullText = `${activity.activity_code} ${activity.activity_name} ${activity.activity_type} ${activity.category} ${activity.coordinator} ${activity.venue} ${activity.eligible_classes} ${activity.status}`.toLowerCase();
    return matchType && matchStatus && fullText.includes(searchText.toLowerCase());
  });

  const openCount = useMemo(() => activities.filter((activity) => ["Planned", "Open"].includes(activity.status)).length, [activities]);
  const completedCount = useMemo(() => activities.filter((activity) => activity.status === "Completed").length, [activities]);
  const participantCount = useMemo(() => activities.reduce((total, activity) => total + Number(activity.enrolled_count || 0), 0), [activities]);

  const form = (
    <section className="form-panel">
      <div className="panel-header"><div><h3>{editingId ? "Edit Activity" : "Add Activity"}</h3><p>Manage clubs, competitions, trips, CAS, service learning, and enrichment events.</p></div></div>
      <form className="classic-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-field"><label>Activity Code</label><input name="activity_code" value={formData.activity_code} onChange={handleChange} placeholder="Auto generated if blank" /></div>
          <div className="form-field"><label>Activity Name *</label><input name="activity_name" value={formData.activity_name} onChange={handleChange} required /></div>
          <div className="form-field"><label>Type</label><select name="activity_type" value={formData.activity_type} onChange={handleChange}>{activityTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></div>
          <div className="form-field"><label>Category</label><input name="category" value={formData.category} onChange={handleChange} placeholder="Arts, STEM, MUN..." /></div>
          <div className="form-field"><label>Coordinator</label><input name="coordinator" value={formData.coordinator} onChange={handleChange} /></div>
          <div className="form-field"><label>Venue</label><input name="venue" value={formData.venue} onChange={handleChange} /></div>
          <div className="form-field"><label>Start Date</label><input type="date" name="start_date" value={formData.start_date} onChange={handleChange} /></div>
          <div className="form-field"><label>End Date</label><input type="date" name="end_date" value={formData.end_date} onChange={handleChange} /></div>
          <div className="form-field"><label>Eligible Classes</label><input name="eligible_classes" value={formData.eligible_classes} onChange={handleChange} placeholder="Grade 6-10" /></div>
          <div className="form-field"><label>Capacity</label><input type="number" name="capacity" value={formData.capacity} onChange={handleChange} /></div>
          <div className="form-field"><label>Enrolled Count</label><input type="number" name="enrolled_count" value={formData.enrolled_count} onChange={handleChange} /></div>
          <div className="form-field"><label>Fee Amount</label><input type="number" name="fee_amount" value={formData.fee_amount} onChange={handleChange} /></div>
          <div className="form-field"><label>Status</label><select name="status" value={formData.status} onChange={handleChange}>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
          <div className="form-field span-2"><label>Description</label><textarea name="description" value={formData.description} onChange={handleChange} rows="3" /></div>
          <div className="form-field span-2"><label>Remarks</label><textarea name="remarks" value={formData.remarks} onChange={handleChange} rows="3" /></div>
        </div>
        <div className="form-actions"><button type="submit" className="primary-button"><PlusCircle size={18} />{editingId ? "Update Activity" : "Add Activity"}</button><button type="button" className="light-button" onClick={handleCancel}>Cancel</button></div>
      </form>
    </section>
  );

  if (pageMode === "form") {
    return <div className="management-page"><section className="page-heading"><div><p className="eyebrow">Student Life</p><h2>{editingId ? "Edit Activity" : "Add Activity"}</h2><p>Plan enrichment programs, trips, clubs, competitions, and service learning.</p></div><button type="button" className="light-button" onClick={handleCancel}>Back to Activities</button></section>{message && <div className="message-box">{message}</div>}{form}</div>;
  }

  return (
    <div className="management-page">
      <section className="page-heading"><div><p className="eyebrow">Student Life</p><h2>Activities & Enrichment</h2><p>Manage clubs, sports, competitions, trips, CAS, and service learning.</p></div><div className="module-header-actions"><button type="button" className="secondary-button" onClick={loadActivities}><RefreshCcw size={17} />Refresh</button><button type="button" className="primary-button" onClick={handleAddActivity}><PlusCircle size={18} />Add Activity</button></div></section>
      <section className="summary-strip report-summary-grid"><div className="summary-card"><Award size={22} /><div><span>Total Activities</span><strong>{activities.length}</strong></div></div><div className="summary-card warning"><Award size={22} /><div><span>Open / Planned</span><strong>{openCount}</strong></div></div><div className="summary-card"><CheckCircle size={22} /><div><span>Completed</span><strong>{completedCount}</strong></div></div><div className="summary-card"><Users size={22} /><div><span>Participants</span><strong>{participantCount}</strong></div></div></section>
      {message && <div className="message-box">{message}</div>}
      <section className="table-panel module-filter-panel"><div className="filter-row sis-filter-row"><div className="form-field"><label>Type</label><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="">All Types</option>{activityTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></div><div className="form-field"><label>Status</label><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All Status</option>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></div><button type="button" className="light-button" onClick={() => { setSearchText(""); setTypeFilter(""); setStatusFilter(""); }}>Clear Filters</button></div></section>
      <EnhancedRecordsTable
        data={filteredActivities}
        emptyText="No enrichment activities found."
        loading={loading}
        loadingText="Loading enrichment activities..."
        searchPlaceholder="Search activity, type, coordinator, venue..."
        searchText={searchText}
        setSearchText={setSearchText}
        columns={[
          { key: "activity_code", label: "Code", render: (activity) => activity.activity_code || "-" },
          { key: "activity_name", label: "Activity", render: (activity) => activity.activity_name || "-" },
          { key: "activity_type", label: "Type", render: (activity) => activity.activity_type || "-" },
          { key: "category", label: "Category", render: (activity) => activity.category || "-" },
          { key: "coordinator", label: "Coordinator", render: (activity) => activity.coordinator || "-" },
          { key: "start_date", label: "Start", render: (activity) => activity.start_date || "-" },
          { key: "eligible_classes", label: "Classes", render: (activity) => activity.eligible_classes || "-" },
          { key: "enrolled_count", label: "Enrolled", render: (activity) => activity.enrolled_count ?? 0 },
          { key: "status", label: "Status", render: (activity) => <span className={activity.status === "Cancelled" ? "status danger" : "status active"}>{activity.status || "Planned"}</span>, value: (activity) => activity.status || "Planned" },
          { key: "actions", label: "Actions", hideable: false, actions: false, render: (activity) => <div className="action-buttons"><button type="button" className="edit-button" onClick={() => handleEdit(activity)} title="Edit"><Edit size={15} /></button><button type="button" className="delete-button" onClick={() => handleDelete(activity.id)} title="Delete"><Trash2 size={15} /></button></div>, value: () => "" },
        ]}
      />
    </div>
  );
}
