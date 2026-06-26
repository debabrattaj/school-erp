import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Edit,
  Trash2,
  PlusCircle,
  Search,
  RefreshCcw,
  Eye,
  X,
  ClipboardList,
  LayoutTemplate,
} from "lucide-react";

import API from "../api";
import { getMasterValues } from "../services/masterDataService";
import { getModuleLayout } from "../services/moduleLayoutService";
import {
  getModuleCustomFields,
  saveModuleCustomFields,
  deleteModuleCustomField,
  deleteAllModuleCustomFields,
} from "../services/moduleCustomFieldService";
import { MODULE_CONFIGS } from "../config/moduleLayouts.js";

const MODULE_NAME = "Exams";

const fallbackExamLayout = [
  {
    id: "exam_information",
    title: "Exam Information",
    fields: [
      {
        id: "field_exam_name",
        name: "exam_name",
        label: "Exam Name",
        type: "singleline",
        required: true,
        source: "system",
      },
      {
        id: "field_class_name",
        name: "class_name",
        label: "Class",
        type: "singleline",
        required: true,
        source: "system",
      },
      {
        id: "field_section",
        name: "section",
        label: "Section",
        type: "picklist",
        required: true,
        source: "system",
        masterCategory: "Section",
      },
      {
        id: "field_exam_date",
        name: "exam_date",
        label: "Exam Date",
        type: "date",
        required: true,
        source: "system",
      },
      {
        id: "field_academic_year",
        name: "academic_year",
        label: "Academic Year",
        type: "singleline",
        required: false,
        source: "system",
      },
      {
        id: "field_remarks",
        name: "remarks",
        label: "Remarks",
        type: "multiline",
        required: false,
        source: "system",
      },
    ],
  },
];
const today = new Date().toISOString().split("T")[0];
const emptyExamForm = {
  exam_name: "",
  class_name: "",
  section: "",
  exam_date: today,
  academic_year: "",
  remarks: "",
};

const fallbackExamTypes = [
  "Unit Test",
  "Mid Term",
  "Final Exam",
  "Practical",
  "Assignment",
];

