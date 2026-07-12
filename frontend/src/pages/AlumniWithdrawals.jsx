import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowLeft,
  CheckCircle,
  Edit,
  FileText,
  PlusCircle,
  Trash2,
  UserRoundCheck,
} from "lucide-react";

import API from "../api";
import EnhancedRecordsTable from "../components/EnhancedRecordsTable";

const emptyRecordForm = {
  record_no: "",
  student_id: "",
  student_name: "",
  admission_no: "",
  last_class: "",
  record_type: "Withdrawal",
  request_date: "",
  leaving_date: "",
  reason: "",
  destination_school: "",
  destination_country: "",
  certificate_status: "Pending",
  alumni_email: "",
  alumni_phone: "",
  current_status: "Pending",
  approved_by: "",
  approval_date: "",
  remarks: "",
};

const recordTypes = ["Withdrawal", "Transfer", "Alumni"];
const certificateStatuses = ["Pending", "In Progress", "Issued", "Rejected", "Not Required"];
const currentStatuses = ["Pending", "Approved", "Completed", "Rejected", "Archived"];
const reasons = ["Parent Transfer", "Relocation", "Completed Schooling", "Financial", "Medical", "Disciplinary", "Other"];

function getApiErrorMessage(error, fallbackMessage) {
  const detail = error.response?.data?.detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => `${Array.isArray(item.loc) ? item.loc.join(".") : "field"}: ${item.msg}`).join(" | ");
  }
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") return detail.msg || JSON.stringify(detail);
  return fallbackMessage;
}

function getStudentLabel(student) {
  const fullName = `${student.first_name || ""} ${student.last_name || ""}`.trim();
  const classText = [student.class_name, student.section].filter(Boolean).join(" ");
  return `${student.admission_no || "No admission"} - ${fullName || "Unnamed student"}${classText ? ` (${classText})` : ""}`;
}

