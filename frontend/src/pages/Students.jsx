import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Edit,
  Trash2,
  PlusCircle,
  Search,
  RefreshCcw,
  X,
  UserRound,
  LayoutTemplate,
  Menu,
  SlidersHorizontal,
  ListFilter,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Pin,
  Filter,
  EyeOff,
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

const studentFilterFields = [
  ["admission_no", "Admission No"],
  ["roll_no", "Roll No"],
  ["first_name", "First Name"],
  ["last_name", "Last Name"],
  ["class_name", "Class"],
  ["section", "Section"],
  ["house", "House"],
  ["student_status", "Student Status"],
  ["gender", "Gender"],
  ["dob", "Date of Birth"],
  ["nationality", "Nationality"],
  ["blood_group", "Blood Group"],
  ["father_name", "Father Name"],
  ["mother_name", "Mother Name"],
  ["guardian_name", "Guardian Name"],
  ["guardian_phone", "Guardian Phone"],
  ["guardian_email", "Guardian Email"],
  ["transport_route", "Transport Route"],
  ["pickup_point", "Pickup Point"],
  ["passport_no", "Passport No"],
];

export default function Students() {
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [layout, setLayout] = useState(defaultStudentLayout);

  const [dropdownValues, setDropdownValues] = useState({});
  const [formData, setFormData] = useState(systemEmptyForm);
  const [customFormData, setCustomFormData] = useState({});

  const [pageMode, setPageMode] = useState("list");
  const [editingId, setEditingId] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedStudentCustomValues, setSelectedStudentCustomValues] =
    useState({});

  const [searchText, setSearchText] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [fieldFilters, setFieldFilters] = useState({});
  const [showFilters, setShowFilters] = useState(true);
  const [recordsPerPage, setRecordsPerPage] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [showColumnManager, setShowColumnManager] = useState(false);
  const [activeColumnMenu, setActiveColumnMenu] = useState(null);
  const [sortConfig, setSortConfig] = useState(null);
  const [pinnedColumns, setPinnedColumns] = useState([]);
  const [visibleColumns, setVisibleColumns] = useState([
    "admission_no",
    "student",
    "class",
    "section",
    "status",
    "guardian",
  ]);

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
      setPageMode("list");
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
    setPageMode("form");
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
    setPageMode("list");
    setMessage("");
  }

  function handleAddStudent() {
    setEditingId(null);
    setFormData(systemEmptyForm);
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

  function getStudentFilterValue(student, fieldName) {
    const value = student[fieldName];
    return value === null || value === undefined ? "" : String(value);
  }

  function updateFieldFilter(fieldName, patch) {
    setFieldFilters((prev) => ({
      ...prev,
      [fieldName]: {
        enabled: false,
        operator: "contains",
        value: "",
        ...(prev[fieldName] || {}),
        ...patch,
      },
    }));
  }

  function clearAllFilters() {
    setClassFilter("");
    setSectionFilter("");
    setStatusFilter("");
    setSearchText("");
    setFieldFilters({});
  }

  function matchesFieldFilters(student) {
    return Object.entries(fieldFilters).every(([fieldName, filter]) => {
      if (!filter?.enabled) return true;

      const filterValue = String(filter.value || "").trim().toLowerCase();
      if (!filterValue) return true;

      const studentValue = getStudentFilterValue(student, fieldName).toLowerCase();

      if (filter.operator === "is") return studentValue === filterValue;
      if (filter.operator === "starts") return studentValue.startsWith(filterValue);

      return studentValue.includes(filterValue);
    });
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

    return (
      matchSearch &&
      matchClass &&
      matchSection &&
      matchStatus &&
      matchesFieldFilters(student)
    );
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
  const studentListColumns = [
    ["admission_no", "Admission No"],
    ["student", "Student"],
    ["class", "Class"],
    ["section", "Section"],
    ["house", "House"],
    ["status", "Status"],
    ["guardian", "Guardian"],
    ["phone", "Phone"],
    ["transport", "Transport"],
  ];

  function toggleColumn(columnKey) {
    setVisibleColumns((prev) => {
      if (prev.includes(columnKey)) {
        return prev.length === 1
          ? prev
          : prev.filter((item) => item !== columnKey);
      }

      return [...prev, columnKey];
    });
  }

  function sortByColumn(columnKey, direction) {
    setSortConfig({ columnKey, direction });
    setActiveColumnMenu(null);
  }

  function togglePinnedColumn(columnKey) {
    setPinnedColumns((prev) =>
      prev.includes(columnKey)
        ? prev.filter((item) => item !== columnKey)
        : [...prev, columnKey]
    );
    setActiveColumnMenu(null);
  }

  function filterByColumn(columnKey) {
    const fieldNameMap = {
      student: "first_name",
      class: "class_name",
      status: "student_status",
      guardian: "guardian_name",
      phone: "guardian_phone",
      transport: "transport_route",
    };

    updateFieldFilter(fieldNameMap[columnKey] || columnKey, { enabled: true });
    setActiveColumnMenu(null);
  }

  function getColumnSortValue(student, columnKey) {
    if (columnKey === "student") {
      return `${student.first_name || ""} ${student.last_name || ""}`.trim();
    }

    if (columnKey === "class") {
      return `${student.class_name || ""} ${student.section || ""}`.trim();
    }

    const fieldNameMap = {
      status: "student_status",
      guardian: "guardian_name",
      phone: "guardian_phone",
      transport: "transport_route",
    };

    const value = student[fieldNameMap[columnKey] || columnKey];
    return value === null || value === undefined ? "" : String(value);
  }

  function renderStudentCell(student, columnKey) {
    const valueMap = {
      admission_no: student.admission_no || "-",
      student: `${student.first_name || ""} ${student.last_name || ""}`.trim() || "-",
      class: `${student.class_name || "-"} ${student.section || ""}`,
      section: student.section || "-",
      house: student.house || "-",
      guardian: student.guardian_name || "-",
      phone: student.guardian_phone || "-",
      transport: student.transport_route || "-",
    };

    if (columnKey === "status") {
      return (
        <span
          className={
            student.student_status === "Active"
              ? "status active"
              : "status warning"
          }
        >
          {student.student_status || "Active"}
        </span>
      );
    }

    return valueMap[columnKey] || "-";
  }

  const visibleStudentColumns = studentListColumns
    .filter(([key]) => visibleColumns.includes(key))
    .sort(([firstKey], [secondKey]) => {
      const firstPinned = pinnedColumns.includes(firstKey);
      const secondPinned = pinnedColumns.includes(secondKey);

      if (firstPinned && !secondPinned) return -1;
      if (!firstPinned && secondPinned) return 1;

      return 0;
    });

  const sortedStudents = [...filteredStudents].sort((firstStudent, secondStudent) => {
    if (!sortConfig) return 0;

    const firstValue = getColumnSortValue(
      firstStudent,
      sortConfig.columnKey
    ).toLowerCase();
    const secondValue = getColumnSortValue(
      secondStudent,
      sortConfig.columnKey
    ).toLowerCase();
    const result = firstValue.localeCompare(secondValue, undefined, {
      numeric: true,
      sensitivity: "base",
    });

    return sortConfig.direction === "desc" ? -result : result;
  });

  const totalPages = Math.max(1, Math.ceil(sortedStudents.length / recordsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * recordsPerPage;
  const pageEndIndex = Math.min(pageStartIndex + recordsPerPage, sortedStudents.length);
  const displayedStudents = sortedStudents.slice(pageStartIndex, pageEndIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchText, classFilter, sectionFilter, statusFilter, fieldFilters, recordsPerPage]);

  if (pageMode === "form") {
    return (
      <div className="management-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Student Management</p>
            <h2>{editingId ? "Edit Student" : "Add Student"}</h2>
            <p>
              {editingId
                ? "Update admission, academic, guardian, and profile details."
                : "Create a new student admission profile."}
            </p>
          </div>

          <div className="module-header-actions">
            <button
              type="button"
              className="light-button"
              onClick={handleCancelEdit}
            >
              <X size={17} />
              Back to List
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={loadBackendLayoutOnly}
            >
              <LayoutTemplate size={17} />
              Reload Layout
            </button>
          </div>
        </section>

        {message && <div className="message-box">{message}</div>}

        <section className="form-panel">
          <div className="panel-header">
            <div>
              <h3>{editingId ? "Edit Student Profile" : "Add Student Profile"}</h3>
              <p>Use this form to manage student profile details.</p>
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
    <div className="management-page students-list-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Student Management</p>
          <h2>Students</h2>
          <p>All student records in one place.</p>
        </div>

        <button type="button" className="primary-button" onClick={handleAddStudent}>
          <PlusCircle size={18} />
          Add Student
        </button>
      </section>

      {message && <div className="message-box">{message}</div>}

      <section className={showFilters ? "student-list-shell" : "student-list-shell filters-hidden"}>
        {showFilters && (
          <aside className="student-filter-panel">
            <div className="student-filter-section student-field-filter-section">
              <h4>Filter By Fields</h4>

              <div className="student-field-filter-list">
                {studentFilterFields.map(([fieldName, label]) => {
                  const filter = fieldFilters[fieldName] || {};
                  const enabled = Boolean(filter.enabled);

                  return (
                    <div className="student-field-filter" key={fieldName}>
                      <label className="student-field-filter-check">
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={(event) =>
                            updateFieldFilter(fieldName, {
                              enabled: event.target.checked,
                            })
                          }
                        />
                        <span>{label}</span>
                      </label>

                      {enabled && (
                        <div className="student-field-filter-controls">
                          <select
                            value={filter.operator || "contains"}
                            onChange={(event) =>
                              updateFieldFilter(fieldName, {
                                operator: event.target.value,
                              })
                            }
                          >
                            <option value="contains">contains</option>
                            <option value="is">is</option>
                            <option value="starts">starts with</option>
                          </select>

                          <input
                            type="text"
                            value={filter.value || ""}
                            placeholder={label}
                            onChange={(event) =>
                              updateFieldFilter(fieldName, {
                                value: event.target.value,
                              })
                            }
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              className="light-button student-clear-filters"
              onClick={clearAllFilters}
            >
              Clear Filters
            </button>
          </aside>
        )}

        <div className="student-list-main">
          <div className="student-table-card">
            {loading ? (
              <div className="loading-box">Loading students...</div>
            ) : (
              <div className="table-wrapper">
                <table className="classic-table student-list-table">
                  <thead>
                    <tr>
                      <th className="student-filter-toggle-cell">
                        <button
                          type="button"
                          className="student-grid-filter-toggle"
                          onClick={() => setShowFilters((prev) => !prev)}
                          title={showFilters ? "Hide filters" : "Show filters"}
                        >
                          <ListFilter size={17} />
                        </button>
                      </th>
                      {visibleStudentColumns
                        .map(([key, label]) => (
                          <th key={key}>
                            <div className="student-column-head">
                              <span>{label}</span>
                              <button
                                type="button"
                                className="student-column-menu-button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setActiveColumnMenu((current) =>
                                    current === key ? null : key
                                  );
                                  setShowColumnManager(false);
                                }}
                                title={`${label} options`}
                              >
                                <Menu size={16} />
                              </button>

                              {activeColumnMenu === key && (
                                <div className="student-column-menu">
                                  <button type="button" onClick={() => sortByColumn(key, "asc")}>
                                    <ArrowUp size={17} />
                                    Asc
                                  </button>
                                  <button type="button" onClick={() => sortByColumn(key, "desc")}>
                                    <ArrowDown size={17} />
                                    Desc
                                  </button>
                                  <button type="button" onClick={() => togglePinnedColumn(key)}>
                                    <Pin size={17} />
                                    {pinnedColumns.includes(key)
                                      ? "Unpin Column"
                                      : "Pin Column"}
                                  </button>
                                  <button type="button" onClick={() => filterByColumn(key)}>
                                    <Filter size={17} />
                                    Filter by
                                  </button>
                                  <button type="button" onClick={() => toggleColumn(key)}>
                                    <EyeOff size={17} />
                                    Hide Column
                                  </button>
                                </div>
                              )}
                            </div>
                          </th>
                        ))}
                      <th className="student-column-actions">
                        <div className="student-actions-head">
                          <span>Actions</span>
                          <div className="column-manager-wrap">
                            <button
                              type="button"
                              className="student-column-menu-button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setShowColumnManager((prev) => !prev);
                                setActiveColumnMenu(null);
                              }}
                              title="Manage columns"
                            >
                              <SlidersHorizontal size={16} />
                            </button>

                            {showColumnManager && (
                              <div className="column-manager-menu toolbar-column-menu">
                                <h4>Manage Columns</h4>
                                {studentListColumns.map(([key, label]) => (
                                  <label key={key}>
                                    <input
                                      type="checkbox"
                                      checked={visibleColumns.includes(key)}
                                      onChange={() => toggleColumn(key)}
                                    />
                                    <span>{label}</span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {displayedStudents.length === 0 ? (
                      <tr>
                        <td
                          colSpan={visibleColumns.length + 2}
                          className="empty-table"
                        >
                          No student records found.
                        </td>
                      </tr>
                    ) : (
                      displayedStudents.map((student) => (
                        <tr
                          key={student.id}
                          className="clickable-row"
                          onClick={() => navigate(`/students/${student.id}`)}
                        >
                          <td className="student-filter-toggle-cell" />
                          {visibleStudentColumns
                            .map(([key]) => (
                              <td key={key}>{renderStudentCell(student, key)}</td>
                            ))}
                          <td>
                            <div className="action-buttons">
                              <button
                                type="button"
                                className="edit-button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleEdit(student);
                                }}
                                title="Edit"
                              >
                                <Edit size={15} />
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
          </div>
        </div>
      </section>

      <section className="student-list-pagination">
        <div>
          <label className="student-record-size-control">
            <select
              value={recordsPerPage}
              onChange={(event) => setRecordsPerPage(Number(event.target.value))}
            >
              <option value={25}>25 Records Per Page</option>
              <option value={50}>50 Records Per Page</option>
              <option value={100}>100 Records Per Page</option>
              <option value={200}>200 Records Per Page</option>
            </select>
            <ChevronDown size={15} />
          </label>

          <span className="student-total-records">
            Total Count: <strong>{filteredStudents.length}</strong>
          </span>
        </div>

        <div>
          <span className="student-page-range">
            {sortedStudents.length === 0 ? 0 : pageStartIndex + 1} - {pageEndIndex}
          </span>
          <button
            type="button"
            className="student-page-arrow"
            title="Previous page"
            disabled={safeCurrentPage <= 1}
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            className="student-page-arrow"
            title="Next page"
            disabled={safeCurrentPage >= totalPages}
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </section>
    </div>
  );

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Student Management</p>
          <h2>Students</h2>
          <p>
            Manage admissions, profiles, class details, guardians, documents,
            transport, and residential information in one place.
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
              Use this form to add or update student admission and profile details.
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
