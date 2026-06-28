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
  CalendarCheck,
  LayoutTemplate,
} from "lucide-react";

import API from "../api";
import StudentPicker from "../components/StudentPicker";
import { getMasterValues } from "../services/masterDataService";
import { getModuleLayout } from "../services/moduleLayoutService";
import {
  getModuleCustomFields,
  saveModuleCustomFields,
  deleteModuleCustomField,
  deleteAllModuleCustomFields,
} from "../services/moduleCustomFieldService";
import { MODULE_CONFIGS } from "../config/moduleLayouts.js";

const MODULE_NAME = "Attendance";

const emptyAttendanceForm = {
  student_id: "",
  attendance_date: "",
  status: "Present",
  remarks: "",
};

const fallbackStatusOptions = [
  "Present",
  "Absent",
  "Late",
  "Half Day",
  "Leave",
  "Holiday",
];

export default function Attendance() {
  const navigate = useNavigate();

  const defaultLayout = MODULE_CONFIGS.Attendance.defaultLayout;

  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [students, setStudents] = useState([]);
  const [layout, setLayout] = useState(defaultLayout);

  const [dropdownValues, setDropdownValues] = useState({});
  const [formData, setFormData] = useState(emptyAttendanceForm);
  const [customFormData, setCustomFormData] = useState({});

  const [editingId, setEditingId] = useState(null);
  const [pageMode, setPageMode] = useState("list");
  const [selectedAttendance, setSelectedAttendance] = useState(null);
  const [selectedAttendanceCustomValues, setSelectedAttendanceCustomValues] =
    useState({});

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");

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
      console.error("Unable to load attendance layout", error);
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

  async function loadAttendance() {
    const response = await API.get("/attendance/");
    setAttendanceRecords(response.data || []);
  }

  async function loadStudents() {
    const response = await API.get("/students/");
    setStudents(response.data || []);
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

      await Promise.all([
        loadAttendance(),
        loadStudents(),
        loadMasterDropdowns(activeLayout),
      ]);
    } catch (error) {
      console.error(error);
      setMessage(
        error.response?.data?.detail || "Unable to load attendance records."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPageData();
  }, []);

  const studentMap = useMemo(() => {
    const map = {};

    students.forEach((student) => {
      map[student.id] = `${student.first_name || ""} ${
        student.last_name || ""
      }`.trim();
    });

    return map;
  }, [students]);

  const statusOptions = useMemo(() => {
    const masterValues = dropdownValues.AttendanceStatus || [];
    const usedValues = attendanceRecords
      .map((item) => item.status)
      .filter(Boolean);

    return Array.from(
      new Set([...fallbackStatusOptions, ...masterValues, ...usedValues])
    );
  }, [dropdownValues, attendanceRecords]);

  function getStudentName(studentId) {
    if (!studentId) return "-";

    return studentMap[studentId] || `Student ID: ${studentId}`;
  }

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
      ...formData,
      student_id: formData.student_id ? Number(formData.student_id) : null,
      attendance_date: formData.attendance_date || null,
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

  async function loadAttendanceCustomFields(attendanceId) {
    try {
      const values = await getModuleCustomFields(MODULE_NAME, attendanceId);
      return convertApiCustomValuesToForm(values);
    } catch (error) {
      console.error("Unable to load attendance custom fields", error);
      return {};
    }
  }

  async function saveAttendanceCustomFields(attendanceId) {
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
      await saveModuleCustomFields(MODULE_NAME, attendanceId, valuesToSave);
    }

    if (editingId && fieldsToDelete.length > 0) {
      await Promise.allSettled(
        fieldsToDelete.map((fieldKey) =>
          deleteModuleCustomField(MODULE_NAME, attendanceId, fieldKey)
        )
      );
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage("");

    try {
      const payload = buildPayload();

      if (!payload.student_id) {
        setMessage("Student is required.");
        return;
      }

      if (!payload.attendance_date) {
        setMessage("Attendance Date is required.");
        return;
      }

      if (!payload.status) {
        setMessage("Status is required.");
        return;
      }

      let savedAttendanceId = editingId;

      if (editingId) {
        const response = await API.put(`/attendance/${editingId}`, payload);
        savedAttendanceId = response.data?.id || editingId;
        await saveAttendanceCustomFields(savedAttendanceId);
        setMessage("Attendance updated successfully.");
      } else {
        const response = await API.post("/attendance/", payload);
        savedAttendanceId = response.data?.id;

        if (savedAttendanceId) {
          await saveAttendanceCustomFields(savedAttendanceId);
        }

        setMessage("Attendance added successfully.");
      }

      setFormData(emptyAttendanceForm);
      setCustomFormData({});
      setEditingId(null);
      setPageMode("list");
      await loadAttendance();
    } catch (error) {
      console.error(error);
      setMessage(
        error.response?.data?.detail ||
          "Something went wrong while saving attendance."
      );
    }
  }

  async function handleEdit(attendance) {
    setEditingId(attendance.id);
    setPageMode("form");

    setFormData({
      student_id: attendance.student_id || "",
      attendance_date: attendance.attendance_date || "",
      status: attendance.status || "Present",
      remarks: attendance.remarks || "",
    });

    const customValues = await loadAttendanceCustomFields(attendance.id);
    setCustomFormData(customValues);

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleView(attendance) {
    setSelectedAttendance(attendance);

    const customValues = await loadAttendanceCustomFields(attendance.id);
    setSelectedAttendanceCustomValues(customValues);
  }

  async function handleDelete(attendanceId) {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this attendance record?"
    );

    if (!confirmDelete) return;

    try {
      await deleteAllModuleCustomFields(MODULE_NAME, attendanceId);
      await API.delete(`/attendance/${attendanceId}`);

      setMessage("Attendance deleted successfully.");
      setSelectedAttendance(null);
      setSelectedAttendanceCustomValues({});
      await loadAttendance();
    } catch (error) {
      console.error(error);
      setMessage(
        error.response?.data?.detail || "Unable to delete attendance record."
      );
    }
  }

  function handleCancelEdit() {
    setEditingId(null);
    setFormData(emptyAttendanceForm);
    setCustomFormData({});
    setMessage("");
    setPageMode("list");
  }

  function handleAddAttendance() {
    setEditingId(null);
    setFormData(emptyAttendanceForm);
    setCustomFormData({});
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
    const statusText = String(status || "").toLowerCase();

    if (statusText === "present") return "status active";
    if (statusText === "absent") return "status danger";
    return "status warning";
  }

  const filteredAttendance = attendanceRecords.filter((attendance) => {
    const studentName = getStudentName(attendance.student_id);

    const fullText = `
      ${studentName}
      ${attendance.student_id}
      ${attendance.attendance_date}
      ${attendance.status}
      ${attendance.remarks}
    `.toLowerCase();

    const matchSearch = fullText.includes(searchText.toLowerCase());
    const matchStatus = statusFilter
      ? attendance.status === statusFilter
      : true;
    const matchDate = dateFilter
      ? attendance.attendance_date === dateFilter
      : true;

    return matchSearch && matchStatus && matchDate;
  });

  const presentCount = attendanceRecords.filter(
    (item) => String(item.status || "").toLowerCase() === "present"
  ).length;

  const absentCount = attendanceRecords.filter(
    (item) => String(item.status || "").toLowerCase() === "absent"
  ).length;

  const lateCount = attendanceRecords.filter(
    (item) => String(item.status || "").toLowerCase() === "late"
  ).length;

  const customFields = getCustomFields();

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Attendance Management</p>
          <h2>Attendance Management</h2>
          <p>
            Manage attendance records using the Attendance module layout saved
            in backend.
          </p>
        </div>

        <div className="module-header-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => navigate("/attendance/layout")}
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

          <button type="button" className="primary-button" onClick={handleAddAttendance}>
            <PlusCircle size={18} />
            Add Attendance
          </button>
        </div>
      </section>

      <section className="summary-strip report-summary-grid">
        <div className="summary-card">
          <CalendarCheck size={22} />
          <div>
            <span>Total Records</span>
            <strong>{attendanceRecords.length}</strong>
          </div>
        </div>

        <div className="summary-card">
          <CalendarCheck size={22} />
          <div>
            <span>Present</span>
            <strong>{presentCount}</strong>
          </div>
        </div>

        <div className="summary-card warning">
          <CalendarCheck size={22} />
          <div>
            <span>Absent</span>
            <strong>{absentCount}</strong>
          </div>
        </div>

        <div className="summary-card">
          <CalendarCheck size={22} />
          <div>
            <span>Late</span>
            <strong>{lateCount}</strong>
          </div>
        </div>
      </section>

      {message && <div className="message-box">{message}</div>}

      {pageMode === "form" && (
      <section className="form-panel">
        <div className="panel-header">
          <div>
            <h3>{editingId ? "Edit Attendance" : "Add Attendance"}</h3>
            <p>This form is generated from the backend Attendance layout.</p>
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
                  {section.fields.map((field) =>
                    field.name === "student_id" ? (
                      <StudentPicker
                        key={field.id}
                        students={students}
                        value={getFieldValue(field)}
                        onChange={(event) => handleFieldChange(field, event)}
                        required={Boolean(field.required)}
                        label={`${field.label}${field.required ? " *" : ""}`}
                      />
                    ) : (
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
                    )
                  )}
                </div>
              )}
            </div>
          ))}

          <div className="form-actions">
            <button type="submit" className="primary-button">
              <PlusCircle size={18} />
              {editingId ? "Update Attendance" : "Add Attendance"}
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

      {pageMode === "list" && (
      <section className="table-panel">
        <div className="table-toolbar">
          <div>
            <h3>Attendance Records</h3>
            <p>{filteredAttendance.length} attendance record(s) found</p>
          </div>

          <div className="table-search">
            <Search size={17} />
            <input
              type="text"
              placeholder="Search student, status, remarks..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
        </div>

        <div className="filter-row sis-filter-row">
          <div className="form-field">
            <label>Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Status</option>
              {statusOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Date</label>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="light-button"
            onClick={() => {
              setStatusFilter("");
              setDateFilter("");
              setSearchText("");
            }}
          >
            Clear Filters
          </button>
        </div>

        {loading ? (
          <div className="loading-box">Loading attendance...</div>
        ) : (
          <div className="table-wrapper">
            <table className="classic-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Remarks</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredAttendance.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="empty-table">
                      No attendance records found.
                    </td>
                  </tr>
                ) : (
                  filteredAttendance.map((attendance) => (
                    <tr key={attendance.id}>
                      <td>{getStudentName(attendance.student_id)}</td>
                      <td>{attendance.attendance_date || "-"}</td>
                      <td>
                        <span className={getStatusClass(attendance.status)}>
                          {attendance.status || "-"}
                        </span>
                      </td>
                      <td>{attendance.remarks || "-"}</td>
                      <td>
                        <div className="action-buttons">
                          <button
                            type="button"
                            className="edit-button"
                            onClick={() => handleView(attendance)}
                            title="View"
                          >
                            <Eye size={15} />
                          </button>

                          <button
                            type="button"
                            className="edit-button"
                            onClick={() => handleEdit(attendance)}
                            title="Edit"
                          >
                            <Edit size={15} />
                          </button>

                          <button
                            type="button"
                            className="delete-button"
                            onClick={() => handleDelete(attendance.id)}
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

      {selectedAttendance && (
        <div className="student-drawer-backdrop">
          <aside className="student-drawer">
            <button
              type="button"
              className="drawer-close"
              onClick={() => {
                setSelectedAttendance(null);
                setSelectedAttendanceCustomValues({});
              }}
            >
              <X size={18} />
            </button>

            <div className="student-profile-head">
              <div className="student-avatar">
                <CalendarCheck size={42} />
              </div>

              <h3>{getStudentName(selectedAttendance.student_id)}</h3>

              <p>{selectedAttendance.attendance_date || "-"}</p>
            </div>

            <div className="drawer-section">
              <h4>Attendance Information</h4>
              <p>Student: {getStudentName(selectedAttendance.student_id)}</p>
              <p>Date: {selectedAttendance.attendance_date || "-"}</p>
              <p>Status: {selectedAttendance.status || "-"}</p>
              <p>Remarks: {selectedAttendance.remarks || "-"}</p>
            </div>

            {customFields.length > 0 && (
              <div className="drawer-section">
                <h4>Custom Fields</h4>

                {customFields.map((field) => (
                  <p key={field.id}>
                    {field.label}:{" "}
                    {displayCustomValue(
                      field,
                      selectedAttendanceCustomValues[field.name]
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
