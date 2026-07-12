import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Edit,
  LifeBuoy,
  PlusCircle,
  Trash2,
} from "lucide-react";

import API from "../api";
import EnhancedRecordsTable from "../components/EnhancedRecordsTable";

const emptyTicketForm = {
  ticket_no: "",
  student_id: "",
  requester_name: "",
  requester_role: "Parent",
  contact_phone: "",
  contact_email: "",
  category: "General Request",
  priority: "Medium",
  subject: "",
  description: "",
  assigned_to: "",
  due_date: "",
  status: "Open",
  resolution: "",
  closed_date: "",
  remarks: "",
};

const requesterRoles = ["Parent", "Student", "Guardian", "Staff", "Other"];
const categories = [
  "General Request",
  "Counseling",
  "Documents",
  "Transport",
  "Hostel",
  "Fees",
  "Academics",
  "Facilities",
  "Complaint",
];
const priorities = ["Low", "Medium", "High", "Urgent"];
const statuses = ["Open", "In Progress", "Waiting", "Resolved", "Closed"];

function getApiErrorMessage(error, fallbackMessage) {
  const detail = error.response?.data?.detail;

  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        const field = Array.isArray(item.loc) ? item.loc.join(".") : "field";
        return `${field}: ${item.msg}`;
      })
      .join(" | ");
  }

  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") return detail.msg || JSON.stringify(detail);

  return fallbackMessage;
}

function getStudentLabel(student) {
  const fullName = `${student.first_name || ""} ${student.last_name || ""}`.trim();
  const classText = [student.class_name, student.section].filter(Boolean).join(" ");
  return `${student.admission_no || "No admission"} - ${fullName || "Unnamed student"}${
    classText ? ` (${classText})` : ""
  }`;
}

