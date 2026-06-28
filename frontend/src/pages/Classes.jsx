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
  BookOpen,
  LayoutTemplate,
  Users,
  GraduationCap,
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

const MODULE_NAME = "Classes";

const fallbackClassLayout = [
  {
    id: "class_information",
    title: "Class Information",
    fields: [
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
        id: "field_class_teacher_id",
        name: "class_teacher_id",
        label: "Class Teacher",
        type: "lookup",
        required: false,
        source: "system",
      },
      {
        id: "field_room_no",
        name: "room_no",
        label: "Room No",
        type: "singleline",
        required: false,
        source: "system",
      },
    ],
  },
];

const emptyClassForm = {
  class_name: "",
  section: "",
  class_teacher_id: "",
  class_teacher: "",
  room_no: "",
};

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

function repairClassLayout(layoutToRepair) {
  const systemFields = fallbackClassLayout[0].fields;

  // Old text field should not appear in the form anymore.
  // Class teacher must be selected by lookup only.
  const obsoleteSystemFields = ["class_teacher"];

  let repairedLayout =
    Array.isArray(layoutToRepair) && layoutToRepair.length > 0
      ? deepClone(layoutToRepair)
      : deepClone(fallbackClassLayout);

  repairedLayout = repairedLayout.map((section) => ({
    ...section,
    fields: Array.isArray(section.fields)
      ? section.fields.filter(
          (field) => !obsoleteSystemFields.includes(field.name)
        )
      : [],
  }));

  if (!repairedLayout.length) {
    repairedLayout = deepClone(fallbackClassLayout);
  }

  const existingNames = new Set(
    getAllFields(repairedLayout).map((field) => field.name)
  );

  systemFields.forEach((systemField) => {
    if (!existingNames.has(systemField.name)) {
      repairedLayout[0].fields.push(systemField);
    }
  });

  repairedLayout = repairedLayout.map((section) => ({
    ...section,
    fields: section.fields.map((field) => {
      const systemField = systemFields.find((item) => item.name === field.name);

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

function getTeacherDisplayLabel(teacher) {
  if (!teacher) return "-";

  const name = teacher.name || "Unknown Teacher";
  const department = teacher.department || "No Department";

  return `${name} : ${department}`;
}

export default function Classes() {
  const navigate = useNavigate();

  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [layout, setLayout] = useState(repairClassLayout(fallbackClassLayout));

  const [dropdownValues, setDropdownValues] = useState({});
  const [formData, setFormData] = useState(emptyClassForm);
  const [customFormData, setCustomFormData] = useState({});

  const [editingId, setEditingId] = useState(null);
  const [pageMode, setPageMode] = useState("list");
  const [selectedClass, setSelectedClass] = useState(null);
  const [selectedClassCustomValues, setSelectedClassCustomValues] =
    useState({});

  const [searchText, setSearchText] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function getActiveLayout() {
    try {
      const backendLayout = await getModuleLayout(MODULE_NAME);
      const repairedLayout = repairClassLayout(backendLayout);

      if (
        JSON.stringify(backendLayout || []) !==
        JSON.stringify(repairedLayout)
      ) {
        await saveModuleLayout(MODULE_NAME, repairedLayout);
      }

      return repairedLayout;
    } catch (error) {
      console.error("Unable to load classes layout", error);
      return repairClassLayout(fallbackClassLayout);
    }
  }

  function getCustomFields(layoutToRead = layout) {
    return getAllFields(layoutToRead).filter(
      (field) => field.source === "custom"
    );
  }

  async function loadClasses() {
    const response = await API.get("/classes/");
    setClasses(response.data || []);
  }

  async function loadTeachers() {
    const response = await API.get("/teachers/");
    setTeachers(response.data || []);
  }

  async function loadStudents() {
    const response = await API.get("/students/");
    setStudents(response.data || []);
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
        loadClasses(),
        loadTeachers(),
        loadStudents(),
        loadMasterDropdowns(activeLayout),
      ]);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load classes."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPageData();
  }, []);

  const classTeacherOptions = useMemo(() => {
    return teachers.filter((teacher) => Boolean(teacher.is_class_teacher));
  }, [teachers]);

  const teacherMap = useMemo(() => {
    const map = {};

    teachers.forEach((teacher) => {
      map[teacher.id] = getTeacherDisplayLabel(teacher);
    });

    return map;
  }, [teachers]);

  const studentCountMap = useMemo(() => {
    const map = {};

    students.forEach((student) => {
      if (student.class_id) {
        map[student.class_id] = (map[student.class_id] || 0) + 1;
        return;
      }

      const fallbackKey = `${student.class_name || ""}-${student.section || ""}`;
      map[fallbackKey] = (map[fallbackKey] || 0) + 1;
    });

    return map;
  }, [students]);

  const classOptions = useMemo(() => {
    return Array.from(
      new Set(classes.map((item) => item.class_name).filter(Boolean))
    );
  }, [classes]);

  const sectionOptions = useMemo(() => {
    const masterValues = dropdownValues.Section || [];
    const usedValues = classes.map((item) => item.section).filter(Boolean);

    return Array.from(new Set([...masterValues, ...usedValues]));
  }, [dropdownValues, classes]);

  function getStudentCount(classRecord) {
    if (!classRecord) return 0;

    if (classRecord.id && studentCountMap[classRecord.id] !== undefined) {
      return studentCountMap[classRecord.id];
    }

    const fallbackKey = `${classRecord.class_name || ""}-${
      classRecord.section || ""
    }`;

    return studentCountMap[fallbackKey] || 0;
  }

  function getClassTeacherName(classRecord) {
    if (!classRecord) return "-";

    if (
      classRecord.class_teacher_id &&
      teacherMap[classRecord.class_teacher_id]
    ) {
      return teacherMap[classRecord.class_teacher_id];
    }

    return classRecord.class_teacher || "-";
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
    updateFieldValue(field, type === "checkbox" ? checked : value);
  }

  function buildPayload() {
    return {
      class_name: formData.class_name || "",
      section: formData.section || "",
      class_teacher_id: formData.class_teacher_id
        ? Number(formData.class_teacher_id)
        : null,
      class_teacher: formData.class_teacher || "",
      room_no: formData.room_no || "",
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

  async function loadClassCustomFields(classId) {
    try {
      const values = await getModuleCustomFields(MODULE_NAME, classId);
      return convertApiCustomValuesToForm(values);
    } catch (error) {
      console.error("Unable to load class custom fields", error);
      return {};
    }
  }

  async function saveClassCustomFields(classId) {
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
      await saveModuleCustomFields(MODULE_NAME, classId, valuesToSave);
    }

    if (editingId && fieldsToDelete.length > 0) {
      await Promise.allSettled(
        fieldsToDelete.map((fieldKey) =>
          deleteModuleCustomField(MODULE_NAME, classId, fieldKey)
        )
      );
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage("");

    try {
      const payload = buildPayload();

      if (!payload.class_name) {
        setMessage("Class is required.");
        return;
      }

      if (!payload.section) {
        setMessage("Section is required.");
        return;
      }

      let savedClassId = editingId;

      if (editingId) {
        const response = await API.put(`/classes/${editingId}`, payload);
        savedClassId = response.data?.id || editingId;

        await saveClassCustomFields(savedClassId);
        setMessage("Class updated successfully.");
      } else {
        const response = await API.post("/classes/", payload);
        savedClassId = response.data?.id;

        if (savedClassId) {
          await saveClassCustomFields(savedClassId);
        }

        setMessage("Class added successfully.");
      }

      setFormData(emptyClassForm);
      setCustomFormData({});
      setEditingId(null);
      setPageMode("list");

      await Promise.all([loadClasses(), loadTeachers(), loadStudents()]);
    } catch (error) {
      console.error(error);
      setMessage(
        getApiErrorMessage(error, "Something went wrong while saving class.")
      );
    }
  }

  async function handleEdit(classRecord) {
    setEditingId(classRecord.id);
    setPageMode("form");

    setFormData({
      class_name: classRecord.class_name || "",
      section: classRecord.section || "",
      class_teacher_id: classRecord.class_teacher_id || "",
      class_teacher: getClassTeacherName(classRecord) || "",
      room_no: classRecord.room_no || "",
    });

    const customValues = await loadClassCustomFields(classRecord.id);
    setCustomFormData(customValues);

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleView(classRecord) {
    setSelectedClass(classRecord);

    const customValues = await loadClassCustomFields(classRecord.id);
    setSelectedClassCustomValues(customValues);
  }

  async function handleDelete(classId) {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this class?"
    );

    if (!confirmDelete) return;

    try {
      await deleteAllModuleCustomFields(MODULE_NAME, classId);
      await API.delete(`/classes/${classId}`);

      setMessage("Class deleted successfully.");
      setSelectedClass(null);
      setSelectedClassCustomValues({});

      await Promise.all([loadClasses(), loadTeachers(), loadStudents()]);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete class."));
    }
  }

  function handleCancelEdit() {
    setEditingId(null);
    setFormData(emptyClassForm);
    setCustomFormData({});
    setMessage("");
    setPageMode("list");
  }

  function handleAddClass() {
    setEditingId(null);
    setFormData(emptyClassForm);
    setCustomFormData({});
    setMessage("");
    setPageMode("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderField(field) {
    if (field.name === "class_teacher_id") {
      return (
        <select
          name="class_teacher_id"
          value={formData.class_teacher_id || ""}
          onChange={(e) => {
            const teacherId = e.target.value;

            const selectedTeacher = teachers.find(
              (teacher) => String(teacher.id) === String(teacherId)
            );

            setFormData((prev) => ({
              ...prev,
              class_teacher_id: teacherId,
              class_teacher: selectedTeacher
                ? getTeacherDisplayLabel(selectedTeacher)
                : "",
            }));
          }}
        >
          <option value="">Select Class Teacher</option>

          {classTeacherOptions.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>
              {getTeacherDisplayLabel(teacher)}
            </option>
          ))}
        </select>
      );
    }

    const value = getFieldValue(field);

    const commonProps = {
      name: field.name,
      value,
      onChange: (e) => handleFieldChange(field, e),
      required: Boolean(field.required),
      placeholder: field.placeholder || "",
    };

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

  const filteredClasses = classes.filter((classRecord) => {
    const classTeacher = getClassTeacherName(classRecord);

    const fullText = `
      ${classRecord.class_name}
      ${classRecord.section}
      ${classTeacher}
      ${classRecord.room_no}
    `.toLowerCase();

    const matchSearch = fullText.includes(searchText.toLowerCase());

    const matchClass = classFilter
      ? classRecord.class_name === classFilter
      : true;

    const matchSection = sectionFilter
      ? classRecord.section === sectionFilter
      : true;

    return matchSearch && matchClass && matchSection;
  });

  const assignedTeacherCount = classes.filter(
    (item) => Boolean(item.class_teacher_id) || Boolean(item.class_teacher)
  ).length;

  const customFields = getCustomFields();

  if (pageMode === "form") {
    return (
      <div className="management-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Class Management</p>
            <h2>{editingId ? "Edit Class" : "Add Class"}</h2>
            <p>This form is generated from the backend Classes layout.</p>
          </div>

          <button
            type="button"
            className="light-button"
            onClick={handleCancelEdit}
          >
            Back to Class Records
          </button>
        </section>

        {message && <div className="message-box">{message}</div>}

        <section className="form-panel">
          <div className="panel-header">
            <div>
              <h3>{editingId ? "Edit Class" : "Add Class"}</h3>
              <p>This form is generated from the backend Classes layout.</p>
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
                            <small className="custom-field-badge">
                              {" "}
                              Custom
                            </small>
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
                {editingId ? "Update Class" : "Add Class"}
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
          <p className="eyebrow">Class Management</p>
          <h2>Class Management</h2>
          <p>
            Manage classes, sections and class teacher lookup assignment.
          </p>
        </div>

        <div className="module-header-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => navigate("/classes/layout")}
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

          <button type="button" className="primary-button" onClick={handleAddClass}>
            <PlusCircle size={18} />
            Add Class
          </button>
        </div>
      </section>

      <section className="summary-strip report-summary-grid">
        <div className="summary-card">
          <BookOpen size={22} />
          <div>
            <span>Total Classes</span>
            <strong>{classes.length}</strong>
          </div>
        </div>

        <div className="summary-card">
          <Users size={22} />
          <div>
            <span>Total Students</span>
            <strong>{students.length}</strong>
          </div>
        </div>

        <div className="summary-card warning">
          <GraduationCap size={22} />
          <div>
            <span>Assigned Teachers</span>
            <strong>{assignedTeacherCount}</strong>
          </div>
        </div>

        <div className="summary-card">
          <BookOpen size={22} />
          <div>
            <span>Custom Fields</span>
            <strong>{customFields.length}</strong>
          </div>
        </div>
      </section>

      {message && <div className="message-box">{message}</div>}

      <section className="table-panel">
        <div className="table-toolbar">
          <div>
            <h3>Class Records</h3>
            <p>{filteredClasses.length} class record(s) found</p>
          </div>

          <div className="table-search">
            <Search size={17} />
            <input
              type="text"
              placeholder="Search class, section, teacher..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
        </div>

        <div className="filter-row sis-filter-row">
          <div className="form-field">
            <label>Class</label>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
            >
              <option value="">All Classes</option>

              {classOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Section</label>
            <select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
            >
              <option value="">All Sections</option>

              {sectionOptions.map((item) => (
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
              setClassFilter("");
              setSectionFilter("");
              setSearchText("");
            }}
          >
            Clear Filters
          </button>
        </div>

        {loading ? (
          <div className="loading-box">Loading classes...</div>
        ) : (
          <div className="table-wrapper">
            <table className="classic-table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Section</th>
                  <th>Class Teacher</th>
                  <th>Room No</th>
                  <th>Students</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredClasses.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="empty-table">
                      No class records found.
                    </td>
                  </tr>
                ) : (
                  filteredClasses.map((classRecord) => (
                    <tr key={classRecord.id}>
                      <td>{classRecord.class_name || "-"}</td>
                      <td>{classRecord.section || "-"}</td>
                      <td>{getClassTeacherName(classRecord)}</td>
                      <td>{classRecord.room_no || "-"}</td>
                      <td>{getStudentCount(classRecord)}</td>
                      <td>
                        <div className="action-buttons">
                          <button
                            type="button"
                            className="edit-button"
                            onClick={() =>
                              navigate(`/classes/${classRecord.id}`)
                            }
                            title="Open Class"
                          >
                            <Eye size={15} />
                          </button>

                          <button
                            type="button"
                            className="edit-button"
                            onClick={() => handleEdit(classRecord)}
                            title="Edit"
                          >
                            <Edit size={15} />
                          </button>

                          <button
                            type="button"
                            className="delete-button"
                            onClick={() => handleDelete(classRecord.id)}
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

      {selectedClass && (
        <div className="student-drawer-backdrop">
          <aside className="student-drawer">
            <button
              type="button"
              className="drawer-close"
              onClick={() => {
                setSelectedClass(null);
                setSelectedClassCustomValues({});
              }}
            >
              <X size={18} />
            </button>

            <div className="student-profile-head">
              <div className="student-avatar">
                <BookOpen size={42} />
              </div>

              <h3>
                {selectedClass.class_name || "-"} - Section{" "}
                {selectedClass.section || "-"}
              </h3>

              <p>{getClassTeacherName(selectedClass)}</p>
            </div>

            <div className="drawer-section">
              <h4>Class Information</h4>
              <p>Class: {selectedClass.class_name || "-"}</p>
              <p>Section: {selectedClass.section || "-"}</p>
              <p>Class Teacher: {getClassTeacherName(selectedClass)}</p>
              <p>Room No: {selectedClass.room_no || "-"}</p>
              <p>Students: {getStudentCount(selectedClass)}</p>
            </div>

            {customFields.length > 0 && (
              <div className="drawer-section">
                <h4>Custom Fields</h4>

                {customFields.map((field) => (
                  <p key={field.id}>
                    {field.label}:{" "}
                    {displayCustomValue(
                      field,
                      selectedClassCustomValues[field.name]
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
