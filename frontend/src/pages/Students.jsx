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
  UserRound,
  LayoutTemplate,
} from "lucide-react";
import API from "../api";
import { getMasterValues } from "../services/masterDataService";
import { getModuleLayout } from "../services/moduleLayoutService";


const MODULE_NAME = "Students";
const LEGACY_STORAGE_KEY = "student_form_layout_v1";

const systemEmptyForm = {
  admission_no: "",
  roll_no: "",
  class_name: "",
  section: "",
  house: "",
  admission_date: "",
  student_status: "Active",
  class_id: "",
  first_name: "",
  last_name: "",
  gender: "",
  dob: "",
  nationality: "",
  blood_group: "",
  photo_url: "",

  father_name: "",
  mother_name: "",
  guardian_name: "",
  guardian_phone: "",
  guardian_email: "",

  medical_notes: "",
  allergies: "",

  transport_route: "",
  pickup_point: "",

  birth_certificate: "",
  transfer_certificate: "",
  passport_no: "",
};

const defaultClassOptions = [
  "Nursery",
  "LKG",
  "UKG",
  "Class 1",
  "Class 2",
  "Class 3",
  "Class 4",
  "Class 5",
  "Class 6",
  "Class 7",
  "Class 8",
  "Class 9",
  "Class 10",
  "Class 11",
  "Class 12",
];

const defaultStudentLayout = [
  {
    id: "academic_info",
    title: "Academic Information",
    fields: [
      {
        id: "field_admission_no",
        name: "admission_no",
        label: "Admission No",
        type: "singleline",
        required: true,
        source: "system",
        placeholder: "ADM001",
      },
      {
        id: "field_roll_no",
        name: "roll_no",
        label: "Roll No",
        type: "singleline",
        required: false,
        source: "system",
        placeholder: "12",
      },
      {
        id: "field_class_name",
        name: "class_name",
        label: "Class",
        type: "picklist",
        required: false,
        source: "system",
      },
      {
        id: "field_section",
        name: "section",
        label: "Section",
        type: "picklist",
        required: false,
        source: "system",
        masterCategory: "Section",
      },
      {
        id: "field_house",
        name: "house",
        label: "House",
        type: "picklist",
        required: false,
        source: "system",
        masterCategory: "House",
      },
      {
        id: "field_admission_date",
        name: "admission_date",
        label: "Admission Date",
        type: "date",
        required: false,
        source: "system",
      },
      {
        id: "field_student_status",
        name: "student_status",
        label: "Student Status",
        type: "picklist",
        required: false,
        source: "system",
        masterCategory: "StudentStatus",
      },
    ],
  },
  {
    id: "personal_info",
    title: "Personal Information",
    fields: [
      {
        id: "field_first_name",
        name: "first_name",
        label: "First Name",
        type: "singleline",
        required: true,
        source: "system",
        placeholder: "Rahul",
      },
      {
        id: "field_last_name",
        name: "last_name",
        label: "Last Name",
        type: "singleline",
        required: false,
        source: "system",
        placeholder: "Das",
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
        id: "field_dob",
        name: "dob",
        label: "Date of Birth",
        type: "date",
        required: false,
        source: "system",
      },
      {
        id: "field_nationality",
        name: "nationality",
        label: "Nationality",
        type: "picklist",
        required: false,
        source: "system",
        masterCategory: "Nationality",
      },
      {
        id: "field_blood_group",
        name: "blood_group",
        label: "Blood Group",
        type: "picklist",
        required: false,
        source: "system",
        masterCategory: "BloodGroup",
      },
      {
        id: "field_photo_url",
        name: "photo_url",
        label: "Photo URL",
        type: "url",
        required: false,
        source: "system",
        placeholder: "https://...",
      },
    ],
  },
  {
    id: "guardian_info",
    title: "Parent / Guardian Information",
    fields: [
      {
        id: "field_father_name",
        name: "father_name",
        label: "Father Name",
        type: "singleline",
        required: false,
        source: "system",
      },
      {
        id: "field_mother_name",
        name: "mother_name",
        label: "Mother Name",
        type: "singleline",
        required: false,
        source: "system",
      },
      {
        id: "field_guardian_name",
        name: "guardian_name",
        label: "Guardian Name",
        type: "singleline",
        required: false,
        source: "system",
      },
      {
        id: "field_guardian_phone",
        name: "guardian_phone",
        label: "Guardian Phone",
        type: "phone",
        required: false,
        source: "system",
      },
      {
        id: "field_guardian_email",
        name: "guardian_email",
        label: "Guardian Email",
        type: "email",
        required: false,
        source: "system",
      },
    ],
  },
  {
    id: "health_transport",
    title: "Health & Transport",
    fields: [
      {
        id: "field_medical_notes",
        name: "medical_notes",
        label: "Medical Notes",
        type: "multiline",
        required: false,
        source: "system",
      },
      {
        id: "field_allergies",
        name: "allergies",
        label: "Allergies",
        type: "multiline",
        required: false,
        source: "system",
      },
      {
        id: "field_transport_route",
        name: "transport_route",
        label: "Transport Route",
        type: "picklist",
        required: false,
        source: "system",
        masterCategory: "TransportRoute",
      },
      {
        id: "field_pickup_point",
        name: "pickup_point",
        label: "Pickup Point",
        type: "singleline",
        required: false,
        source: "system",
      },
    ],
  },
  {
    id: "documents",
    title: "Documents",
    fields: [
      {
        id: "field_birth_certificate",
        name: "birth_certificate",
        label: "Birth Certificate",
        type: "singleline",
        required: false,
        source: "system",
      },
      {
        id: "field_transfer_certificate",
        name: "transfer_certificate",
        label: "Transfer Certificate",
        type: "singleline",
        required: false,
        source: "system",
      },
      {
        id: "field_passport_no",
        name: "passport_no",
        label: "Passport No",
        type: "singleline",
        required: false,
        source: "system",
      },
    ],
  },
];