export default function StudentServices() {
  const [tickets, setTickets] = useState([]);
  const [students, setStudents] = useState([]);
  const [formData, setFormData] = useState(emptyTicketForm);
  const [editingId, setEditingId] = useState(null);
  const [pageMode, setPageMode] = useState("list");
  const [searchText, setSearchText] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return undefined;

    const timeoutId = window.setTimeout(() => {
      setMessage("");
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  async function loadTickets() {
    try {
      setLoading(true);
      setMessage("");
      const response = await API.get("/student-services/");
      setTickets(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load service tickets."));
    } finally {
      setLoading(false);
    }
  }

  async function loadStudents() {
    try {
      const response = await API.get("/students/");
      setStudents(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load students."));
    }
  }

  useEffect(() => {
    loadTickets();
    loadStudents();
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  }

  function buildPayload() {
    return {
      ticket_no: formData.ticket_no.trim(),
      student_id: formData.student_id ? Number(formData.student_id) : null,
      requester_name: formData.requester_name.trim(),
      requester_role: formData.requester_role || "Parent",
      contact_phone: formData.contact_phone.trim() || null,
      contact_email: formData.contact_email.trim() || null,
      category: formData.category,
      priority: formData.priority || "Medium",
      subject: formData.subject.trim(),
      description: formData.description.trim(),
      assigned_to: formData.assigned_to.trim() || null,
      due_date: formData.due_date || null,
      status: formData.status || "Open",
      resolution: formData.resolution.trim() || null,
      closed_date: formData.closed_date || null,
      remarks: formData.remarks.trim() || null,
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    try {
      const payload = buildPayload();

      if (!payload.requester_name || !payload.subject || !payload.description) {
        setMessage("Requester name, subject, and description are required.");
        return;
      }

      if (editingId) {
        await API.put(`/student-services/${editingId}`, payload);
        setMessage("Service ticket updated successfully.");
      } else {
        await API.post("/student-services/", payload);
        setMessage("Service ticket added successfully.");
      }

      setFormData(emptyTicketForm);
      setEditingId(null);
      setPageMode("list");
      await loadTickets();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save service ticket."));
    }
  }

  function handleAddTicket() {
    setEditingId(null);
    setFormData(emptyTicketForm);
    setMessage("");
    setPageMode("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEdit(ticket) {
    setEditingId(ticket.id);
    setFormData({
      ticket_no: ticket.ticket_no || "",
      student_id: ticket.student_id ? String(ticket.student_id) : "",
      requester_name: ticket.requester_name || "",
      requester_role: ticket.requester_role || "Parent",
      contact_phone: ticket.contact_phone || "",
      contact_email: ticket.contact_email || "",
      category: ticket.category || "General Request",
      priority: ticket.priority || "Medium",
      subject: ticket.subject || "",
      description: ticket.description || "",
      assigned_to: ticket.assigned_to || "",
      due_date: ticket.due_date || "",
      status: ticket.status || "Open",
      resolution: ticket.resolution || "",
      closed_date: ticket.closed_date || "",
      remarks: ticket.remarks || "",
    });
    setMessage("");
    setPageMode("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(ticketId) {
    if (!window.confirm("Are you sure you want to delete this service ticket?")) {
      return;
    }

    try {
      await API.delete(`/student-services/${ticketId}`);
      setMessage("Service ticket deleted successfully.");
      await loadTickets();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete service ticket."));
    }
  }

  function handleCancel() {
    setEditingId(null);
    setFormData(emptyTicketForm);
    setMessage("");
    setPageMode("list");
  }

  const filteredTickets = tickets.filter((ticket) => {
    const matchCategory = categoryFilter ? ticket.category === categoryFilter : true;
    const matchStatus = statusFilter ? ticket.status === statusFilter : true;
    const matchPriority = priorityFilter ? ticket.priority === priorityFilter : true;
    const fullText = `
      ${ticket.ticket_no}
      ${ticket.student_name}
      ${ticket.admission_no}
      ${ticket.requester_name}
      ${ticket.requester_role}
      ${ticket.category}
      ${ticket.priority}
      ${ticket.subject}
      ${ticket.assigned_to}
      ${ticket.status}
    `.toLowerCase();

    return matchCategory && matchStatus && matchPriority && fullText.includes(searchText.toLowerCase());
  });

  const openCount = useMemo(
    () => tickets.filter((ticket) => ["Open", "In Progress", "Waiting"].includes(ticket.status)).length,
    [tickets]
  );
  const urgentCount = useMemo(
    () => tickets.filter((ticket) => ticket.priority === "Urgent").length,
    [tickets]
  );
  const resolvedCount = useMemo(
    () => tickets.filter((ticket) => ["Resolved", "Closed"].includes(ticket.status)).length,
    [tickets]
  );

  const ticketForm = (
    <section className="form-panel">
      <div className="panel-header">
        <div>
          <h3>{editingId ? "Edit Service Ticket" : "Add Service Ticket"}</h3>
          <p>Track parent and student requests, complaints, counseling cases, and assignments.</p>
        </div>
      </div>

      <form className="classic-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-field">
            <label>Ticket No</label>
            <input name="ticket_no" value={formData.ticket_no} onChange={handleChange} placeholder="Auto generated if blank" />
          </div>
          <div className="form-field">
            <label>Student</label>
            <select name="student_id" value={formData.student_id} onChange={handleChange}>
              <option value="">No student linked</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>{getStudentLabel(student)}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Requester Name *</label>
            <input name="requester_name" value={formData.requester_name} onChange={handleChange} required />
          </div>
          <div className="form-field">
            <label>Requester Role</label>
            <select name="requester_role" value={formData.requester_role} onChange={handleChange}>
              {requesterRoles.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label>Contact Phone</label>
            <input name="contact_phone" value={formData.contact_phone} onChange={handleChange} />
          </div>
          <div className="form-field">
            <label>Contact Email</label>
            <input type="email" name="contact_email" value={formData.contact_email} onChange={handleChange} />
          </div>
          <div className="form-field">
            <label>Category</label>
            <select name="category" value={formData.category} onChange={handleChange}>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label>Priority</label>
            <select name="priority" value={formData.priority} onChange={handleChange}>
              {priorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label>Assigned To</label>
            <input name="assigned_to" value={formData.assigned_to} onChange={handleChange} placeholder="Staff owner" />
          </div>
          <div className="form-field">
            <label>Due Date</label>
            <input type="date" name="due_date" value={formData.due_date} onChange={handleChange} />
          </div>
          <div className="form-field">
            <label>Status</label>
            <select name="status" value={formData.status} onChange={handleChange}>
              {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label>Closed Date</label>
            <input type="date" name="closed_date" value={formData.closed_date} onChange={handleChange} />
          </div>
          <div className="form-field span-2">
            <label>Subject *</label>
            <input name="subject" value={formData.subject} onChange={handleChange} required />
          </div>
          <div className="form-field span-2">
            <label>Description *</label>
            <textarea name="description" value={formData.description} onChange={handleChange} rows="4" required />
          </div>
          <div className="form-field span-2">
            <label>Resolution</label>
            <textarea name="resolution" value={formData.resolution} onChange={handleChange} rows="3" />
          </div>
          <div className="form-field span-2">
            <label>Remarks</label>
            <textarea name="remarks" value={formData.remarks} onChange={handleChange} rows="3" />
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" className="primary-button"><PlusCircle size={18} />{editingId ? "Update Ticket" : "Add Ticket"}</button>
          <button type="button" className="light-button" onClick={handleCancel}>Cancel</button>
        </div>
      </form>
    </section>
  );

  if (pageMode === "form") {
    return (
      <div className="management-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Student Services</p>
            <h2>{editingId ? "Edit Service Ticket" : "Add Service Ticket"}</h2>
            <p>Manage requests, complaints, counseling cases, and service follow-up.</p>
          </div>
          <button type="button" className="light-button" onClick={handleCancel}><ArrowLeft size={17} />Back</button>
        </section>
        {message && <div className="toast-notification">{message}</div>}
        {ticketForm}
      </div>
    );
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Student Services</p>
          <h2>Support Tickets</h2>
          <p>Track student and parent requests, complaints, counseling cases, and escalations.</p>
        </div>
        <div className="module-header-actions">
          
          <button type="button" className="primary-button" onClick={handleAddTicket}><PlusCircle size={18} />Add Ticket</button>
        </div>
      </section>

      <section className="summary-strip report-summary-grid">
        <div className="summary-card"><LifeBuoy size={22} /><div><span>Total Tickets</span><strong>{tickets.length}</strong></div></div>
        <div className="summary-card"><AlertTriangle size={22} /><div><span>Open Work</span><strong>{openCount}</strong></div></div>
        <div className="summary-card warning"><AlertTriangle size={22} /><div><span>Urgent</span><strong>{urgentCount}</strong></div></div>
        <div className="summary-card"><CheckCircle size={22} /><div><span>Resolved</span><strong>{resolvedCount}</strong></div></div>
      </section>

      {message && <div className="toast-notification">{message}</div>}

      <section className="table-panel module-filter-panel">
        <div className="filter-row sis-filter-row">
          <div className="form-field">
            <label>Category</label>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="">All Categories</option>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label>Status</label>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All Status</option>
              {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label>Priority</label>
            <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
              <option value="">All Priorities</option>
              {priorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
            </select>
          </div>
          <button type="button" className="light-button" onClick={() => { setSearchText(""); setCategoryFilter(""); setStatusFilter(""); setPriorityFilter(""); }}>Clear Filters</button>
        </div>
      </section>

      <EnhancedRecordsTable
        data={filteredTickets}
        emptyText="No service tickets found."
        loading={loading}
        loadingText="Loading service tickets..."
        searchPlaceholder="Search ticket, student, requester, subject..."
        searchText={searchText}
        setSearchText={setSearchText}
        columns={[
          { key: "ticket_no", label: "Ticket No", render: (ticket) => ticket.ticket_no || "-" },
          { key: "student_name", label: "Student", render: (ticket) => ticket.student_name || "-" },
          { key: "requester_name", label: "Requester", render: (ticket) => ticket.requester_name || "-" },
          { key: "category", label: "Category", render: (ticket) => ticket.category || "-" },
          { key: "priority", label: "Priority", render: (ticket) => ticket.priority || "-" },
          { key: "subject", label: "Subject", render: (ticket) => ticket.subject || "-" },
          { key: "assigned_to", label: "Assigned To", render: (ticket) => ticket.assigned_to || "-" },
          { key: "due_date", label: "Due Date", render: (ticket) => ticket.due_date || "-" },
          {
            key: "status",
            label: "Status",
            render: (ticket) => <span className={["Open", "In Progress", "Waiting"].includes(ticket.status) ? "status active" : "status danger"}>{ticket.status || "Open"}</span>,
            value: (ticket) => ticket.status || "Open",
          },
          {
            key: "actions",
            label: "Actions",
            hideable: false,
            actions: false,
            render: (ticket) => (
              <div className="action-buttons">
                <button type="button" className="edit-button" onClick={() => handleEdit(ticket)} title="Edit"><Edit size={15} /></button>
                <button type="button" className="delete-button" onClick={() => handleDelete(ticket.id)} title="Delete"><Trash2 size={15} /></button>
              </div>
            ),
            value: () => "",
          },
        ]}
      />
    </div>
  );
}
