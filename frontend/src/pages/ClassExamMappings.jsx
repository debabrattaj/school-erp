import { useEffect, useMemo, useState } from "react";
import { Edit, PlusCircle, RefreshCcw, Trash2 } from "lucide-react";

import API from "../api";
import ManagedRecordsTable from "../components/ManagedRecordsTable";

const emptyMappingForm = {
  class_id: "",
  exam_id: "",
  academic_year: "",
  exam_date: "",
  is_active: true,
  remarks: "",
};

function getApiErrorMessage(error, fallbackMessage) {
  const detail = error.response?.data?.detail;

  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg).join(" | ");
  }

  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") return detail.msg || JSON.stringify(detail);

  return fallbackMessage;
}

function getClassLabel(classRecord) {
  if (!classRecord) return "-";

  const className = classRecord.class_name || classRecord.name || "-";
  const section = classRecord.section || classRecord.section_name;

  return section ? `${className} - Section ${section}` : className;
}

function getExamLabel(exam) {
  if (!exam) return "-";
  return exam.exam_name || exam.name || "-";
}

function getExamTypeLabel(exam) {
  return exam?.exam_type || "-";
}

function getExamOptionLabel(exam) {
  const name = getExamLabel(exam);
  return exam?.exam_type ? `${name} (${exam.exam_type})` : name;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function ClassExamMappings({
  embedded = false,
  initialExamId = "",
  lockExam = false,
  onBack,
}) {
  const [mappings, setMappings] = useState([]);
  const [classes, setClasses] = useState([]);
  const [exams, setExams] = useState([]);
  const [formData, setFormData] = useState(emptyMappingForm);
  const [editingId, setEditingId] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadPageData() {
    try {
      setLoading(true);
      setMessage("");

      const [mappingResponse, classResponse, examResponse] = await Promise.all([
        API.get("/class-exam-mappings/"),
        API.get("/classes/"),
        API.get("/exams/"),
      ]);

      setMappings(mappingResponse.data || []);
      setClasses(classResponse.data || []);
      setExams(examResponse.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load class exam mappings."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPageData();
  }, []);

  useEffect(() => {
    if (!initialExamId) return;

    setFormData((current) => ({
      ...current,
      exam_id: String(initialExamId),
    }));
  }, [initialExamId]);

  const classMap = useMemo(() => {
    const map = {};
    classes.forEach((classRecord) => {
      map[classRecord.id] = classRecord;
    });
    return map;
  }, [classes]);

  const examMap = useMemo(() => {
    const map = {};
    exams.forEach((exam) => {
      map[exam.id] = exam;
    });
    return map;
  }, [exams]);

  const filteredMappings = mappings.filter((mapping) => {
    if (lockExam && initialExamId && String(mapping.exam_id) !== String(initialExamId)) {
      return false;
    }

    const classLabel = getClassLabel(classMap[mapping.class_id]);
    const examLabel = getExamLabel(examMap[mapping.exam_id]);
    const fullText = [
      classLabel,
      examLabel,
      mapping.academic_year,
      mapping.exam_date,
      mapping.is_active ? "Active" : "Inactive",
      mapping.remarks,
    ]
      .join(" ")
      .toLowerCase();

    return fullText.includes(searchText.toLowerCase());
  });

  function handleChange(event) {
    const { checked, name, type, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function buildPayload() {
    return {
      class_id: Number(formData.class_id),
      exam_id: Number(formData.exam_id),
      academic_year: formData.academic_year.trim(),
      exam_date: formData.exam_date || null,
      is_active: Boolean(formData.is_active),
      remarks: formData.remarks.trim() || null,
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    try {
      const payload = buildPayload();
      if (editingId) {
        await API.put(`/class-exam-mappings/${editingId}`, payload);
        setMessage("Class exam mapping updated successfully.");
      } else {
        await API.post("/class-exam-mappings/", payload);
        setMessage("Class exam mapping added successfully.");
      }

      setFormData({
        ...emptyMappingForm,
        exam_id: lockExam && initialExamId ? String(initialExamId) : "",
      });
      setEditingId(null);
      await loadPageData();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save class exam mapping."));
    }
  }

  function handleEdit(mapping) {
    setEditingId(mapping.id);
    setFormData({
      class_id: mapping.class_id || "",
      exam_id: mapping.exam_id || "",
      academic_year: mapping.academic_year || "",
      exam_date: mapping.exam_date || "",
      is_active: mapping.is_active !== false,
      remarks: mapping.remarks || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(mappingId) {
    if (!window.confirm("Delete this class exam mapping?")) return;

    try {
      setMessage("");
      await API.delete(`/class-exam-mappings/${mappingId}`);
      setMessage("Class exam mapping deleted successfully.");
      await loadPageData();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete class exam mapping."));
    }
  }

  function handleCancelEdit() {
    setEditingId(null);
    setFormData({
      ...emptyMappingForm,
      exam_id: lockExam && initialExamId ? String(initialExamId) : "",
    });
    setMessage("");
  }

  return (
    <div className={embedded ? "class-exam-mapping-panel" : "management-page"}>
      {embedded ? (
        <div className="module-header-actions">
          <button type="button" className="light-button" onClick={onBack}>
            Back to Exam Records
          </button>

          <button type="button" className="secondary-button" onClick={loadPageData}>
            <RefreshCcw size={17} />
            Refresh Mapping
          </button>
        </div>
      ) : (
        <section className="page-heading">
        <div>
          <p className="eyebrow">Exam Management</p>
          <h2>Class Exam Mapping</h2>
          <p>Assign exam masters to classes with academic year and exam date.</p>
        </div>

        <button type="button" className="secondary-button" onClick={loadPageData}>
          <RefreshCcw size={17} />
          Refresh
        </button>
      </section>
      )}

      {message && <div className="message-box">{message}</div>}

      <section className="form-panel">
        <div className="panel-header">
          <div>
            <h3>{editingId ? "Edit Mapping" : "Add Mapping"}</h3>
            <p>Mapped exams become available in marks and report cards.</p>
          </div>
        </div>

        <form className="classic-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-field">
              <label>Class *</label>
              <select name="class_id" value={formData.class_id} onChange={handleChange} required>
                <option value="">Select Class</option>
                {classes.map((classRecord) => (
                  <option key={classRecord.id} value={classRecord.id}>
                    {getClassLabel(classRecord)}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Exam Name *</label>
              <select
                name="exam_id"
                value={formData.exam_id}
                onChange={handleChange}
                required
                disabled={lockExam}
              >
                <option value="">Select Exam</option>
                {exams.map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {getExamOptionLabel(exam)}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Academic Year *</label>
              <input
                name="academic_year"
                value={formData.academic_year}
                onChange={handleChange}
                placeholder="2026-27"
                required
              />
            </div>

            <div className="form-field">
              <label>Exam Date</label>
              <input type="date" name="exam_date" value={formData.exam_date} onChange={handleChange} />
            </div>

            <div className="form-field full-width">
              <label>Remarks</label>
              <textarea name="remarks" value={formData.remarks} onChange={handleChange} rows={3} />
            </div>

            <label className="switch-row">
              <input
                type="checkbox"
                name="is_active"
                checked={formData.is_active}
                onChange={handleChange}
              />
              Active
            </label>
          </div>

          <div className="form-actions">
            <button type="submit" className="primary-button">
              <PlusCircle size={18} />
              {editingId ? "Update Mapping" : "Add Mapping"}
            </button>

            {editingId && (
              <button type="button" className="light-button" onClick={handleCancelEdit}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      <ManagedRecordsTable
        count={filteredMappings.length}
        emptyText="No class exam mappings found."
        headers={["Class", "Exam Name", "Exam Type", "Academic Year", "Exam Date", "Status", "Remarks", "Actions"]}
        loading={loading}
        loadingText="Loading class exam mappings..."
        searchPlaceholder="Search class, exam, academic year..."
        searchText={searchText}
        setSearchText={setSearchText}
      >
        {filteredMappings.map((mapping) => (
          <tr key={mapping.id}>
            <td>{getClassLabel(classMap[mapping.class_id])}</td>
            <td>{getExamLabel(examMap[mapping.exam_id])}</td>
            <td>{getExamTypeLabel(examMap[mapping.exam_id])}</td>
            <td>{mapping.academic_year || "-"}</td>
            <td>{formatDate(mapping.exam_date)}</td>
            <td>
              <span className={mapping.is_active !== false ? "status-pill active" : "status-pill inactive"}>
                {mapping.is_active !== false ? "Active" : "Inactive"}
              </span>
            </td>
            <td>{mapping.remarks || "-"}</td>
            <td>
              <div className="action-buttons">
                <button
                  type="button"
                  className="edit-button"
                  onClick={() => handleEdit(mapping)}
                  title="Edit"
                >
                  <Edit size={15} />
                </button>

                <button
                  type="button"
                  className="delete-button"
                  onClick={() => handleDelete(mapping.id)}
                  title="Delete"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </ManagedRecordsTable>
    </div>
  );
}