export default function Exams() {
  const navigate = useNavigate();

  const defaultLayout = fallbackExamLayout;

  const [exams, setExams] = useState([]);
  const [layout, setLayout] = useState(defaultLayout);

  const [dropdownValues, setDropdownValues] = useState({});
  const [formData, setFormData] = useState(emptyExamForm);
  const [customFormData, setCustomFormData] = useState({});

  const [editingId, setEditingId] = useState(null);
  const [selectedExam, setSelectedExam] = useState(null);
  const [selectedExamCustomValues, setSelectedExamCustomValues] = useState({});

  const [searchText, setSearchText] = useState("");
  const [examTypeFilter, setExamTypeFilter] = useState("");
  const [academicYearFilter, setAcademicYearFilter] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function getActiveLayout() {
    try {
      const backendLayout = await getModuleLayout(MODULE_NAME);

      if (backendLayout && Array.isArray(backendLayout)) {
        return backendLayout;
      }

      return defaultLayout;
    } catch (error) {
      console.error("Unable to load exams layout", error);
      return defaultLayout;
    }
  }

  function getCustomFields(layoutToRead = layout) {
    const fields = [];

    layoutToRead.forEach((section) => {
      section.fields.forEach((field) => {
        if (field.source === "custom") {
          fields.push(field);
        }
      });
    });

    return fields;
  }

  async function loadBackendLayoutOnly() {
    const activeLayout = await getActiveLayout();
    setLayout(activeLayout);
    await loadMasterDropdowns(activeLayout);
  }

  async function loadExams() {
    const response = await API.get("/exams/");
    setExams(response.data || []);
  }

  async function loadMasterDropdowns(layoutToRead = layout) {
    const categories = new Set();

    layoutToRead.forEach((section) => {
      section.fields.forEach((field) => {
        if (field.type === "picklist" && field.masterCategory) {
          categories.add(field.masterCategory);
        }
      });
    });

    const entries = await Promise.all(
      Array.from(categories).map(async (category) => {
        try {
          const values = await getMasterValues(category);
          return [category, values || []];
        } catch {
          return [category, []];
        }
      })
    );

    setDropdownValues(Object.fromEntries(entries));
  }

  async function loadPageData() {
    try {
      setLoading(true);
      setMessage("");

      const activeLayout = await getActiveLayout();
      setLayout(activeLayout);

      await Promise.all([loadExams(), loadMasterDropdowns(activeLayout)]);
    } catch (error) {
      console.error(error);
      setMessage(error.response?.data?.detail || "Unable to load exams.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPageData();
  }, []);

  const examTypeOptions = useMemo(() => {
    const masterValues = dropdownValues.ExamType || [];
    const usedValues = exams.map((exam) => exam.exam_type).filter(Boolean);

    return Array.from(
      new Set([...fallbackExamTypes, ...masterValues, ...usedValues])
    );
  }, [dropdownValues, exams]);

  const academicYearOptions = useMemo(() => {
    const masterValues = dropdownValues.AcademicYear || [];
    const usedValues = exams
      .map((exam) => exam.academic_year)
      .filter(Boolean);

    return Array.from(new Set([...masterValues, ...usedValues]));
  }, [dropdownValues, exams]);

  function getFieldValue(field) {
    if (field.source === "custom") {
      if (field.type === "checkbox") {
        return Boolean(customFormData[field.name]);
      }

      return customFormData[field.name] || "";
    }

    return formData[field.name] || "";
  }

  function updateFieldValue(field, value) {
    if (field.source === "custom") {
      setCustomFormData((prev) => ({
        ...prev,
        [field.name]: value,
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [field.name]: value,
    }));
  }

  function handleFieldChange(field, e) {
    const { type, checked, value } = e.target;
    updateFieldValue(field, type === "checkbox" ? checked : value);
  }

  function buildPayload() {
    return {
      exam_name: formData.exam_name,
      class_name: formData.class_name,
      section: formData.section,
      exam_date: formData.exam_date || today,
      academic_year: formData.academic_year || "",
      remarks: formData.remarks || "",
    };
  }

  function convertApiCustomValuesToForm(values = []) {
    const map = {};

    values.forEach((item) => {
      if (item.field_type === "checkbox") {
        map[item.field_key] = item.field_value === "true";
      } else {
        map[item.field_key] = item.field_value || "";
      }
    });

    return map;
  }

  function formatCustomValueForApi(field, value) {
    if (field.type === "checkbox") {
      return value ? "true" : "false";
    }

    if (value === null || value === undefined) return "";

    return String(value);
  }

  function isEmptyCustomValue(field, value) {
    if (field.type === "checkbox") {
      return false;
    }

    return value === "" || value === null || value === undefined;
  }

  async function loadExamCustomFields(examId) {
    try {
      const values = await getModuleCustomFields(MODULE_NAME, examId);
      return convertApiCustomValuesToForm(values);
    } catch (error) {
      console.error("Unable to load exam custom fields", error);
      return {};
    }
  }

  async function saveExamCustomFields(examId) {
    const customFields = getCustomFields();
    const valuesToSave = [];
    const fieldsToDelete = [];

    customFields.forEach((field) => {
      const value = customFormData[field.name];

      if (isEmptyCustomValue(field, value)) {
        fieldsToDelete.push(field.name);
        return;
      }

      valuesToSave.push({
        field_key: field.name,
        field_label: field.label,
        field_type: field.type,
        field_value: formatCustomValueForApi(field, value),
      });
    });

    if (valuesToSave.length > 0) {
      await saveModuleCustomFields(MODULE_NAME, examId, valuesToSave);
    }

    if (editingId && fieldsToDelete.length > 0) {
      await Promise.allSettled(
        fieldsToDelete.map((fieldKey) =>
          deleteModuleCustomField(MODULE_NAME, examId, fieldKey)
        )
      );
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage("");

    try {
      const payload = buildPayload();

      if (!payload.exam_name) {
        setMessage("Exam Name is required.");
        return;
      }

    if (!payload.exam_name) {
      setMessage("Exam Name is required.");
      return;
    }

    if (!payload.class_name) {
      setMessage("Class is required.");
      return;
    }

    if (!payload.section) {
      setMessage("Section is required.");
      return;
    }

    if (!payload.exam_date) {
      setMessage("Exam Date is required.");
      return;
    }

      if (!payload.exam_date) {
        setMessage("Exam Date is required.");
        return;
      }

      let savedExamId = editingId;

      if (editingId) {
        const response = await API.put(`/exams/${editingId}`, payload);
        savedExamId = response.data?.id || editingId;
        await saveExamCustomFields(savedExamId);
        setMessage("Exam updated successfully.");
      } else {
        const response = await API.post("/exams/", payload);
        savedExamId = response.data?.id;

        if (savedExamId) {
          await saveExamCustomFields(savedExamId);
        }

        setMessage("Exam added successfully.");
      }

      setFormData(emptyExamForm);
      setCustomFormData({});
      setEditingId(null);
      await loadExams();
    } catch (error) {
      console.error(error);
      setMessage(
        error.response?.data?.detail ||
          "Something went wrong while saving exam."
      );
    }
  }

  async function handleEdit(exam) {
  setEditingId(exam.id);

    setFormData({
      exam_name: exam.exam_name || "",
      class_name: exam.class_name || "",
      section: exam.section || "",
      exam_date: exam.exam_date || today,
      academic_year: exam.academic_year || "",
      remarks: exam.remarks || "",
    });

    const customValues = await loadExamCustomFields(exam.id);
    setCustomFormData(customValues);

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleView(exam) {
    setSelectedExam(exam);

    const customValues = await loadExamCustomFields(exam.id);
    setSelectedExamCustomValues(customValues);
  }

  async function handleDelete(examId) {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this exam?"
    );

    if (!confirmDelete) return;

    try {
      await deleteAllModuleCustomFields(MODULE_NAME, examId);
      await API.delete(`/exams/${examId}`);

      setMessage("Exam deleted successfully.");
      setSelectedExam(null);
      setSelectedExamCustomValues({});
      await loadExams();
    } catch (error) {
      console.error(error);
      setMessage(error.response?.data?.detail || "Unable to delete exam.");
    }
  }

  function handleCancelEdit() {
    setEditingId(null);
    setFormData(emptyExamForm);
    setCustomFormData({});
    setMessage("");
  }

  function renderField(field) {
    const value = getFieldValue(field);

    const commonProps = {
      name: field.name,
      value,
      onChange: (e) => handleFieldChange(field, e),
      required: Boolean(field.required),
      placeholder: field.placeholder || "",
    };

    if (field.name === "exam_type") {
      return (
        <select {...commonProps}>
          <option value="">Select Exam Type</option>
          {examTypeOptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      );
    }

    if (field.name === "academic_year") {
      return (
        <select {...commonProps}>
          <option value="">Select Academic Year</option>
          {academicYearOptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      );
    }

    if (field.type === "picklist") {
      const values = field.masterCategory
        ? dropdownValues[field.masterCategory] || []
        : [];

      return (
        <select {...commonProps}>
          <option value="">Select {field.label}</option>
          {values.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      );
    }

    if (field.type === "multiline") {
      return <textarea {...commonProps} rows="3"></textarea>;
    }

    if (field.type === "checkbox") {
      return (
        <label className="switch-row">
          <input
            type="checkbox"
            name={field.name}
            checked={Boolean(value)}
            onChange={(e) => handleFieldChange(field, e)}
          />
          <span>{value ? "Yes" : "No"}</span>
        </label>
      );
    }

    const inputTypeMap = {
      singleline: "text",
      email: "email",
      phone: "tel",
      date: "date",
      number: "number",
      decimal: "number",
      url: "url",
    };

    return (
      <input
        {...commonProps}
        type={inputTypeMap[field.type] || "text"}
        step={field.type === "decimal" ? "0.01" : undefined}
      />
    );
  }

  function displayCustomValue(field, value) {
    if (field.type === "checkbox") {
      return value ? "Yes" : "No";
    }

    return value || "-";
  }

  const filteredExams = exams.filter((exam) => {
    const fullText = `
      ${exam.exam_name}
      ${exam.exam_type}
      ${exam.academic_year}
      ${exam.exam_date}
    `.toLowerCase();

    const matchSearch = fullText.includes(searchText.toLowerCase());

    const matchExamType = examTypeFilter
      ? exam.exam_type === examTypeFilter
      : true;

    const matchAcademicYear = academicYearFilter
      ? exam.academic_year === academicYearFilter
      : true;

    return matchSearch && matchExamType && matchAcademicYear;
  });

  const upcomingCount = exams.filter((exam) => {
    if (!exam.exam_date) return false;

    const today = new Date();
    const examDate = new Date(exam.exam_date);

    today.setHours(0, 0, 0, 0);
    examDate.setHours(0, 0, 0, 0);

    return examDate >= today;
  }).length;

  const completedCount = exams.filter((exam) => {
    if (!exam.exam_date) return false;

    const today = new Date();
    const examDate = new Date(exam.exam_date);

    today.setHours(0, 0, 0, 0);
    examDate.setHours(0, 0, 0, 0);

    return examDate < today;
  }).length;

  const customFields = getCustomFields();

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Exam Management</p>
          <h2>Exam Management</h2>
          <p>
            Manage exam records using the Exams module layout saved in backend.
          </p>
        </div>

        <div className="module-header-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => navigate("/exams/layout")}
          >
            <LayoutTemplate size={17} />
            Edit Layout
          </button>

          <button
            type="button"
            className="light-button"
            onClick={loadBackendLayoutOnly}
          >
            <RefreshCcw size={17} />
            Reload Layout
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={loadPageData}
          >
            <RefreshCcw size={17} />
            Refresh
          </button>
        </div>
      </section>

      <section className="summary-strip report-summary-grid">
        <div className="summary-card">
          <ClipboardList size={22} />
          <div>
            <span>Total Exams</span>
            <strong>{exams.length}</strong>
          </div>
        </div>

        <div className="summary-card">
          <ClipboardList size={22} />
          <div>
            <span>Upcoming Exams</span>
            <strong>{upcomingCount}</strong>
          </div>
        </div>

        <div className="summary-card warning">
          <ClipboardList size={22} />
          <div>
            <span>Completed Exams</span>
            <strong>{completedCount}</strong>
          </div>
        </div>

        <div className="summary-card">
          <ClipboardList size={22} />
          <div>
            <span>Custom Fields</span>
            <strong>{customFields.length}</strong>
          </div>
        </div>
      </section>

      {message && <div className="message-box">{message}</div>}

      <section className="form-panel">
        <div className="panel-header">
          <div>
            <h3>{editingId ? "Edit Exam" : "Add Exam"}</h3>
            <p>This form is generated from the backend Exams layout.</p>
          </div>
        </div>

        <form className="classic-form" onSubmit={handleSubmit}>
          {layout.map((section) => (
            <div key={section.id}>
              <div className="sis-section-title">{section.title}</div>

              {section.fields.length === 0 ? (
                <div className="empty-table">No fields in this section.</div>
              ) : (
                <div className="form-grid">
                  {section.fields.map((field) => (
                    <div
                      key={field.id}
                      className={
                        field.type === "multiline"
                          ? "form-field full-width"
                          : "form-field"
                      }
                    >
                      <label>
                        {field.label}
                        {field.required && " *"}
                        {field.source === "custom" && (
                          <small className="custom-field-badge"> Custom</small>
                        )}
                      </label>

                      {renderField(field)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div className="form-actions">
            <button type="submit" className="primary-button">
              <PlusCircle size={18} />
              {editingId ? "Update Exam" : "Add Exam"}
            </button>

            {editingId && (
              <button
                type="button"
                className="light-button"
                onClick={handleCancelEdit}
              >
                Cancel Edit
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="table-panel">
        <div className="table-toolbar">
          <div>
            <h3>Exam Records</h3>
            <p>{filteredExams.length} exam record(s) found</p>
          </div>

          <div className="table-search">
            <Search size={17} />
            <input
              type="text"
              placeholder="Search exam name, type, year..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
        </div>

        <div className="filter-row sis-filter-row">
          <div className="form-field">
            <label>Exam Type</label>
            <select
              value={examTypeFilter}
              onChange={(e) => setExamTypeFilter(e.target.value)}
            >
              <option value="">All Exam Types</option>
              {examTypeOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Academic Year</label>
            <select
              value={academicYearFilter}
              onChange={(e) => setAcademicYearFilter(e.target.value)}
            >
              <option value="">All Academic Years</option>
              {academicYearOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="light-button"
            onClick={() => {
              setExamTypeFilter("");
              setAcademicYearFilter("");
              setSearchText("");
            }}
          >
            Clear Filters
          </button>
        </div>

        {loading ? (
          <div className="loading-box">Loading exams...</div>
        ) : (
          <div className="table-wrapper">
            <table className="classic-table">
              <thead>
                <tr>
                  <th>Exam Name</th>
                  <th>Exam Type</th>
                  <th>Academic Year</th>
                  <th>Exam Date</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredExams.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="empty-table">
                      No exam records found.
                    </td>
                  </tr>
                ) : (
                  filteredExams.map((exam) => (
                    <tr key={exam.id}>
                      <td>{exam.exam_name || "-"}</td>
                      <td>{exam.exam_type || "-"}</td>
                      <td>{exam.academic_year || "-"}</td>
                      <td>{exam.exam_date || "-"}</td>
                      <td>
                        <div className="action-buttons">
                          <button
                            type="button"
                            className="edit-button"
                            onClick={() => handleView(exam)}
                            title="View"
                          >
                            <Eye size={15} />
                          </button>

                          <button
                            type="button"
                            className="edit-button"
                            onClick={() => handleEdit(exam)}
                            title="Edit"
                          >
                            <Edit size={15} />
                          </button>

                          <button
                            type="button"
                            className="delete-button"
                            onClick={() => handleDelete(exam.id)}
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

      {selectedExam && (
        <div className="student-drawer-backdrop">
          <aside className="student-drawer">
            <button
              type="button"
              className="drawer-close"
              onClick={() => {
                setSelectedExam(null);
                setSelectedExamCustomValues({});
              }}
            >
              <X size={18} />
            </button>

            <div className="student-profile-head">
              <div className="student-avatar">
                <ClipboardList size={42} />
              </div>

              <h3>{selectedExam.exam_name || "Exam"}</h3>

              <p>{selectedExam.exam_type || "-"}</p>
            </div>

            <div className="drawer-section">
              <h4>Exam Information</h4>
              <p>Exam Name: {selectedExam.exam_name || "-"}</p>
              <p>Exam Type: {selectedExam.exam_type || "-"}</p>
              <p>Academic Year: {selectedExam.academic_year || "-"}</p>
              <p>Exam Date: {selectedExam.exam_date || "-"}</p>
            </div>

            {customFields.length > 0 && (
              <div className="drawer-section">
                <h4>Custom Fields</h4>

                {customFields.map((field) => (
                  <p key={field.id}>
                    {field.label}:{" "}
                    {displayCustomValue(
                      field,
                      selectedExamCustomValues[field.name]
                    )}
                  </p>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}