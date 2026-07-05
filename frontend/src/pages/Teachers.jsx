import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Edit,
  PlusCircle,
  RefreshCcw,
  Eye,
  X,
  GraduationCap,
  LayoutTemplate,
} from "lucide-react";

import API from "../api";
import { getMasterValues } from "../services/masterDataService";
import {
  getModuleLayout,
  saveModuleLayout,
} from "../services/moduleLayoutService";
import {
  getModuleCustomFields,
  saveModuleCustomFields,
  deleteModuleCustomField,
  deleteAllModuleCustomFields,
} from "../services/moduleCustomFieldService";
import EnhancedRecordsTable from "../components/EnhancedRecordsTable";

const MODULE_NAME = "Teachers";

const fallbackTeacherLayout = [
  {
    id: "teacher_information",
    title: "Teacher Information",
    fields: [
      {
        id: "field_employee_no",
        name: "employee_no",
        label: "Employee No",
        type: "singleline",
        required: true,
        source: "system",
      },
      {
        id: "field_name",
        name: "name",
        label: "Teacher Name",
        type: "singleline",
        required: true,
        source: "system",
      },
      {
        id: "field_gender",
        name: "gender",
        label: "Gender",
        type: "picklist",
        required: false,
        source: "system",
        masterCategory: "Gender",
      },
      {
        id: "field_department",
        name: "department",
        label: "Department",
        type: "picklist",
        required: false,
        source: "system",
        masterCategory: "Department",
      },
      {
        id: "field_subject",
        name: "subject",
        label: "Subject",
        type: "picklist",
        required: false,
        source: "system",
        masterCategory: "Subject",
      },
      {
        id: "field_phone",
        name: "phone",
        label: "Phone",
        type: "phone",
        required: false,
        source: "system",
      },
      {
        id: "field_email",
        name: "email",
        label: "Email",
        type: "email",
        required: false,
        source: "system",
      },
      {
        id: "field_employment_type",
        name: "employment_type",
        label: "Employment Type",
        type: "picklist",
        required: false,
        source: "system",
        masterCategory: "EmploymentType",
      },
      {
        id: "field_joining_date",
        name: "joining_date",
        label: "Joining Date",
        type: "date",
        required: false,
        source: "system",
      },
      {
        id: "field_status",
        name: "status",
        label: "Status",
        type: "picklist",
        required: false,
        source: "system",
      },
      {
        id: "field_is_class_teacher",
        name: "is_class_teacher",
        label: "Is Class Teacher",
        type: "checkbox",
        required: false,
        source: "system",
      },
      {
        id: "field_class_id",
        name: "class_id",
        label: "Class",
        type: "lookup",
        required: false,
        source: "system",
      },
    ],
  },
];

const emptyTeacherForm = {
  employee_no: "",
  name: "",
  gender: "",
  department: "",
  subject: "",
  phone: "",
  email: "",
  employment_type: "",
  joining_date: "",
  status: "Active",
  is_class_teacher: false,
  class_id: "",
};

const fallbackStatusOptions = ["Active", "Inactive", "On Leave"];

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

  if (typeof detail === "string") {
    return detail;
  }

  if (detail && typeof detail === "object") {
    return detail.msg || JSON.stringify(detail);
  }

  return fallbackMessage;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getAllFields(layout) {
  if (!Array.isArray(layout)) return [];

  return layout.flatMap((section) =>
    Array.isArray(section.fields) ? section.fields : []
  );
}

function normalizeDateInput(value) {
  if (!value) return "";
  return String(value).split("T")[0];
}

function repairTeacherLayout(layoutToRepair) {
  const requiredSystemFields = fallbackTeacherLayout[0].fields;
  const obsoleteSystemFields = ["teacher_code", "first_name", "last_name"];

  let repairedLayout =
    Array.isArray(layoutToRepair) && layoutToRepair.length > 0
      ? deepClone(layoutToRepair)
      : deepClone(fallbackTeacherLayout);

  repairedLayout = repairedLayout.map((section) => ({
    ...section,
    fields: Array.isArray(section.fields)
      ? section.fields.filter(
          (field) => !obsoleteSystemFields.includes(field.name)
        )
      : [],
  }));

  if (!repairedLayout.length) {
    repairedLayout = deepClone(fallbackTeacherLayout);
  }

  const existingNames = new Set(
    getAllFields(repairedLayout).map((field) => field.name)
  );

  requiredSystemFields.forEach((systemField) => {
    if (!existingNames.has(systemField.name)) {
      repairedLayout[0].fields.push(systemField);
    }
  });

  repairedLayout = repairedLayout.map((section) => ({
    ...section,
    fields: section.fields.map((field) => {
      const systemField = requiredSystemFields.find(
        (item) => item.name === field.name
      );

      if (!systemField) return field;

      return {
        ...systemField,
        id: field.id || systemField.id,
        label: systemField.label,
        required: systemField.required,
        source: "system",
      };
    }),
  }));

  return repairedLayout;
}