export default function AlumniWithdrawals() {
  const [records, setRecords] = useState([]);
  const [students, setStudents] = useState([]);
  const [formData, setFormData] = useState(emptyRecordForm);
  const [editingId, setEditingId] = useState(null);
  const [pageMode, setPageMode] = useState("list");
  const [searchText, setSearchText] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [certificateFilter, setCertificateFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return undefined;

    const timeoutId = window.setTimeout(() => {
      setMessage("");
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  async function loadRecords() {
    try {
      setLoading(true);
      setMessage("");
      const response = await API.get("/alumni-withdrawals/");
      setRecords(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load alumni and withdrawal records."));
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
    loadRecords();
    loadStudents();
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  }

  function handleStudentSelect(event) {
    const studentId = event.target.value;
    const student = students.find((item) => String(item.id) === studentId);
    setFormData((current) => ({
      ...current,
      student_id: studentId,
      student_name: student ? `${student.first_name || ""} ${student.last_name || ""}`.trim() : current.student_name,
      admission_no: student?.admission_no || current.admission_no,
      last_class: student ? [student.class_name, student.section].filter(Boolean).join(" ") : current.last_class,
      alumni_email: student?.guardian_email || current.alumni_email,
      alumni_phone: student?.guardian_phone || current.alumni_phone,
    }));
  }

  function buildPayload() {
    return {
      record_no: formData.record_no.trim(),
      student_id: formData.student_id ? Number(formData.student_id) : null,
      student_name: formData.student_name.trim(),
      admission_no: formData.admission_no.trim() || null,
      last_class: formData.last_class.trim() || null,
      record_type: formData.record_type,
      request_date: formData.request_date || null,
      leaving_date: formData.leaving_date || null,
      reason: formData.reason,
      destination_school: formData.destination_school.trim() || null,
      destination_country: formData.destination_country.trim() || null,
      certificate_status: formData.certificate_status,
      alumni_email: formData.alumni_email.trim() || null,
      alumni_phone: formData.alumni_phone.trim() || null,
      current_status: formData.current_status,
      approved_by: formData.approved_by.trim() || null,
      approval_date: formData.approval_date || null,
      remarks: formData.remarks.trim() || null,
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    try {
      const payload = buildPayload();
      if (!payload.student_name || !payload.reason) {
        setMessage("Student name and reason are required.");
        return;
      }

      if (editingId) {
        await API.put(`/alumni-withdrawals/${editingId}`, payload);
        setMessage("Alumni withdrawal record updated successfully.");
      } else {
        await API.post("/alumni-withdrawals/", payload);
        setMessage("Alumni withdrawal record added successfully.");
      }

      setFormData(emptyRecordForm);
      setEditingId(null);
      setPageMode("list");
      await loadRecords();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save alumni withdrawal record."));
    }
  }

  function handleAddRecord() {
    setEditingId(null);
    setFormData(emptyRecordForm);
    setMessage("");
    setPageMode("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEdit(record) {
    setEditingId(record.id);
    setFormData({
      record_no: record.record_no || "",
      student_id: record.student_id ? String(record.student_id) : "",
      student_name: record.student_name || "",
      admission_no: record.admission_no || "",
      last_class: record.last_class || "",
      record_type: record.record_type || "Withdrawal",
      request_date: record.request_date || "",
      leaving_date: record.leaving_date || "",
      reason: record.reason || "",
      destination_school: record.destination_school || "",
      destination_country: record.destination_country || "",
      certificate_status: record.certificate_status || "Pending",
      alumni_email: record.alumni_email || "",
      alumni_phone: record.alumni_phone || "",
      current_status: record.current_status || "Pending",
      approved_by: record.approved_by || "",
      approval_date: record.approval_date || "",
      remarks: record.remarks || "",
    });
    setPageMode("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(recordId) {
    if (!window.confirm("Are you sure you want to delete this alumni withdrawal record?")) return;

    try {
      await API.delete(`/alumni-withdrawals/${recordId}`);
      setMessage("Alumni withdrawal record deleted successfully.");
      await loadRecords();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete alumni withdrawal record."));
    }
  }

  function handleCancel() {
    setEditingId(null);
    setFormData(emptyRecordForm);
    setMessage("");
    setPageMode("list");
  }

  const filteredRecords = records.filter((record) => {
    const matchType = typeFilter ? record.record_type === typeFilter : true;
    const matchStatus = statusFilter ? record.current_status === statusFilter : true;
    const matchCertificate = certificateFilter ? record.certificate_status === certificateFilter : true;
    const fullText = `${record.record_no} ${record.student_name} ${record.admission_no} ${record.last_class} ${record.reason} ${record.destination_school} ${record.destination_country} ${record.current_status}`.toLowerCase();
    return matchType && matchStatus && matchCertificate && fullText.includes(searchText.toLowerCase());
  });

  const pendingCount = useMemo(() => records.filter((record) => record.current_status === "Pending").length, [records]);
  const alumniCount = useMemo(() => records.filter((record) => record.record_type === "Alumni").length, [records]);
  const certificatePendingCount = useMemo(() => records.filter((record) => ["Pending", "In Progress"].includes(record.certificate_status)).length, [records]);

  const form = (
    <section className="form-panel">
      <div className="panel-header">
        <div>
          <h3>{editingId ? "Edit Alumni / Withdrawal Record" : "Add Alumni / Withdrawal Record"}</h3>
          <p>Manage transfers, leaving certificates, exit reasons, and alumni contact records.</p>
        </div>
      </div>
      <form className="classic-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-field"><label>Record No</label><input name="record_no" value={formData.record_no} onChange={handleChange} placeholder="Auto generated if blank" /></div>
          <div className="form-field"><label>Student</label><select name="student_id" value={formData.student_id} onChange={handleStudentSelect}><option value="">No linked student</option>{students.map((student) => <option key={student.id} value={student.id}>{getStudentLabel(student)}</option>)}</select></div>
          <div className="form-field"><label>Student Name *</label><input name="student_name" value={formData.student_name} onChange={handleChange} required /></div>
          <div className="form-field"><label>Admission No</label><input name="admission_no" value={formData.admission_no} onChange={handleChange} /></div>
          <div className="form-field"><label>Last Class</label><input name="last_class" value={formData.last_class} onChange={handleChange} /></div>
          <div className="form-field"><label>Record Type</label><select name="record_type" value={formData.record_type} onChange={handleChange}>{recordTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></div>
          <div className="form-field"><label>Request Date</label><input type="date" name="request_date" value={formData.request_date} onChange={handleChange} /></div>
          <div className="form-field"><label>Leaving Date</label><input type="date" name="leaving_date" value={formData.leaving_date} onChange={handleChange} /></div>
          <div className="form-field"><label>Reason *</label><select name="reason" value={formData.reason} onChange={handleChange} required><option value="">Select Reason</option>{reasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}</select></div>
          <div className="form-field"><label>Destination School</label><input name="destination_school" value={formData.destination_school} onChange={handleChange} /></div>
          <div className="form-field"><label>Destination Country</label><input name="destination_country" value={formData.destination_country} onChange={handleChange} /></div>
          <div className="form-field"><label>Certificate Status</label><select name="certificate_status" value={formData.certificate_status} onChange={handleChange}>{certificateStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
          <div className="form-field"><label>Current Status</label><select name="current_status" value={formData.current_status} onChange={handleChange}>{currentStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
          <div className="form-field"><label>Approved By</label><input name="approved_by" value={formData.approved_by} onChange={handleChange} /></div>
          <div className="form-field"><label>Approval Date</label><input type="date" name="approval_date" value={formData.approval_date} onChange={handleChange} /></div>
          <div className="form-field"><label>Alumni Phone</label><input name="alumni_phone" value={formData.alumni_phone} onChange={handleChange} /></div>
          <div className="form-field"><label>Alumni Email</label><input type="email" name="alumni_email" value={formData.alumni_email} onChange={handleChange} /></div>
          <div className="form-field span-2"><label>Remarks</label><textarea name="remarks" value={formData.remarks} onChange={handleChange} rows="3" /></div>
        </div>
        <div className="form-actions">
          <button type="submit" className="primary-button"><PlusCircle size={18} />{editingId ? "Update Record" : "Add Record"}</button>
          <button type="button" className="light-button" onClick={handleCancel}>Cancel</button>
        </div>
      </form>
    </section>
  );

  if (pageMode === "form") {
    return (
      <div className="management-page">
        <section className="page-heading">
          <div><p className="eyebrow">Student Lifecycle</p><h2>{editingId ? "Edit Alumni / Withdrawal" : "Add Alumni / Withdrawal"}</h2><p>Track transfers, leaving certificates, alumni contacts, and exit approvals.</p></div>
          <button type="button" className="light-button" onClick={handleCancel}><ArrowLeft size={17} />Back</button>
        </section>
        {message && <div className="toast-notification">{message}</div>}
        {form}
      </div>
    );
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div><p className="eyebrow">Student Lifecycle</p><h2>Alumni & Withdrawals</h2><p>Manage withdrawals, transfers, leaving certificates, and alumni contact records.</p></div>
        <div className="module-header-actions"><button type="button" className="primary-button" onClick={handleAddRecord}><PlusCircle size={18} />Add Record</button></div>
      </section>
      <section className="summary-strip report-summary-grid">
        <div className="summary-card"><Archive size={22} /><div><span>Total Records</span><strong>{records.length}</strong></div></div>
        <div className="summary-card warning"><FileText size={22} /><div><span>Pending</span><strong>{pendingCount}</strong></div></div>
        <div className="summary-card"><UserRoundCheck size={22} /><div><span>Alumni</span><strong>{alumniCount}</strong></div></div>
        <div className="summary-card warning"><CheckCircle size={22} /><div><span>Certificates Due</span><strong>{certificatePendingCount}</strong></div></div>
      </section>
      {message && <div className="toast-notification">{message}</div>}
      <section className="table-panel module-filter-panel">
        <div className="filter-row sis-filter-row">
          <div className="form-field"><label>Type</label><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="">All Types</option>{recordTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></div>
          <div className="form-field"><label>Status</label><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All Status</option>{currentStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
          <div className="form-field"><label>Certificate</label><select value={certificateFilter} onChange={(event) => setCertificateFilter(event.target.value)}><option value="">All Certificate Status</option>{certificateStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
          <button type="button" className="light-button" onClick={() => { setSearchText(""); setTypeFilter(""); setStatusFilter(""); setCertificateFilter(""); }}>Clear Filters</button>
        </div>
      </section>
      <EnhancedRecordsTable
        data={filteredRecords}
        emptyText="No alumni or withdrawal records found."
        loading={loading}
        loadingText="Loading records..."
        searchPlaceholder="Search student, record no, destination, status..."
        searchText={searchText}
        setSearchText={setSearchText}
        columns={[
          { key: "record_no", label: "Record No", render: (record) => record.record_no || "-" },
          { key: "student_name", label: "Student", render: (record) => record.student_name || "-" },
          { key: "admission_no", label: "Admission No", render: (record) => record.admission_no || "-" },
          { key: "last_class", label: "Last Class", render: (record) => record.last_class || "-" },
          { key: "record_type", label: "Type", render: (record) => record.record_type || "-" },
          { key: "leaving_date", label: "Leaving Date", render: (record) => record.leaving_date || "-" },
          { key: "reason", label: "Reason", render: (record) => record.reason || "-" },
          { key: "certificate_status", label: "Certificate", render: (record) => record.certificate_status || "-" },
          { key: "current_status", label: "Status", render: (record) => <span className={record.current_status === "Rejected" ? "status danger" : "status active"}>{record.current_status || "Pending"}</span>, value: (record) => record.current_status || "Pending" },
          { key: "actions", label: "Actions", hideable: false, actions: false, render: (record) => <div className="action-buttons"><button type="button" className="edit-button" onClick={() => handleEdit(record)} title="Edit"><Edit size={15} /></button><button type="button" className="delete-button" onClick={() => handleDelete(record.id)} title="Delete"><Trash2 size={15} /></button></div>, value: () => "" },
        ]}
      />
    </div>
  );
}
