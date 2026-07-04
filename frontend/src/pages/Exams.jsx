import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Edit,
  Trash2,
  PlusCircle,
  RefreshCcw,
  Eye,
  X,
  ClipboardList,
  LayoutTemplate,
  ListChecks,
} from "lucide-react";

import API from "../api";
import ManagedRecordsTable from "../components/ManagedRecordsTable";
import ClassExamMappings from "./ClassExamMappings";
import { getMasterValues } from "../services/masterDataService";
import { getModuleLayout, saveModuleLayout } from "../services/moduleLayoutService";
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
        id: "field_exam_type",
        name: "exam_type",
        label: "Exam Type",
        type: "picklist",
        required: true,
        source: "system",
        masterCategory: "ExamType",
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
const emptyExamForm = {
  exam_name: "",
  exam_type: "",
  class_name: "",
  section: "",
  exam_date: "",
  academic_year: "",
  remarks: "",
};

const emptyComponentRow = {
  id: null,
  component_name: "",
  max_marks: "100",
  weightage: "",
  sort_order: "1",
  is_active: true,
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
  const [componentRows, setComponentRows] = useState([{ ...emptyComponentRow }]);
  const [deletedComponentIds, setDeletedComponentIds] = useState([]);

  const [editingId, setEditingId] = useState(null);
  const [pageMode, setPageMode] = useState("list");
  const [mappingExamId, setMappingExamId] = useState("");
  const [componentExam, setComponentExam] = useState(null);
  const [selectedExam, setSelectedExam] = useState(null);
  const [selectedExamCustomValues, setSelectedExamCustomValues] = useState({});

  const [searchText, setSearchText] = useState("");
  const [examTypeFilter, setExamTypeFilter] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function getActiveLayout() {
    try {
      const backendLayout = await getModuleLayout(MODULE_NAME);

      if (backendLayout && Array.isArray(backendLayout)) {
        const repairedLayout = repairExamLayout(backendLayout);

        if (JSON.stringify(backendLayout) !== JSON.stringify(repairedLayout)) {
          try {
            await saveModuleLayout(MODULE_NAME, repairedLayout);
          } catch (saveError) {
            console.error("Unable to save repaired exams layout", saveError);
          }
        }

        return repairedLayout;
      }

      return repairExamLayout(defaultLayout);
    } catch (error) {
      console.error("Unable to load exams layout", error);
      return repairExamLayout(defaultLayout);
    }
  }

  function repairExamLayout(layoutToRepair) {
    const systemFields = fallbackExamLayout[0].fields;
    const systemFieldNames = new Set(systemFields.map((field) => field.name));
    const hiddenLegacyFields = new Set([
      "class_name",
      "section",
      "exam_date",
      "academic_year",
    ]);

    const safeLayout =
      Array.isArray(layoutToRepair) && layoutToRepair.length
        ? layoutToRepair
        : fallbackExamLayout;

    const customSections = safeLayout.map((section) => ({
      ...section,
      fields: (section.fields || []).filter(
        (field) =>
          field?.name &&
          !hiddenLegacyFields.has(field.name) &&
          !systemFieldNames.has(field.name)
      ),
    }));

    const firstSection = safeLayout[0] || fallbackExamLayout[0];
    const firstCustomSection = customSections[0] || { fields: [] };

    return [
      {
        ...firstSection,
        id: fallbackExamLayout[0].id,
        title: fallbackExamLayout[0].title,
        fields: [
          ...systemFields.map((field) => ({ ...field })),
          ...firstCustomSection.fields,
        ],
      },
      ...customSections
        .slice(1)
        .filter((section) => section.fields.length)
        .map((section) => ({
          ...section,
          fields: section.fields.map((field) => ({ ...field })),
        })),
    ];
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
    const categories = new Set(["ExamType"]);

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
      exam_name: formData.exam_name.trim(),
      exam_type: formData.exam_type || "",
      class_name: formData.class_name || "",
      section: formData.section || "",
      exam_date: formData.exam_date || null,
      academic_year: formData.academic_year || null,
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

  async function loadExamComponents(examId) {
    try {
      const response = await API.get(`/exam-components/?exam_id=${examId}`);
      const rows = response.data || [];

      if (rows.length === 0) {
        return [{ ...emptyComponentRow }];
      }

      return rows.map((row, index) => ({
        id: row.id,
        component_name: row.component_name || "",
        max_marks: row.max_marks ?? "100",
        weightage: row.weightage ?? "",
        sort_order: row.sort_order ?? String(index + 1),
        is_active: row.is_active !== false,
        remarks: row.remarks || "",
      }));
    } catch (error) {
      console.error("Unable to load exam components", error);
      return [{ ...emptyComponentRow }];
    }
  }

  function updateComponentRow(index, field, value) {
    setComponentRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row
      )
    );
  }

  function addComponentRow(index) {
    setComponentRows((current) => {
      const nextRows = [...current];
      nextRows.splice(index + 1, 0, {
        ...emptyComponentRow,
        sort_order: String(current.length + 1),
      });
      return nextRows;
    });
  }

  function removeComponentRow(index) {
    setComponentRows((current) => {
      const row = current[index];
      if (row?.id) {
        setDeletedComponentIds((ids) => [...ids, row.id]);
      }

      if (current.length === 1) {
        return [{ ...emptyComponentRow }];
      }

      return current.filter((_, rowIndex) => rowIndex !== index);
    });
  }

  function buildComponentPayload(examId, row) {
    return {
      exam_id: Number(examId),
      component_name: row.component_name.trim(),
      max_marks: row.max_marks === "" ? 0 : Number(row.max_marks),
      weightage: row.weightage === "" ? null : Number(row.weightage),
      sort_order: row.sort_order === "" ? 0 : Number(row.sort_order),
      is_active: Boolean(row.is_active),
      remarks: row.remarks?.trim() || null,
    };
  }

  async function saveExamComponents(examId) {
    const validRows = componentRows.filter((row) => row.component_name.trim());

    await Promise.allSettled(
      deletedComponentIds.map((componentId) =>
        API.delete(`/exam-components/${componentId}`)
      )
    );

    await Promise.all(
      validRows.map((row) => {
        const payload = buildComponentPayload(examId, row);
        return row.id
          ? API.put(`/exam-components/${row.id}`, payload)
          : API.post("/exam-components/", payload);
      })
    );
  }

  async function handleManageComponents(exam) {
    setMessage("");
    setComponentExam(exam);
    setComponentRows(await loadExamComponents(exam.id));
    setDeletedComponentIds([]);
    setPageMode("components");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSaveComponentsOnly(event) {
    event.preventDefault();
    setMessage("");

    if (!componentExam?.id) {
      setMessage("Select an exam before saving components.");
      return;
    }

    try {
      await saveExamComponents(componentExam.id);
      setMessage("Exam components saved successfully.");
      setComponentRows(await loadExamComponents(componentExam.id));
      setDeletedComponentIds([]);
    } catch (error) {
      console.error(error);
      setMessage(
        error.response?.data?.detail ||
          "Something went wrong while saving exam components."
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

      let savedExamId = editingId;

      if (editingId) {
        const response = await API.put(`/exams/${editingId}`, payload);
        savedExamId = response.data?.id || editingId;
        await saveExamCustomFields(savedExamId);
        await saveExamComponents(savedExamId);
        setMessage("Exam updated successfully.");
      } else {
        const response = await API.post("/exams/", payload);
        savedExamId = response.data?.id;

        if (savedExamId) {
          await saveExamCustomFields(savedExamId);
          await saveExamComponents(savedExamId);
        }

        setMessage("Exam added successfully.");
      }

      setFormData(emptyExamForm);
      setCustomFormData({});
      setComponentRows([{ ...emptyComponentRow }]);
      setDeletedComponentIds([]);
      setEditingId(null);
      setPageMode("list");
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
    setPageMode("form");

    setFormData({
      exam_name: exam.exam_name || "",
      exam_type: exam.exam_type || "",
      class_name: exam.class_name || "",
      section: exam.section || "",
      exam_date: exam.exam_date || "",
      academic_year: exam.academic_year || "",
      remarks: exam.remarks || "",
    });

    const customValues = await loadExamCustomFields(exam.id);
    setCustomFormData(customValues);
    setComponentRows(await loadExamComponents(exam.id));
    setDeletedComponentIds([]);

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
    setComponentRows([{ ...emptyComponentRow }]);
    setDeletedComponentIds([]);
    setComponentExam(null);
    setMessage("");
    setPageMode("list");
  }

  function handleAddExam() {
    setEditingId(null);
    setFormData(emptyExamForm);
    setCustomFormData({});
    setComponentRows([{ ...emptyComponentRow }]);
    setDeletedComponentIds([]);
    setComponentExam(null);
    setMessage("");
    setPageMode("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
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
      ${exam.remarks}
    `.toLowerCase();

    const matchSearch = fullText.includes(searchText.toLowerCase());

    const matchExamType = examTypeFilter
      ? exam.exam_type === examTypeFilter
      : true;

    return matchSearch && matchExamType;
  });

  const customFields = getCustomFields();

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Exam Management</p>
          <h2>Exam Management</h2>
          <p>
            Manage reusable exam names here. Map dates and academic years from Class Details.
          </p>
        </div>

        <div className="module-header-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setMappingExamId("");
              setPageMode("mapping");
            }}
          >
            <ClipboardList size={17} />
            Map Exam to Class
          </button>

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

          <button type="button" className="primary-button" onClick={handleAddExam}>
            <PlusCircle size={18} />
            Add Exam
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
            <span>Exam Types</span>
            <strong>{examTypeOptions.length}</strong>
          </div>
        </div>

        <div className="summary-card warning">
          <ClipboardList size={22} />
          <div>
            <span>Visible Records</span>
            <strong>{filteredExams.length}</strong>
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

      {pageMode === "form" && (
      <section className="form-panel">
        <div className="panel-header">
          <div>
            <h3>{editingId ? "Edit Exam" : "Add Exam"}</h3>
            <p>Create reusable exam masters. Schedule them from Class Exam Mapping.</p>
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

          <div>
            <div className="sis-section-title">Class Mapping</div>
            <div className="form-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  setMappingExamId("");
                  setPageMode("mapping");
                }}
              >
                <ClipboardList size={18} />
                Map Exam to Class
              </button>
              <span className="helper-text">
                Assign this exam to classes with academic year and exam date.
              </span>
            </div>
          </div>

          <div className="exam-components-card">
            <div className="sis-section-title">Exam Components</div>
            <div className="table-wrapper exam-components-wrapper">
              <table className="classic-table exam-components-table">
                <thead>
                  <tr>
                    <th>+/-</th>
                    <th>Component</th>
                    <th>Max Marks</th>
                    <th>Weightage</th>
                    <th>Order</th>
                    <th>Status</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {componentRows.map((row, index) => (
                    <tr key={`${row.id || "new"}-${index}`}>
                      <td className="component-row-actions">
                        <div className="component-inline-actions">
                          <button
                            type="button"
                            className="edit-button"
                            onClick={() => addComponentRow(index)}
                            title="Add row"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="delete-button"
                            onClick={() => removeComponentRow(index)}
                            title="Delete row"
                          >
                            -
                          </button>
                        </div>
                      </td>
                      <td>
                        <input
                          value={row.component_name}
                          onChange={(event) =>
                            updateComponentRow(index, "component_name", event.target.value)
                          }
                          placeholder="Theory"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.max_marks}
                          onChange={(event) =>
                            updateComponentRow(index, "max_marks", event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.weightage}
                          onChange={(event) =>
                            updateComponentRow(index, "weightage", event.target.value)
                          }
                          placeholder="%"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          value={row.sort_order}
                          onChange={(event) =>
                            updateComponentRow(index, "sort_order", event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <label className="switch-row">
                          <input
                            type="checkbox"
                            checked={row.is_active}
                            onChange={(event) =>
                              updateComponentRow(index, "is_active", event.target.checked)
                            }
                          />
                          Active
                        </label>
                      </td>
                      <td>
                        <input
                          value={row.remarks}
                          onChange={(event) =>
                            updateComponentRow(index, "remarks", event.target.value)
                          }
                          placeholder="Optional"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="primary-button">
              <PlusCircle size={18} />
              {editingId ? "Update Exam" : "Add Exam"}
            </button>

            <button
              type="button"
              className="light-button"
              onClick={handleCancelEdit}
            >
              Cancel
            </button>
          </div>
        </form>
      </section>
      )}

      {pageMode === "components" && componentExam && (
      <section className="form-panel">
        <div className="panel-header">
          <div>
            <h3>Manage Components</h3>
            <p>
              {componentExam.exam_name || "Exam"}{" "}
              {componentExam.exam_type ? `(${componentExam.exam_type})` : ""}
            </p>
          </div>
        </div>

        <form className="classic-form" onSubmit={handleSaveComponentsOnly}>
          <div className="exam-components-card">
            <div className="sis-section-title">Exam Components</div>
            <div className="table-wrapper exam-components-wrapper">
              <table className="classic-table exam-components-table">
                <thead>
                  <tr>
                    <th>+/-</th>
                    <th>Component</th>
                    <th>Max Marks</th>
                    <th>Weightage</th>
                    <th>Order</th>
                    <th>Status</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {componentRows.map((row, index) => (
                    <tr key={`${row.id || "new"}-${index}`}>
                      <td className="component-row-actions">
                        <div className="component-inline-actions">
                          <button
                            type="button"
                            className="edit-button"
                            onClick={() => addComponentRow(index)}
                            title="Add row"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="delete-button"
                            onClick={() => removeComponentRow(index)}
                            title="Delete row"
                          >
                            -
                          </button>
                        </div>
                      </td>
                      <td>
                        <input
                          value={row.component_name}
                          onChange={(event) =>
                            updateComponentRow(index, "component_name", event.target.value)
                          }
                          placeholder="Theory"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.max_marks}
                          onChange={(event) =>
                            updateComponentRow(index, "max_marks", event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.weightage}
                          onChange={(event) =>
                            updateComponentRow(index, "weightage", event.target.value)
                          }
                          placeholder="%"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          value={row.sort_order}
                          onChange={(event) =>
                            updateComponentRow(index, "sort_order", event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <label className="switch-row">
                          <input
                            type="checkbox"
                            checked={row.is_active}
                            onChange={(event) =>
                              updateComponentRow(index, "is_active", event.target.checked)
                            }
                          />
                          Active
                        </label>
                      </td>
                      <td>
                        <input
                          value={row.remarks}
                          onChange={(event) =>
                            updateComponentRow(index, "remarks", event.target.value)
                          }
                          placeholder="Optional"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="primary-button">
              <ListChecks size={18} />
              Save Components
            </button>
            <button
              type="button"
              className="light-button"
              onClick={() => {
                setComponentExam(null);
                setComponentRows([{ ...emptyComponentRow }]);
                setDeletedComponentIds([]);
                setPageMode("list");
              }}
            >
              Back
            </button>
          </div>
        </form>
      </section>
      )}

      {pageMode === "mapping" && (
        <ClassExamMappings
          embedded
          initialExamId={mappingExamId}
          lockExam={Boolean(mappingExamId)}
          onBack={() => {
            setMessage("");
            setMappingExamId("");
            setPageMode("list");
          }}
        />
      )}

      {pageMode === "list" && (
        <>
      <section className="table-panel module-filter-panel">
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

          <button
            type="button"
            className="light-button"
            onClick={() => {
              setExamTypeFilter("");
              setSearchText("");
            }}
          >
            Clear Filters
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setMappingExamId("");
              setPageMode("mapping");
            }}
          >
            <ClipboardList size={18} />
            Map Exam to Class
          </button>
        </div>

      </section>

      <ManagedRecordsTable
        count={filteredExams.length}
        emptyText="No exam records found."
        headers={["Exam Name", "Exam Type", "Remarks", "Actions"]}
        loading={loading}
        loadingText="Loading exams..."
        searchPlaceholder="Search exam name, type, remarks..."
        searchText={searchText}
        setSearchText={setSearchText}
      >
        {filteredExams.map((exam) => (
                    <tr key={exam.id}>
                      <td>{exam.exam_name || "-"}</td>
                      <td>{exam.exam_type || "-"}</td>
                      <td>{exam.remarks || "-"}</td>
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
                            className="edit-button"
                            onClick={() => {
                              setMappingExamId(String(exam.id));
                              setPageMode("mapping");
                            }}
                            title="Map Exam to Class"
                          >
                            <ClipboardList size={15} />
                          </button>

                          <button
                            type="button"
                            className="edit-button"
                            onClick={() => handleManageComponents(exam)}
                            title="Manage Components"
                          >
                            <ListChecks size={15} />
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
        ))}
      </ManagedRecordsTable>
        </>
      )}

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
              <p>Remarks: {selectedExam.remarks || "-"}</p>
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
