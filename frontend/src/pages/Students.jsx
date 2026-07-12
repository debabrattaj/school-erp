import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Edit,
  Trash2,
  PlusCircle,
  Search,
  X,
  UserRound,
  Menu,
  SlidersHorizontal,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  ArrowUp,
  ArrowDown,
  Pin,
  Filter,
  EyeOff,
  Upload,
  Download,
} from "lucide-react";
import API from "../api";
import PhotoUploadField from "../components/PhotoUploadField";
import { resolveFileUrl } from "../utils/files";
import { useT } from "../i18n";
import { getMasterValues } from "../services/masterDataService";
import { getModuleLayout } from "../services/moduleLayoutService";

const MODULE_NAME = "Students";
const LEGACY_STORAGE_KEY = "student_form_layout_v1";

const systemEmptyForm = {
  admission_no: "",
  roll_no: "",
  roll_no_mode: "auto",
  class_name: "",
  section: "",
  house: "",
  admission_date: "",
  student_status: "Active",
  residential_type: "Day Scholar",
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
        id: "field_roll_no",
        name: "roll_no",
        label: "Roll No",
        type: "singleline",
        required: false,
        source: "system",
        placeholder: "12",
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
      {
        id: "field_residential_type",
        name: "residential_type",
        label: "Residential Type",
        type: "picklist",
        required: false,
        source: "system",
        masterCategory: "ResidentialType",
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
  ["residential_type", "Residential Type"],
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
  const t = useT();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const editStudentId = searchParams.get("edit");
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
  const [showFilters, setShowFilters] = useState(false);
  const [recordsPerPage, setRecordsPerPage] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [showColumnManager, setShowColumnManager] = useState(false);
  const [showStudentActions, setShowStudentActions] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
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
    "actions",
  ]);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkImportFile, setBulkImportFile] = useState(null);
  const [bulkImportResult, setBulkImportResult] = useState(null);
  const [bulkImportBusy, setBulkImportBusy] = useState(false);

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

  async function loadStudents() {
    const response = await API.get("/students/");
    setStudents(response.data || []);
  }

  async function downloadImportTemplate() {
    try {
      const response = await API.get("/students/bulk-import-template", { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: "text/csv" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "students_import_template.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      setMessage("Unable to download the import template.");
    }
  }

  async function submitBulkImport(dryRun) {
    if (!bulkImportFile) return;
    setBulkImportBusy(true);
    setBulkImportResult(null);
    try {
      const form = new FormData();
      form.append("file", bulkImportFile);
      const response = await API.post(
        `/students/bulk-import?dry_run=${dryRun}`,
        form,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      setBulkImportResult(response.data);
      if (!dryRun && response.data.created > 0) {
        await loadStudents();
      }
    } catch (error) {
      console.error(error);
      setBulkImportResult({
        errors: [{ row: "-", error: error.response?.data?.detail || "Import failed." }],
      });
    } finally {
      setBulkImportBusy(false);
    }
  }

  function closeBulkImport() {
    setShowBulkImport(false);
    setBulkImportFile(null);
    setBulkImportResult(null);
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

  useEffect(() => {
    if (!message) return undefined;

    const timeoutId = window.setTimeout(() => {
      setMessage("");
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  useEffect(() => {
    if (!editStudentId || loading || students.length === 0) return;

    const studentToEdit = students.find(
      (student) => String(student.id) === String(editStudentId)
    );

    if (!studentToEdit) return;

    handleEdit(studentToEdit);
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams);
      nextParams.delete("edit");
      return nextParams;
    }, { replace: true });
  }, [editStudentId, loading, students, setSearchParams]);

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

  async function handleRollNoModeChange(mode) {
    if (mode === "auto") {
      if (!formData.class_id) {
        setFormData((prev) => ({ ...prev, roll_no_mode: mode, roll_no: "" }));
        return;
      }
      try {
        const response = await API.get("/students/next-roll-no", {
          params: { class_id: formData.class_id },
        });
        setFormData((prev) => ({
          ...prev,
          roll_no_mode: mode,
          roll_no: response.data?.roll_no || "",
        }));
      } catch {
        setFormData((prev) => ({ ...prev, roll_no_mode: mode, roll_no: "" }));
      }
    } else {
      setFormData((prev) => ({ ...prev, roll_no_mode: mode }));
    }
  }

  function buildPayload() {
    return {
      ...formData,
      class_id: formData.class_id ? Number(formData.class_id) : null,
      class_name: formData.class_name || "",
      section: formData.section || "",
      admission_date: formData.admission_date || null,
      dob: formData.dob || null,
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
      const detail = error.response?.data?.detail;
      const readable = Array.isArray(detail)
        ? detail.map((item) => item.msg || JSON.stringify(item)).join(" | ")
        : detail;
      setMessage(readable || "Something went wrong while saving student.");
    }
  }

  async function handleEdit(student) {
    setPageMode("form");
    setEditingId(student.id);

    setFormData({
      admission_no: student.admission_no || "",
      roll_no: student.roll_no || "",
      roll_no_mode: "manual",
      class_id: student.class_id || "",
      class_name: student.class_name || "",
      section: student.section || "",
      house: student.house || "",
      admission_date: student.admission_date || "",
      student_status: student.student_status || "Active",
      residential_type: student.residential_type || "Day Scholar",

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

  function renderRollNoModeToggle() {
    const isManual = formData.roll_no_mode === "manual";

    return (
      <div className="roll-mode-switch">
        <span className={isManual ? "" : "active"}>Auto</span>
        <button
          type="button"
          role="switch"
          aria-checked={isManual}
          className="roll-mode-slider"
          onClick={() => handleRollNoModeChange(isManual ? "auto" : "manual")}
        >
          <span className="roll-mode-slider-knob" />
        </button>
        <span className={isManual ? "active" : ""}>Manual</span>
      </div>
    );
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

    if (field.name === "photo_url") {
      return (
        <PhotoUploadField
          value={value}
          onChange={(url) => updateFieldValue(field, url)}
        />
      );
    }

    if (field.name === "roll_no") {
      const isAuto = (formData.roll_no_mode || "auto") === "auto";

      return (
        <input
          type="text"
          name="roll_no"
          value={value}
          readOnly={isAuto}
          disabled={isAuto}
          onChange={(e) => handleFieldChange(field, e)}
          placeholder={isAuto ? "Auto-assigned on save" : "Enter roll no"}
          title={
            isAuto
              ? "Roll No is assigned automatically based on class and section"
              : ""
          }
        />
      );
    }

    if (field.name === "class_name" || field.name === "class_id") {
      return (
        <select
          name="class_id"
          value={formData.class_id || ""}
          required={Boolean(field.required)}
          onChange={async (e) => {
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

            if ((formData.roll_no_mode || "auto") === "auto") {
              if (!selectedClassId) {
                setFormData((prev) => ({ ...prev, roll_no: "" }));
                return;
              }
              try {
                const response = await API.get("/students/next-roll-no", {
                  params: { class_id: selectedClassId },
                });
                setFormData((prev) => ({
                  ...prev,
                  roll_no: response.data?.roll_no || "",
                }));
              } catch {
                setFormData((prev) => ({ ...prev, roll_no: "" }));
              }
            }
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
    setShowFilters(false);
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
    ["residential", "Residential"],
    ["status", "Status"],
    ["guardian", "Guardian"],
    ["phone", "Phone"],
    ["transport", "Transport"],
    ["actions", "Actions"],
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
    setShowFilters(true);
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

  function getStudentDisplayName(student) {
    return `${student.first_name || ""} ${student.last_name || ""}`.trim() || "student";
  }

  function renderStudentCell(student, columnKey) {
    const valueMap = {
      admission_no: student.admission_no || "-",
      student: `${student.first_name || ""} ${student.last_name || ""}`.trim() || "-",
      class: student.class_name || "-",
      section: student.section || "-",
      house: student.house || "-",
      residential: student.residential_type || "Day Scholar",
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
    .filter(([key]) => key !== "actions" && visibleColumns.includes(key))
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
  const selectedStudentCount = selectedStudentIds.length;
  const displayedStudentIds = displayedStudents.map((student) => String(student.id));
  const showActionsColumn = visibleColumns.includes("actions");
  const tableColumnCount =
    visibleStudentColumns.length + (showActionsColumn ? 1 : 0) + 2;
  const allDisplayedStudentsSelected =
    displayedStudentIds.length > 0 &&
    displayedStudentIds.every((studentId) => selectedStudentIds.includes(studentId));

  useEffect(() => {
    setCurrentPage(1);
  }, [searchText, classFilter, sectionFilter, statusFilter, fieldFilters, recordsPerPage]);

  useEffect(() => {
    if (selectedStudentCount === 0) {
      setShowStudentActions(false);
    }
  }, [selectedStudentCount]);

  useEffect(() => {
    function closeMenusOnOutsideClick(event) {
      if (
        event.target.closest(
          ".student-column-head, .records-header-column-manager, .column-manager-menu, .column-manager-wrap, .student-bulk-action-wrap"
        )
      ) {
        return;
      }

      setActiveColumnMenu(null);
      setShowColumnManager(false);
      setShowStudentActions(false);
    }

    document.addEventListener("pointerdown", closeMenusOnOutsideClick);

    return () => {
      document.removeEventListener("pointerdown", closeMenusOnOutsideClick);
    };
  }, []);

  function toggleStudentSelection(studentId) {
    setSelectedStudentIds((currentIds) => {
      const normalizedId = String(studentId);

      if (currentIds.includes(normalizedId)) {
        return currentIds.filter((id) => id !== normalizedId);
      }

      return [...currentIds, normalizedId];
    });
  }

  function toggleDisplayedStudentSelection() {
    if (displayedStudentIds.length === 0) return;

    setSelectedStudentIds((currentIds) => {
      if (displayedStudentIds.every((studentId) => currentIds.includes(studentId))) {
        return currentIds.filter((studentId) => !displayedStudentIds.includes(studentId));
      }

      return Array.from(new Set([...currentIds, ...displayedStudentIds]));
    });
  }

  function handleSendWhatsappMessage() {
    setShowStudentActions(false);
    setMessage(
      `Send Whatsapp message selected for ${selectedStudentCount} student${
        selectedStudentCount === 1 ? "" : "s"
      }.`
    );
  }

  if (pageMode === "form") {
    return (
      <div className="management-page student-edit-page">
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
              <ArrowLeft size={17} />
              Back
            </button>
          </div>
        </section>

        {message && <div className="toast-notification">{message}</div>}

        <section className="form-panel">
          <div className="panel-header">
            <div>
              <div className="panel-header-title-row">
                <h3>{editingId ? "Edit Student Profile" : "Add Student Profile"}</h3>
                <Link to="/students/layout" className="panel-header-link">
                  Customize Layout
                </Link>
              </div>
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
                      <Fragment key={field.id}>
                        {field.name === "roll_no" && (
                          <div className="form-field">
                            <label>Roll No Assignment</label>
                            {renderRollNoModeToggle()}
                          </div>
                        )}
                        <div
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
                      </Fragment>
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
          <p className="eyebrow">{t("Student Management")}</p>
          <h2>{t("Students")}</h2>
          <p>All student records in one place.</p>
        </div>

        <div className="student-heading-actions">
          {selectedStudentCount > 0 && (
            <div className="student-bulk-action-wrap">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowStudentActions((prev) => !prev)}
              >
                Actions
                <ChevronDown size={16} />
              </button>

              {showStudentActions && (
                <div className="student-bulk-action-menu">
                  <button type="button" onClick={handleSendWhatsappMessage}>
                    <MessageCircle size={16} />
                    Send Whatsapp message
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            className="secondary-button"
            onClick={() => setShowBulkImport(true)}
          >
            <Upload size={17} />
            Import CSV
          </button>
          <button type="button" className="primary-button" onClick={handleAddStudent}>
            <PlusCircle size={18} />
            Add Student
          </button>
        </div>
      </section>

      {showBulkImport && (
        <div className="layout-modal-backdrop" onClick={closeBulkImport}>
          <div className="layout-modal" onClick={(event) => event.stopPropagation()}>
            <div className="layout-modal-header">
              <div>
                <h3>Bulk Import Students</h3>
                <p>Upload a CSV file to create multiple students at once.</p>
              </div>
              <button type="button" className="light-icon-button" onClick={closeBulkImport}>
                <X size={16} />
              </button>
            </div>

            <button type="button" className="light-button" onClick={downloadImportTemplate}>
              <Download size={16} />
              Download CSV Template
            </button>

            <div style={{ marginTop: 16 }}>
              <input
                type="file"
                accept=".csv"
                onChange={(event) => {
                  setBulkImportFile(event.target.files?.[0] || null);
                  setBulkImportResult(null);
                }}
              />
            </div>

            <div className="form-actions" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="secondary-button"
                disabled={!bulkImportFile || bulkImportBusy}
                onClick={() => submitBulkImport(true)}
              >
                Validate Only
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={!bulkImportFile || bulkImportBusy}
                onClick={() => submitBulkImport(false)}
              >
                {bulkImportBusy ? "Importing..." : "Import"}
              </button>
            </div>

            {bulkImportResult && (
              <div style={{ marginTop: 18 }}>
                {"total_rows" in bulkImportResult && (
                  <p>
                    {bulkImportResult.dry_run ? "Validated" : "Imported"}{" "}
                    <strong>{bulkImportResult.created ?? bulkImportResult.valid_rows}</strong> of{" "}
                    {bulkImportResult.total_rows} row(s).
                    {bulkImportResult.errors?.length > 0 &&
                      ` ${bulkImportResult.errors.length} row(s) had errors.`}
                  </p>
                )}
                {bulkImportResult.errors?.length > 0 && (
                  <div style={{ maxHeight: 220, overflowY: "auto" }}>
                    <table className="classic-table">
                      <thead>
                        <tr>
                          <th>Row</th>
                          <th>Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkImportResult.errors.map((err, idx) => (
                          <tr key={idx}>
                            <td>{err.row}</td>
                            <td>{err.error}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {message && <div className="toast-notification">{message}</div>}

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
            <section className="student-list-pagination student-records-toolbar">
              <div className="student-records-summary">
                <div className="table-search student-records-search">
                  <Search size={22} />
                  <input
                    type="text"
                    placeholder="Search admission, name, class, guardian..."
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                  />
                </div>
              </div>

              <div className="student-records-controls">
                <span className="student-total-records">
                  Total: <strong>{filteredStudents.length}</strong>
                </span>

                <div className="student-records-size">
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
                </div>

                <div className="student-records-pages">
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
              </div>
            </section>

            {loading ? (
              <div className="loading-box">Loading students...</div>
            ) : (
              <div className="table-wrapper">
                <table className="classic-table student-list-table">
                  <thead>
                    <tr>
                      <th className="student-filter-toggle-cell">
                        <input
                          type="checkbox"
                          className="student-row-checkbox student-mass-select-checkbox"
                          checked={allDisplayedStudentsSelected}
                          onChange={toggleDisplayedStudentSelection}
                          disabled={displayedStudentIds.length === 0}
                          title={
                            allDisplayedStudentsSelected
                              ? "Unselect visible students"
                              : "Select visible students"
                          }
                          aria-label={
                            allDisplayedStudentsSelected
                              ? "Unselect visible students"
                              : "Select visible students"
                          }
                        />
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
                      {showActionsColumn && (
                        <th className="student-column-actions">
                          <div className="student-actions-head">
                            <span>Actions</span>
                          </div>
                        </th>
                      )}
                      <th className="records-header-column-manager student-header-column-manager">
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
                            {studentListColumns.map(([columnKey, columnLabel]) => (
                              <label key={columnKey}>
                                <input
                                  type="checkbox"
                                  checked={visibleColumns.includes(columnKey)}
                                  onChange={() => toggleColumn(columnKey)}
                                />
                                <span>{columnLabel}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {displayedStudents.length === 0 ? (
                      <tr>
                        <td
                          colSpan={tableColumnCount}
                          className="empty-table"
                        >
                          No student records found.
                        </td>
                      </tr>
                    ) : (
                      displayedStudents.map((student) => (
                        <tr
                          key={student.id}
                          className={
                            selectedStudentIds.includes(String(student.id))
                              ? "clickable-row selected-row"
                              : "clickable-row"
                          }
                          onClick={() => navigate(`/students/${student.id}`)}
                        >
                          <td className="student-filter-toggle-cell">
                            <input
                              type="checkbox"
                              className="student-row-checkbox"
                              checked={selectedStudentIds.includes(String(student.id))}
                              onChange={() => toggleStudentSelection(student.id)}
                              onClick={(event) => event.stopPropagation()}
                              aria-label={`Select ${getStudentDisplayName(student)}`}
                            />
                          </td>
                          {visibleStudentColumns
                            .map(([key]) => (
                              <td key={key}>{renderStudentCell(student, key)}</td>
                            ))}
                          {showActionsColumn && (
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
                          )}
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
    </div>
  );
}
