import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  Edit,
  FileCheck,
  PlusCircle,
  Trash2,
} from "lucide-react";

import API from "../api";
import EnhancedRecordsTable from "../components/EnhancedRecordsTable";
import FileUploadField from "../components/FileUploadField";

const emptyDocumentForm = {
  student_id: "",
  document_type: "Passport",
  document_no: "",
  issue_date: "",
  expiry_date: "",
  issuing_country: "",
  status: "Pending",
  file_url: "",
  verified_by: "",
  verified_date: "",
  remarks: "",
};

const documentTypes = [
  "Passport",
  "Visa",
  "Residence Permit",
  "OCI / PIO",
  "Birth Certificate",
  "Transfer Certificate",
  "Immunization Record",
  "Previous Report Card",
  "Equivalence Certificate",
  "Other",
];

const statusOptions = [
  "Pending",
  "Submitted",
  "Verified",
  "Rejected",
  "Expired",
];

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

function isExpiringSoon(expiryDate) {
  if (!expiryDate) return false;
  const today = new Date();
  const expiry = new Date(`${expiryDate}T00:00:00`);
  const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= 60;
}

export default function InternationalDocuments() {
  const [documents, setDocuments] = useState([]);
  const [students, setStudents] = useState([]);
  const [formData, setFormData] = useState(emptyDocumentForm);
  const [editingId, setEditingId] = useState(null);
  const [pageMode, setPageMode] = useState("list");
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return undefined;

    const timeoutId = window.setTimeout(() => {
      setMessage("");
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  async function loadDocuments() {
    try {
      setLoading(true);
      setMessage("");
      const response = await API.get("/international-documents/");
      setDocuments(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load international documents."));
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
    loadDocuments();
    loadStudents();
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  }

  function buildPayload() {
    return {
      student_id: Number(formData.student_id),
      document_type: formData.document_type,
      document_no: formData.document_no.trim() || null,
      issue_date: formData.issue_date || null,
      expiry_date: formData.expiry_date || null,
      issuing_country: formData.issuing_country.trim() || null,
      status: formData.status || "Pending",
      file_url: formData.file_url.trim() || null,
      verified_by: formData.verified_by.trim() || null,
      verified_date: formData.verified_date || null,
      remarks: formData.remarks.trim() || null,
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    try {
      const payload = buildPayload();

      if (!payload.student_id) {
        setMessage("Student is required.");
        return;
      }

      if (!payload.document_type) {
        setMessage("Document type is required.");
        return;
      }

      if (editingId) {
        await API.put(`/international-documents/${editingId}`, payload);
        setMessage("International document updated successfully.");
      } else {
        await API.post("/international-documents/", payload);
        setMessage("International document added successfully.");
      }

      setFormData(emptyDocumentForm);
      setEditingId(null);
      setPageMode("list");
      await loadDocuments();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save international document."));
    }
  }

  function handleAddDocument() {
    setEditingId(null);
    setFormData(emptyDocumentForm);
    setMessage("");
    setPageMode("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEdit(document) {
    setEditingId(document.id);
    setFormData({
      student_id: document.student_id ? String(document.student_id) : "",
      document_type: document.document_type || "Passport",
      document_no: document.document_no || "",
      issue_date: document.issue_date || "",
      expiry_date: document.expiry_date || "",
      issuing_country: document.issuing_country || "",
      status: document.status || "Pending",
      file_url: document.file_url || "",
      verified_by: document.verified_by || "",
      verified_date: document.verified_date || "",
      remarks: document.remarks || "",
    });
    setMessage("");
    setPageMode("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(documentId) {
    if (!window.confirm("Are you sure you want to delete this document record?")) {
      return;
    }

    try {
      await API.delete(`/international-documents/${documentId}`);
      setMessage("International document deleted successfully.");
      await loadDocuments();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete international document."));
    }
  }

  function handleCancel() {
    setEditingId(null);
    setFormData(emptyDocumentForm);
    setMessage("");
    setPageMode("list");
  }

  const filteredDocuments = documents.filter((document) => {
    const matchStatus = statusFilter ? document.status === statusFilter : true;
    const matchType = typeFilter ? document.document_type === typeFilter : true;
    const fullText = `
      ${document.student_name}
      ${document.admission_no}
      ${document.class_name}
      ${document.section}
      ${document.document_type}
      ${document.document_no}
      ${document.issuing_country}
      ${document.status}
      ${document.verified_by}
    `.toLowerCase();

    return matchStatus && matchType && fullText.includes(searchText.toLowerCase());
  });

  const verifiedCount = useMemo(
    () => documents.filter((document) => document.status === "Verified").length,
    [documents]
  );
  const pendingCount = useMemo(
    () => documents.filter((document) => ["Pending", "Submitted"].includes(document.status)).length,
    [documents]
  );
  const expiringCount = useMemo(
    () => documents.filter((document) => isExpiringSoon(document.expiry_date)).length,
    [documents]
  );

  const documentForm = (
    <section className="form-panel">
      <div className="panel-header">
        <div>
          <h3>{editingId ? "Edit Document" : "Add Document"}</h3>
          <p>Track passports, visas, permits, and required admission documents.</p>
        </div>
      </div>

      <form className="classic-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-field span-2">
            <label>Student *</label>
            <select
              name="student_id"
              value={formData.student_id}
              onChange={handleChange}
              required
            >
              <option value="">Select Student</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {getStudentLabel(student)}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Document Type *</label>
            <select
              name="document_type"
              value={formData.document_type}
              onChange={handleChange}
              required
            >
              {documentTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Document No</label>
            <input
              type="text"
              name="document_no"
              value={formData.document_no}
              onChange={handleChange}
              placeholder="Passport, visa, or certificate number"
            />
          </div>

          <div className="form-field">
            <label>Issue Date</label>
            <input
              type="date"
              name="issue_date"
              value={formData.issue_date}
              onChange={handleChange}
            />
          </div>

          <div className="form-field">
            <label>Expiry Date</label>
            <input
              type="date"
              name="expiry_date"
              value={formData.expiry_date}
              onChange={handleChange}
            />
          </div>

          <div className="form-field">
            <label>Issuing Country</label>
            <input
              type="text"
              name="issuing_country"
              value={formData.issuing_country}
              onChange={handleChange}
              placeholder="Example: India"
            />
          </div>

          <div className="form-field">
            <label>Status</label>
            <select name="status" value={formData.status} onChange={handleChange}>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Document File</label>
            <FileUploadField
              value={formData.file_url}
              onChange={(url) => setFormData((current) => ({ ...current, file_url: url }))}
            />
          </div>

          <div className="form-field">
            <label>Verified By</label>
            <input
              type="text"
              name="verified_by"
              value={formData.verified_by}
              onChange={handleChange}
            />
          </div>

          <div className="form-field">
            <label>Verified Date</label>
            <input
              type="date"
              name="verified_date"
              value={formData.verified_date}
              onChange={handleChange}
            />
          </div>

          <div className="form-field span-2">
            <label>Remarks</label>
            <textarea
              name="remarks"
              value={formData.remarks}
              onChange={handleChange}
              rows="3"
              placeholder="Missing pages, renewal notes, embassy appointment details..."
            />
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="primary-button">
            <PlusCircle size={18} />
            {editingId ? "Update Document" : "Add Document"}
          </button>
          <button type="button" className="light-button" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  );

  if (pageMode === "form") {
    return (
      <div className="management-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">International School</p>
            <h2>{editingId ? "Edit International Document" : "Add International Document"}</h2>
            <p>Maintain passports, visas, permits, and student compliance documents.</p>
          </div>

          <button type="button" className="light-button" onClick={handleCancel}>
            Back to Document Records
          </button>
        </section>

        {message && <div className="toast-notification">{message}</div>}
        {documentForm}
      </div>
    );
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">International School</p>
          <h2>International Documents</h2>
          <p>Track passport, visa, permit, and student document compliance.</p>
        </div>

        <div className="module-header-actions">
          
          <button type="button" className="primary-button" onClick={handleAddDocument}>
            <PlusCircle size={18} />
            Add Document
          </button>
        </div>
      </section>

      <section className="summary-strip report-summary-grid">
        <div className="summary-card">
          <FileCheck size={22} />
          <div>
            <span>Total Documents</span>
            <strong>{documents.length}</strong>
          </div>
        </div>
        <div className="summary-card">
          <CheckCircle size={22} />
          <div>
            <span>Verified</span>
            <strong>{verifiedCount}</strong>
          </div>
        </div>
        <div className="summary-card warning">
          <FileCheck size={22} />
          <div>
            <span>Pending Review</span>
            <strong>{pendingCount}</strong>
          </div>
        </div>
        <div className="summary-card warning">
          <AlertTriangle size={22} />
          <div>
            <span>Expiring Soon</span>
            <strong>{expiringCount}</strong>
          </div>
        </div>
      </section>

      {message && <div className="toast-notification">{message}</div>}

      <section className="table-panel module-filter-panel">
        <div className="filter-row sis-filter-row">
          <div className="form-field">
            <label>Document Type</label>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="">All Types</option>
              {documentTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Status</label>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All Status</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="light-button"
            onClick={() => {
              setSearchText("");
              setTypeFilter("");
              setStatusFilter("");
            }}
          >
            Clear Filters
          </button>
        </div>
      </section>

      <EnhancedRecordsTable
        data={filteredDocuments}
        emptyText="No international document records found."
        loading={loading}
        loadingText="Loading international documents..."
        searchPlaceholder="Search student, document, country, status..."
        searchText={searchText}
        setSearchText={setSearchText}
        columns={[
          { key: "admission_no", label: "Admission No", render: (document) => document.admission_no || "-" },
          { key: "student_name", label: "Student", render: (document) => document.student_name || "-" },
          {
            key: "class",
            label: "Class",
            render: (document) => [document.class_name, document.section].filter(Boolean).join(" ") || "-",
            value: (document) => [document.class_name, document.section].filter(Boolean).join(" "),
          },
          { key: "document_type", label: "Document", render: (document) => document.document_type || "-" },
          { key: "document_no", label: "Document No", render: (document) => document.document_no || "-" },
          { key: "issuing_country", label: "Country", render: (document) => document.issuing_country || "-" },
          { key: "expiry_date", label: "Expiry", render: (document) => document.expiry_date || "-" },
          {
            key: "status",
            label: "Status",
            render: (document) => (
              <span className={document.status === "Rejected" || document.status === "Expired" ? "status danger" : "status active"}>
                {document.status || "Pending"}
              </span>
            ),
            value: (document) => document.status || "Pending",
          },
          {
            key: "file_url",
            label: "File",
            render: (document) =>
              document.file_url ? (
                <a href={document.file_url} target="_blank" rel="noreferrer">
                  Open
                </a>
              ) : (
                "-"
              ),
            value: (document) => document.file_url || "",
          },
          {
            key: "actions",
            label: "Actions",
            hideable: false,
            actions: false,
            render: (document) => (
              <div className="action-buttons">
                <button type="button" className="edit-button" onClick={() => handleEdit(document)} title="Edit">
                  <Edit size={15} />
                </button>
                <button
                  type="button"
                  className="delete-button"
                  onClick={() => handleDelete(document.id)}
                  title="Delete"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ),
            value: () => "",
          },
        ]}
      />
    </div>
  );
}