export default function Students() {
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [layout, setLayout] = useState(defaultStudentLayout);

  const [dropdownValues, setDropdownValues] = useState({});
  const [formData, setFormData] = useState(systemEmptyForm);
  const [customFormData, setCustomFormData] = useState({});

  const [editingId, setEditingId] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedStudentCustomValues, setSelectedStudentCustomValues] =
    useState({});

  const [searchText, setSearchText] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  function getLegacyLocalLayout() {
    const savedLayout = localStorage.getItem(LEGACY_STORAGE_KEY);

    if (!savedLayout) return null;

    try {
      const parsed = JSON.parse(savedLayout);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }


  async function loadClasses() {
    const response = await API.get("/classes/");
    setClasses(response.data || []);
  }
  async function getActiveLayout() {
    try {
      const backendLayout = await getModuleLayout(MODULE_NAME);

      if (backendLayout && Array.isArray(backendLayout)) {
        return backendLayout;
      }

      const legacyLayout = getLegacyLocalLayout();

      if (legacyLayout) {
        return legacyLayout;
      }

      return defaultStudentLayout;
    } catch (error) {
      console.error("Unable to load module layout", error);

      const legacyLayout = getLegacyLocalLayout();

      if (legacyLayout) {
        return legacyLayout;
      }

      return defaultStudentLayout;
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

      await Promise.all([loadStudents(), loadClasses(), loadMasterDropdowns(activeLayout)]);
    } catch (error) {
      console.error(error);
      setMessage(error.response?.data?.detail || "Unable to load students.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPageData();
  }, []);

  const classOptions = useMemo(() => {
    const existingClasses = students
      .map((student) => student.class_name)
      .filter(Boolean);

    return Array.from(new Set([...defaultClassOptions, ...existingClasses]));
  }, [students]);

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
      class_id: formData.class_id ? Number(formData.class_id) : null,
      class_name: formData.class_name || "",
      section: formData.section || "",
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

  async function loadStudentCustomFields(studentId) {
    try {
      const response = await API.get(`/students/${studentId}/custom-fields`);
      return convertApiCustomValuesToForm(response.data || []);
    } catch (error) {
      console.error("Unable to load custom fields", error);
      return {};
    }
  }

  async function saveStudentCustomFields(studentId) {
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
      await API.post(`/students/${studentId}/custom-fields`, {
        values: valuesToSave,
      });
    }

    if (editingId && fieldsToDelete.length > 0) {
      await Promise.allSettled(
        fieldsToDelete.map((fieldKey) =>
          API.delete(
            `/students/${studentId}/custom-fields/${encodeURIComponent(
              fieldKey
            )}`
          )
        )
      );
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage("");

    try {
      const payload = buildPayload();

      if (!payload.admission_no) {
        setMessage("Admission No is required.");
        return;
      }

      if (!payload.first_name) {
        setMessage("First Name is required.");
        return;
      }

      let savedStudentId = editingId;

      if (editingId) {
        const response = await API.put(`/students/${editingId}`, payload);
        savedStudentId = response.data?.id || editingId;
        await saveStudentCustomFields(savedStudentId);
        setMessage("Student updated successfully.");
      } else {
        const response = await API.post("/students/", payload);
        savedStudentId = response.data?.id;

        if (savedStudentId) {
          await saveStudentCustomFields(savedStudentId);
        }

        setMessage("Student added successfully.");
      }

      setFormData(systemEmptyForm);
      setCustomFormData({});
      setEditingId(null);
      await loadStudents();
    } catch (error) {
      console.error(error);
      setMessage(
        error.response?.data?.detail ||
          "Something went wrong while saving student."
      );
    }
  }

  async function handleEdit(student) {
    setEditingId(student.id);

    setFormData({
      admission_no: student.admission_no || "",
      roll_no: student.roll_no || "",
      class_id: student.class_id || "",
      class_name: student.class_name || "",
      section: student.section || "",
      house: student.house || "",
      admission_date: student.admission_date || "",
      student_status: student.student_status || "Active",

      first_name: student.first_name || "",
      last_name: student.last_name || "",
      gender: student.gender || "",
      dob: student.dob || "",
      nationality: student.nationality || "",
      blood_group: student.blood_group || "",
      photo_url: student.photo_url || "",

      father_name: student.father_name || "",
      mother_name: student.mother_name || "",
      guardian_name: student.guardian_name || "",
      guardian_phone: student.guardian_phone || "",
      guardian_email: student.guardian_email || "",

      medical_notes: student.medical_notes || "",
      allergies: student.allergies || "",

      transport_route: student.transport_route || "",
      pickup_point: student.pickup_point || "",

      birth_certificate: student.birth_certificate || "",
      transfer_certificate: student.transfer_certificate || "",
      passport_no: student.passport_no || "",
    });

    const customValues = await loadStudentCustomFields(student.id);
    setCustomFormData(customValues);

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleView(student) {
    setSelectedStudent(student);

    const customValues = await loadStudentCustomFields(student.id);
    setSelectedStudentCustomValues(customValues);
  }

  async function handleDelete(studentId) {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this student? Custom field values will also be removed."
    );

    if (!confirmDelete) return;

    try {
      await API.delete(`/students/${studentId}`);
      setMessage("Student deleted successfully.");
      setSelectedStudent(null);
      setSelectedStudentCustomValues({});
      await loadStudents();
    } catch (error) {
      console.error(error);
      setMessage(error.response?.data?.detail || "Unable to delete student.");
    }
  }

  function handleCancelEdit() {
    setEditingId(null);
    setFormData(systemEmptyForm);
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

    if (field.name === "class_name" || field.name === "class_id") {
      return (
        <select
          name="class_id"
          value={formData.class_id || ""}
          required={Boolean(field.required)}
          onChange={(e) => {
            const selectedClassId = e.target.value;

            const selectedClass = classes.find(
              (item) => String(item.id) === String(selectedClassId)
            );

            setFormData((prev) => ({
              ...prev,
              class_id: selectedClassId,
              class_name: selectedClass?.class_name || "",
              section: selectedClass?.section || "",
            }));
          }}
        >
          <option value="">Select Class</option>

          {classes.map((classItem) => (
            <option key={classItem.id} value={classItem.id}>
              {classItem.class_name} - Section {classItem.section}
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
              {field.name === "section" ? `Section ${item}` : item}
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

  const filteredStudents = students.filter((student) => {
    const fullText = `
      ${student.admission_no}
      ${student.roll_no}
      ${student.first_name}
      ${student.last_name}
      ${student.class_name}
      ${student.section}
      ${student.house}
      ${student.student_status}
      ${student.gender}
      ${student.nationality}
      ${student.blood_group}
      ${student.father_name}
      ${student.mother_name}
      ${student.guardian_name}
      ${student.guardian_phone}
      ${student.guardian_email}
      ${student.transport_route}
      ${student.pickup_point}
    `.toLowerCase();

    const matchSearch = fullText.includes(searchText.toLowerCase());
    const matchClass = classFilter ? student.class_name === classFilter : true;
    const matchSection = sectionFilter ? student.section === sectionFilter : true;
    const matchStatus = statusFilter
      ? student.student_status === statusFilter
      : true;

    return matchSearch && matchClass && matchSection && matchStatus;
  });

  const activeCount = students.filter(
    (student) => student.student_status === "Active"
  ).length;

  const transportCount = students.filter(
    (student) => student.transport_route
  ).length;

  const internationalCount = students.filter(
    (student) =>
      student.nationality &&
      student.nationality.toLowerCase() !== "indian" &&
      student.nationality.toLowerCase() !== "india"
  ).length;

  const sectionFilterOptions = dropdownValues.Section || [];
  const statusFilterOptions = dropdownValues.StudentStatus || [];
  const customFields = getCustomFields();

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Student Information System</p>
          <h2>Student Information System</h2>
          <p>
            Manage student profiles using the Student module layout saved in
            backend.
          </p>
        </div>

        <div className="module-header-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => navigate("/students/layout")}
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
          <UserRound size={22} />
          <div>
            <span>Total Students</span>
            <strong>{students.length}</strong>
          </div>
        </div>

        <div className="summary-card">
          <UserRound size={22} />
          <div>
            <span>Active Students</span>
            <strong>{activeCount}</strong>
          </div>
        </div>

        <div className="summary-card">
          <UserRound size={22} />
          <div>
            <span>International Students</span>
            <strong>{internationalCount}</strong>
          </div>
        </div>

        <div className="summary-card warning">
          <UserRound size={22} />
          <div>
            <span>Transport Users</span>
            <strong>{transportCount}</strong>
          </div>
        </div>
      </section>

      {message && <div className="message-box">{message}</div>}

      <section className="form-panel">
        <div className="panel-header">
          <div>
            <h3>{editingId ? "Edit Student Profile" : "Add Student Profile"}</h3>
            <p>
              This form is generated from the backend Student layout.
            </p>
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
              {editingId ? "Update Student" : "Add Student"}
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
            <h3>Student Records</h3>
            <p>{filteredStudents.length} student record(s) found</p>
          </div>

          <div className="table-search">
            <Search size={17} />
            <input
              type="text"
              placeholder="Search admission, name, class, guardian..."
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
              {sectionFilterOptions.map((item) => (
                <option key={item} value={item}>
                  Section {item}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Status</option>
              {statusFilterOptions.map((item) => (
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
              setStatusFilter("");
              setSearchText("");
            }}
          >
            Clear Filters
          </button>
        </div>

        {loading ? (
          <div className="loading-box">Loading students...</div>
        ) : (
          <div className="table-wrapper">
            <table className="classic-table">
              <thead>
                <tr>
                  <th>Admission No</th>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Section</th>
                  <th>House</th>
                  <th>Status</th>
                  <th>Guardian</th>
                  <th>Phone</th>
                  <th>Transport</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="empty-table">
                      No student records found.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((student) => (
                    <tr key={student.id}>
                      <td>{student.admission_no}</td>
                      <td>
                        {student.first_name} {student.last_name}
                      </td>
                      <td>
                        {student.class_id ? (
                          <button
                            type="button"
                            className="text-link-button"
                            onClick={() => navigate(`/classes/${student.class_id}`)}
                          >
                            {student.class_name || "Class"} {student.section || ""}
                          </button>
                        ) : (
                          `${student.class_name || "-"} ${student.section || ""}`
                        )}
                      </td>
                      <td>{student.section || "-"}</td>
                      <td>{student.house || "-"}</td>
                      <td>
                        <span
                          className={
                            student.student_status === "Active"
                              ? "status active"
                              : "status warning"
                          }
                        >
                          {student.student_status || "Active"}
                        </span>
                      </td>
                      <td>{student.guardian_name || "-"}</td>
                      <td>{student.guardian_phone || "-"}</td>
                      <td>{student.transport_route || "-"}</td>
                      <td>
                        <div className="action-buttons">
                          <button
                            type="button"
                            className="edit-button"
                            onClick={() => navigate(`/students/${student.id}`)}
                            title="View profile"
                          >
                            <Eye size={15} />
                          </button>

                          <button
                            type="button"
                            className="edit-button"
                            onClick={() => handleEdit(student)}
                            title="Edit"
                          >
                            <Edit size={15} />
                          </button>

                          <button
                            type="button"
                            className="delete-button"
                            onClick={() => handleDelete(student.id)}
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

      {selectedStudent && (
        <div className="student-drawer-backdrop">
          <aside className="student-drawer">
            <button
              type="button"
              className="drawer-close"
              onClick={() => {
                setSelectedStudent(null);
                setSelectedStudentCustomValues({});
              }}
            >
              <X size={18} />
            </button>

            <div className="student-profile-head">
              <div className="student-avatar">
                {selectedStudent.photo_url ? (
                  <img src={selectedStudent.photo_url} alt="Student" />
                ) : (
                  <UserRound size={42} />
                )}
              </div>

              <h3>
                {selectedStudent.first_name} {selectedStudent.last_name}
              </h3>

              <p>{selectedStudent.admission_no}</p>

              <span className="status active">
                {selectedStudent.student_status || "Active"}
              </span>
            </div>

            <div className="drawer-section">
              <h4>Academic</h4>
              <p>Class: {selectedStudent.class_name || "-"}</p>
              <p>Section: {selectedStudent.section || "-"}</p>
              <p>House: {selectedStudent.house || "-"}</p>
              <p>Roll No: {selectedStudent.roll_no || "-"}</p>
            </div>

            <div className="drawer-section">
              <h4>Personal</h4>
              <p>DOB: {selectedStudent.dob || "-"}</p>
              <p>Gender: {selectedStudent.gender || "-"}</p>
              <p>Nationality: {selectedStudent.nationality || "-"}</p>
              <p>Blood Group: {selectedStudent.blood_group || "-"}</p>
            </div>

            <div className="drawer-section">
              <h4>Guardian</h4>
              <p>Father: {selectedStudent.father_name || "-"}</p>
              <p>Mother: {selectedStudent.mother_name || "-"}</p>
              <p>Guardian: {selectedStudent.guardian_name || "-"}</p>
              <p>Phone: {selectedStudent.guardian_phone || "-"}</p>
              <p>Email: {selectedStudent.guardian_email || "-"}</p>
            </div>

            <div className="drawer-section">
              <h4>Health</h4>
              <p>Medical Notes: {selectedStudent.medical_notes || "-"}</p>
              <p>Allergies: {selectedStudent.allergies || "-"}</p>
            </div>

            <div className="drawer-section">
              <h4>Transport</h4>
              <p>Route: {selectedStudent.transport_route || "-"}</p>
              <p>Pickup: {selectedStudent.pickup_point || "-"}</p>
            </div>

            {customFields.length > 0 && (
              <div className="drawer-section">
                <h4>Custom Fields</h4>

                {customFields.map((field) => (
                  <p key={field.id}>
                    {field.label}:{" "}
                    {displayCustomValue(
                      field,
                      selectedStudentCustomValues[field.name]
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