function getTeacherName(teacher) {
  const employeeNo = teacher.employee_no || "";
  const name = teacher.name || "";

  if (employeeNo) {
    return `${employeeNo} - ${name}`;
  }

  return name || `Teacher ID: ${teacher.id}`;
}

export default function Teachers() {
  const navigate = useNavigate();

  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [layout, setLayout] = useState(repairTeacherLayout(fallbackTeacherLayout));

  const [dropdownValues, setDropdownValues] = useState({});
  const [formData, setFormData] = useState(emptyTeacherForm);
  const [customFormData, setCustomFormData] = useState({});

  const [editingId, setEditingId] = useState(null);
  const [pageMode, setPageMode] = useState("list");
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [selectedTeacherCustomValues, setSelectedTeacherCustomValues] =
    useState({});

  const [searchText, setSearchText] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return undefined;

    const timeoutId = window.setTimeout(() => {
      setMessage("");
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  async function getActiveLayout() {
    try {
      const backendLayout = await getModuleLayout(MODULE_NAME);
      const repairedLayout = repairTeacherLayout(backendLayout);

      if (
        JSON.stringify(backendLayout || []) !==
        JSON.stringify(repairedLayout)
      ) {
        await saveModuleLayout(MODULE_NAME, repairedLayout);
      }

      return repairedLayout;
    } catch (error) {
      console.error("Unable to load teacher layout", error);
      return repairTeacherLayout(fallbackTeacherLayout);
    }
  }

  function getCustomFields(layoutToRead = layout) {
    return getAllFields(layoutToRead).filter(
      (field) => field.source === "custom"
    );
  }

  async function loadTeachers() {
    const response = await API.get("/teachers/");
    setTeachers(response.data || []);
  }

  async function loadClasses() {
    const response = await API.get("/classes/");
    setClasses(response.data || []);
  }

  async function loadMasterDropdowns(layoutToRead = layout) {
    const categories = new Set();

    layoutToRead.forEach((section) => {
      if (!Array.isArray(section.fields)) return;

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

  async function loadBackendLayoutOnly() {
    const activeLayout = await getActiveLayout();
    setLayout(activeLayout);
    await loadMasterDropdowns(activeLayout);
  }

  async function loadPageData() {
    try {
      setLoading(true);
      setMessage("");

      const activeLayout = await getActiveLayout();
      setLayout(activeLayout);

      await Promise.all([
        loadTeachers(),
        loadClasses(),
        loadMasterDropdowns(activeLayout),
      ]);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load teachers."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPageData();
  }, []);

  const classMap = useMemo(() => {
    const map = {};

    classes.forEach((item) => {
      map[item.id] = `${item.class_name || ""} - Section ${
        item.section || ""
      }`.trim();
    });

    return map;
  }, [classes]);

  const departmentOptions = useMemo(() => {
    const masterValues = dropdownValues.Department || [];
    const usedValues = teachers
      .map((teacher) => teacher.department)
      .filter(Boolean);

    return Array.from(new Set([...masterValues, ...usedValues]));
  }, [dropdownValues, teachers]);

  const statusOptions = useMemo(() => {
    const usedValues = teachers.map((teacher) => teacher.status).filter(Boolean);

    return Array.from(new Set([...fallbackStatusOptions, ...usedValues]));
  }, [teachers]);

  function getClassName(classId) {
    if (!classId) return "-";
    return classMap[classId] || `Class ID: ${classId}`;
  }

  function getFieldValue(field) {
    if (field.source === "custom") {
      if (field.type === "checkbox") {
        return Boolean(customFormData[field.name]);
      }

      return customFormData[field.name] || "";
    }

    if (field.type === "checkbox") {
      return Boolean(formData[field.name]);
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

    if (field.name === "is_class_teacher") {
      setFormData((prev) => ({
        ...prev,
        is_class_teacher: checked,
        class_id: checked ? prev.class_id : "",
      }));
      return;
    }

    updateFieldValue(field, type === "checkbox" ? checked : value);
  }

  function buildPayload() {
    return {
      employee_no: formData.employee_no || "",
      name: formData.name || "",
      gender: formData.gender || "",
      department: formData.department || "",
      subject: formData.subject || "",
      phone: formData.phone || "",
      email: formData.email || "",
      employment_type: formData.employment_type || "",
      joining_date: formData.joining_date || null,
      status: formData.status || "Active",
      is_class_teacher: Boolean(formData.is_class_teacher),
      class_id:
        formData.is_class_teacher && formData.class_id
          ? Number(formData.class_id)
          : null,
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
    if (field.type === "checkbox") return false;
    return value === "" || value === null || value === undefined;
  }

  async function loadTeacherCustomFields(teacherId) {
    try {
      const values = await getModuleCustomFields(MODULE_NAME, teacherId);
      return convertApiCustomValuesToForm(values);
    } catch (error) {
      console.error("Unable to load teacher custom fields", error);
      return {};
    }
  }

  async function saveTeacherCustomFields(teacherId) {
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
      await saveModuleCustomFields(MODULE_NAME, teacherId, valuesToSave);
    }

    if (editingId && fieldsToDelete.length > 0) {
      await Promise.allSettled(
        fieldsToDelete.map((fieldKey) =>
          deleteModuleCustomField(MODULE_NAME, teacherId, fieldKey)
        )
      );
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage("");

    try {
      const payload = buildPayload();

      if (!payload.employee_no) {
        setMessage("Employee No is required.");
        return;
      }

      if (!payload.name) {
        setMessage("Teacher Name is required.");
        return;
      }

      if (payload.is_class_teacher && !payload.class_id) {
        setMessage("Class is required when Is Class Teacher is checked.");
        return;
      }

      let savedTeacherId = editingId;

      if (editingId) {
        const response = await API.put(`/teachers/${editingId}`, payload);
        savedTeacherId = response.data?.id || editingId;
        await saveTeacherCustomFields(savedTeacherId);
        setMessage("Teacher updated successfully.");
      } else {
        const response = await API.post("/teachers/", payload);
        savedTeacherId = response.data?.id;

        if (savedTeacherId) {
          await saveTeacherCustomFields(savedTeacherId);
        }

        setMessage("Teacher added successfully.");
      }

      setFormData(emptyTeacherForm);
      setCustomFormData({});
      setEditingId(null);
      setPageMode("list");

      await Promise.all([loadTeachers(), loadClasses()]);
    } catch (error) {
      console.error(error);
      setMessage(
        getApiErrorMessage(error, "Something went wrong while saving teacher.")
      );
    }
  }

  async function handleEdit(teacher) {
    setEditingId(teacher.id);
    setPageMode("form");

    setFormData({
      employee_no: teacher.employee_no || "",
      name: teacher.name || "",
      gender: teacher.gender || "",
      department: teacher.department || "",
      subject: teacher.subject || "",
      phone: teacher.phone || "",
      email: teacher.email || "",
      employment_type: teacher.employment_type || "",
      joining_date: normalizeDateInput(teacher.joining_date),
      status: teacher.status || "Active",
      is_class_teacher: Boolean(teacher.is_class_teacher),
      class_id: teacher.class_id || "",
    });

    const customValues = await loadTeacherCustomFields(teacher.id);
    setCustomFormData(customValues);

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleView(teacher) {
    setSelectedTeacher(teacher);

    const customValues = await loadTeacherCustomFields(teacher.id);
    setSelectedTeacherCustomValues(customValues);
  }

  async function handleDelete(teacherId) {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this teacher?"
    );

    if (!confirmDelete) return;

    try {
      await deleteAllModuleCustomFields(MODULE_NAME, teacherId);
      await API.delete(`/teachers/${teacherId}`);

      setMessage("Teacher deleted successfully.");
      setSelectedTeacher(null);
      setSelectedTeacherCustomValues({});

      await Promise.all([loadTeachers(), loadClasses()]);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete teacher."));
    }
  }

  function handleCancelEdit() {
    setEditingId(null);
    setFormData(emptyTeacherForm);
    setCustomFormData({});
    setMessage("");
    setPageMode("list");
  }

  function handleAddTeacher() {
    setEditingId(null);
    setFormData(emptyTeacherForm);
    setCustomFormData({});
    setMessage("");
    setPageMode("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderField(field) {
    const value = getFieldValue(field);

    if (field.name === "is_class_teacher") {
      return (
        <label className="switch-row">
          <input
            type="checkbox"
            checked={Boolean(formData.is_class_teacher)}
            onChange={(e) => handleFieldChange(field, e)}
          />
          <span>{formData.is_class_teacher ? "Yes" : "No"}</span>
        </label>
      );
    }

    if (field.name === "class_id") {
      return (
        <select
          name="class_id"
          value={formData.class_id || ""}
          onChange={(e) =>
            setFormData((prev) => ({
              ...prev,
              class_id: e.target.value,
            }))
          }
          disabled={!formData.is_class_teacher}
        >
          <option value="">
            {formData.is_class_teacher
              ? "Select Class"
              : "Enable Is Class Teacher first"}
          </option>

          {classes.map((classItem) => (
            <option key={classItem.id} value={classItem.id}>
              {classItem.class_name} - Section {classItem.section}
            </option>
          ))}
        </select>
      );
    }

    const commonProps = {
      name: field.name,
      value,
      onChange: (e) => handleFieldChange(field, e),
      required: Boolean(field.required),
      placeholder: field.placeholder || "",
    };

    if (field.name === "status") {
      return (
        <select {...commonProps}>
          <option value="">Select Status</option>

          {statusOptions.map((item) => (
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
      lookup: "text",
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

  function getStatusClass(status) {
    const text = String(status || "").toLowerCase();

    if (text === "active") return "status active";
    if (text === "inactive") return "status danger";

    return "status warning";
  }

  const filteredTeachers = teachers.filter((teacher) => {
    const teacherName = getTeacherName(teacher);
    const className = getClassName(teacher.class_id);

    const fullText = `
      ${teacher.employee_no}
      ${teacher.name}
      ${teacherName}
      ${teacher.gender}
      ${teacher.department}
      ${teacher.subject}
      ${teacher.phone}
      ${teacher.email}
      ${teacher.employment_type}
      ${teacher.status}
      ${className}
    `.toLowerCase();

    const matchSearch = fullText.includes(searchText.toLowerCase());

    const matchDepartment = departmentFilter
      ? teacher.department === departmentFilter
      : true;

    const matchStatus = statusFilter ? teacher.status === statusFilter : true;

    return matchSearch && matchDepartment && matchStatus;
  });

  const activeCount = teachers.filter(
    (teacher) => String(teacher.status || "").toLowerCase() === "active"
  ).length;

  const classTeacherCount = teachers.filter((teacher) =>
    Boolean(teacher.is_class_teacher)
  ).length;

  const customFields = getCustomFields();

  if (pageMode === "form") {
    return (
      <div className="management-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Teacher Management</p>
            <h2>{editingId ? "Edit Teacher" : "Add Teacher"}</h2>
            <p>This form is generated from the backend Teachers layout.</p>
          </div>

          <button
            type="button"
            className="light-button"
            onClick={handleCancelEdit}
          >
            Back to Teacher Records
          </button>
        </section>

        {message && <div className="toast-notification">{message}</div>}

        <section className="form-panel">
          <div className="panel-header">
            <div>
              <h3>{editingId ? "Edit Teacher" : "Add Teacher"}</h3>
              <p>This form is generated from the backend Teachers layout.</p>
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
                {editingId ? "Update Teacher" : "Add Teacher"}
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
      </div>
    );
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Teacher Management</p>
          <h2>Teacher Management</h2>
          <p>Manage teachers, class teacher assignment and custom fields.</p>
        </div>

        <div className="module-header-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => navigate("/teachers/layout")}
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

          <button type="button" className="primary-button" onClick={handleAddTeacher}>
            <PlusCircle size={18} />
            Add Teacher
          </button>
        </div>
      </section>

      <section className="summary-strip report-summary-grid">
        <div className="summary-card">
          <GraduationCap size={22} />
          <div>
            <span>Total Teachers</span>
            <strong>{teachers.length}</strong>
          </div>
        </div>

        <div className="summary-card">
          <GraduationCap size={22} />
          <div>
            <span>Active Teachers</span>
            <strong>{activeCount}</strong>
          </div>
        </div>

        <div className="summary-card warning">
          <GraduationCap size={22} />
          <div>
            <span>Class Teachers</span>
            <strong>{classTeacherCount}</strong>
          </div>
        </div>

        <div className="summary-card">
          <GraduationCap size={22} />
          <div>
            <span>Custom Fields</span>
            <strong>{customFields.length}</strong>
          </div>
        </div>
      </section>

      {message && <div className="toast-notification">{message}</div>}

      <EnhancedRecordsTable
        data={filteredTeachers}
        emptyText="No teacher records found."
        loading={loading}
        loadingText="Loading teachers..."
        searchPlaceholder="Search teacher, department, subject..."
        searchText={searchText}
        setSearchText={setSearchText}
        columns={[
          { key: "employee_no", label: "Employee No", render: (teacher) => teacher.employee_no || "-" },
          { key: "name", label: "Teacher Name", render: (teacher) => teacher.name || "-" },
          { key: "department", label: "Department", render: (teacher) => teacher.department || "-" },
          { key: "subject", label: "Subject", render: (teacher) => teacher.subject || "-" },
          {
            key: "is_class_teacher",
            label: "Class Teacher",
            render: (teacher) => (teacher.is_class_teacher ? "Yes" : "No"),
            value: (teacher) => (teacher.is_class_teacher ? "Yes" : "No"),
          },
          {
            key: "class",
            label: "Class",
            render: (teacher) => getClassName(teacher.class_id),
            value: (teacher) => getClassName(teacher.class_id),
          },
          { key: "phone", label: "Phone", render: (teacher) => teacher.phone || "-" },
          {
            key: "status",
            label: "Status",
            render: (teacher) => (
              <span className={getStatusClass(teacher.status)}>
                {teacher.status || "Active"}
              </span>
            ),
            value: (teacher) => teacher.status || "Active",
          },
          {
            key: "actions",
            label: "Actions",
            hideable: false,
            actions: false,
            render: (teacher) => (
              <div className="action-buttons">
                <button type="button" className="edit-button" onClick={() => handleView(teacher)} title="View">
                  <Eye size={15} />
                </button>
                <button type="button" className="edit-button" onClick={() => handleEdit(teacher)} title="Edit">
                  <Edit size={15} />
                </button>
              </div>
            ),
            value: () => "",
          },
        ]}
      />

      {selectedTeacher && (
        <div className="student-drawer-backdrop">
          <aside className="student-drawer">
            <button
              type="button"
              className="drawer-close"
              onClick={() => {
                setSelectedTeacher(null);
                setSelectedTeacherCustomValues({});
              }}
            >
              <X size={18} />
            </button>

            <div className="student-profile-head">
              <div className="student-avatar">
                <GraduationCap size={42} />
              </div>

              <h3>{getTeacherName(selectedTeacher)}</h3>

              <p>{selectedTeacher.department || "-"}</p>
            </div>

            <div className="drawer-section">
              <h4>Teacher Information</h4>
              <p>Employee No: {selectedTeacher.employee_no || "-"}</p>
              <p>Teacher Name: {selectedTeacher.name || "-"}</p>
              <p>Gender: {selectedTeacher.gender || "-"}</p>
              <p>Department: {selectedTeacher.department || "-"}</p>
              <p>Subject: {selectedTeacher.subject || "-"}</p>
              <p>Email: {selectedTeacher.email || "-"}</p>
              <p>Phone: {selectedTeacher.phone || "-"}</p>
              <p>Employment Type: {selectedTeacher.employment_type || "-"}</p>
              <p>
                Joining Date:{" "}
                {normalizeDateInput(selectedTeacher.joining_date) || "-"}
              </p>
              <p>
                Is Class Teacher:{" "}
                {selectedTeacher.is_class_teacher ? "Yes" : "No"}
              </p>
              <p>Class: {getClassName(selectedTeacher.class_id)}</p>
              <p>Status: {selectedTeacher.status || "Active"}</p>
            </div>

            {customFields.length > 0 && (
              <div className="drawer-section">
                <h4>Custom Fields</h4>

                {customFields.map((field) => (
                  <p key={field.id}>
                    {field.label}:{" "}
                    {displayCustomValue(
                      field,
                      selectedTeacherCustomValues[field.name]
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
