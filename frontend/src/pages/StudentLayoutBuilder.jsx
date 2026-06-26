import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Save,
  RotateCcw,
  PlusCircle,
  Trash2,
  Edit,
  GripVertical,
  X,
  Layers,
  Type,
  AlignLeft,
  Mail,
  Phone,
  Calendar,
  Hash,
  CheckSquare,
  Link,
  ListChecks,
  Eye,
  ArrowLeft,
} from "lucide-react";
import {
  getModuleLayout,
  saveModuleLayout,
} from "../services/moduleLayoutService";

const MODULE_NAME = "Students";
const LEGACY_STORAGE_KEY = "student_form_layout_v1";
const MAX_CUSTOM_FIELDS_PER_MODULE = 20;

const FIELD_TYPES = [
  { type: "singleline", label: "Single Line", icon: Type },
  { type: "multiline", label: "Multi-Line", icon: AlignLeft },
  { type: "email", label: "Email", icon: Mail },
  { type: "phone", label: "Phone", icon: Phone },
  { type: "picklist", label: "Pick List", icon: ListChecks },
  { type: "date", label: "Date", icon: Calendar },
  { type: "number", label: "Number", icon: Hash },
  { type: "decimal", label: "Decimal", icon: Hash },
  { type: "checkbox", label: "Checkbox", icon: CheckSquare },
  { type: "url", label: "URL", icon: Link },
];

const MASTER_CATEGORIES = [
  "Gender",
  "House",
  "Section",
  "BloodGroup",
  "Nationality",
  "TransportRoute",
  "StudentStatus",
  "Department",
  "Subject",
  "FeeType",
  "AttendanceStatus",
  "ExamType",
  "EmploymentType",
  "SalaryGrade",
  "AcademicYear",
];

const defaultLayout = [
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

function createId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createFieldKey(label) {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getTypeLabel(type) {
  return FIELD_TYPES.find((item) => item.type === type)?.label || type;
}

function getInitialFieldDraft(type = "singleline") {
  return {
    id: "",
    name: "",
    label: "",
    type,
    required: false,
    placeholder: "",
    masterCategory: "",
    source: "custom",
  };
}

function getLegacyLocalLayout() {
  const savedLayout = localStorage.getItem(LEGACY_STORAGE_KEY);

  if (!savedLayout) return null;

  try {
    return JSON.parse(savedLayout);
  } catch {
    return null;
  }
}

export default function StudentLayoutBuilder() {
  const navigate = useNavigate();

  const [layout, setLayout] = useState(defaultLayout);
  const [message, setMessage] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const [loadingLayout, setLoadingLayout] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);

  const [dragPayload, setDragPayload] = useState(null);
  const [activeHoverField, setActiveHoverField] = useState(null);

  const [sectionDraft, setSectionDraft] = useState("");
  const [editingSectionId, setEditingSectionId] = useState(null);
  const [editingSectionTitle, setEditingSectionTitle] = useState("");

  const [fieldModalOpen, setFieldModalOpen] = useState(false);
  const [fieldModalMode, setFieldModalMode] = useState("create");
  const [fieldDraft, setFieldDraft] = useState(getInitialFieldDraft());
  const [fieldTargetSectionId, setFieldTargetSectionId] = useState(null);
  const [fieldTargetIndex, setFieldTargetIndex] = useState(null);
  const [fieldEditingSectionId, setFieldEditingSectionId] = useState(null);

  useEffect(() => {
    loadLayoutFromBackend();
  }, []);

  const totalFields = useMemo(() => {
    return layout.reduce((sum, section) => sum + section.fields.length, 0);
  }, [layout]);

  const customFieldsCount = useMemo(() => {
    return layout.reduce((sum, section) => {
      return (
        sum + section.fields.filter((field) => field.source === "custom").length
      );
    }, 0);
  }, [layout]);

  async function loadLayoutFromBackend() {
    try {
      setLoadingLayout(true);
      setMessage("");

      const backendLayout = await getModuleLayout(MODULE_NAME);

      if (backendLayout && Array.isArray(backendLayout)) {
        setLayout(backendLayout);
        return;
      }

      const legacyLayout = getLegacyLocalLayout();

      if (legacyLayout && Array.isArray(legacyLayout)) {
        setLayout(legacyLayout);
        setMessage(
          "Loaded old browser layout. Click Save Layout once to move it to backend."
        );
        return;
      }

      setLayout(defaultLayout);
      setMessage("No backend layout found. Default layout loaded.");
    } catch (error) {
      console.error(error);
      setLayout(defaultLayout);
      setMessage(
        error.response?.data?.detail ||
          "Unable to load backend layout. Default layout loaded."
      );
    } finally {
      setLoadingLayout(false);
    }
  }

  async function saveLayout() {
    try {
      setSavingLayout(true);
      setMessage("");

      const savedLayout = await saveModuleLayout(MODULE_NAME, layout);

      if (savedLayout && Array.isArray(savedLayout)) {
        setLayout(savedLayout);
      }

      localStorage.removeItem(LEGACY_STORAGE_KEY);
      setMessage("Student layout saved to backend successfully.");
    } catch (error) {
      console.error(error);
      setMessage(
        error.response?.data?.detail ||
          "Unable to save layout to backend. Please check backend server."
      );
    } finally {
      setSavingLayout(false);
    }
  }

  async function resetLayout() {
    const confirmReset = window.confirm(
      "This will reset the student layout to default and save it in backend. Continue?"
    );

    if (!confirmReset) return;

    try {
      setSavingLayout(true);
      setLayout(defaultLayout);

      await saveModuleLayout(MODULE_NAME, defaultLayout);
      localStorage.removeItem(LEGACY_STORAGE_KEY);

      setMessage("Student layout reset and saved to backend.");
    } catch (error) {
      console.error(error);
      setMessage(
        error.response?.data?.detail ||
          "Unable to reset layout in backend. Please check backend server."
      );
    } finally {
      setSavingLayout(false);
    }
  }

  function handleToolDragStart(e, fieldType) {
    const payload = {
      kind: "new-field",
      fieldType,
    };

    setDragPayload(payload);
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("application/json", JSON.stringify(payload));
  }

  function handleLayoutFieldDragStart(e, sectionId, fieldId) {
    const payload = {
      kind: "existing-field",
      sectionId,
      fieldId,
    };

    setDragPayload(payload);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/json", JSON.stringify(payload));
  }

  function getDropPayload(e) {
    try {
      const raw = e.dataTransfer.getData("application/json");

      if (raw) return JSON.parse(raw);
    } catch {
      return dragPayload;
    }

    return dragPayload;
  }

  function handleDropOnSection(e, targetSectionId) {
    e.preventDefault();
    e.stopPropagation();

    const payload = getDropPayload(e);
    setActiveHoverField(null);

    if (!payload) return;

    const targetSection = layout.find((section) => section.id === targetSectionId);
    const appendIndex = targetSection ? targetSection.fields.length : 0;

    if (payload.kind === "new-field") {
      openCreateFieldModal(payload.fieldType, targetSectionId, appendIndex);
      return;
    }

    if (payload.kind === "existing-field") {
      moveFieldToIndex(
        payload.sectionId,
        payload.fieldId,
        targetSectionId,
        appendIndex
      );
    }
  }

  function handleDropOnField(e, targetSectionId, targetFieldId) {
    e.preventDefault();
    e.stopPropagation();

    const payload = getDropPayload(e);
    setActiveHoverField(null);

    if (!payload) return;

    const targetSection = layout.find((section) => section.id === targetSectionId);
    const targetIndex = targetSection?.fields.findIndex(
      (field) => field.id === targetFieldId
    );

    if (targetIndex === -1 || targetIndex === undefined) return;

    if (payload.kind === "new-field") {
      openCreateFieldModal(payload.fieldType, targetSectionId, targetIndex);
      return;
    }

    if (payload.kind === "existing-field") {
      swapFields(
        payload.sectionId,
        payload.fieldId,
        targetSectionId,
        targetFieldId
      );
    }
  }

  function swapFields(
    sourceSectionId,
    sourceFieldId,
    targetSectionId,
    targetFieldId
  ) {
    if (sourceSectionId === targetSectionId && sourceFieldId === targetFieldId) {
      return;
    }

    setLayout((prev) => {
      const cloned = prev.map((section) => ({
        ...section,
        fields: [...section.fields],
      }));

      const sourceSection = cloned.find(
        (section) => section.id === sourceSectionId
      );

      const targetSection = cloned.find(
        (section) => section.id === targetSectionId
      );

      if (!sourceSection || !targetSection) return prev;

      const sourceIndex = sourceSection.fields.findIndex(
        (field) => field.id === sourceFieldId
      );

      const targetIndex = targetSection.fields.findIndex(
        (field) => field.id === targetFieldId
      );

      if (sourceIndex === -1 || targetIndex === -1) return prev;

      const sourceField = sourceSection.fields[sourceIndex];
      const targetField = targetSection.fields[targetIndex];

      sourceSection.fields[sourceIndex] = targetField;
      targetSection.fields[targetIndex] = sourceField;

      return cloned;
    });

    setMessage("Field positions swapped. Click Save Layout to store changes.");
  }

  function moveFieldToIndex(sourceSectionId, fieldId, targetSectionId, targetIndex) {
    setLayout((prev) => {
      const cloned = prev.map((section) => ({
        ...section,
        fields: [...section.fields],
      }));

      const sourceSection = cloned.find(
        (section) => section.id === sourceSectionId
      );

      const targetSection = cloned.find(
        (section) => section.id === targetSectionId
      );

      if (!sourceSection || !targetSection) return prev;

      const sourceIndex = sourceSection.fields.findIndex(
        (field) => field.id === fieldId
      );

      if (sourceIndex === -1) return prev;

      const [movingField] = sourceSection.fields.splice(sourceIndex, 1);

      let insertIndex = Number(targetIndex);

      if (Number.isNaN(insertIndex)) {
        insertIndex = targetSection.fields.length;
      }

      if (sourceSectionId === targetSectionId && sourceIndex < insertIndex) {
        insertIndex = insertIndex - 1;
      }

      if (insertIndex < 0) insertIndex = 0;

      if (insertIndex > targetSection.fields.length) {
        insertIndex = targetSection.fields.length;
      }

      targetSection.fields.splice(insertIndex, 0, movingField);

      return cloned;
    });

    setMessage("Field moved. Click Save Layout to store changes.");
  }

  function moveFieldUp(sectionId, fieldId) {
    setLayout((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) return section;

        const fields = [...section.fields];
        const index = fields.findIndex((field) => field.id === fieldId);

        if (index <= 0) return section;

        [fields[index - 1], fields[index]] = [fields[index], fields[index - 1]];

        return {
          ...section,
          fields,
        };
      })
    );

    setMessage("Field moved up. Click Save Layout to store changes.");
  }

  function moveFieldDown(sectionId, fieldId) {
    setLayout((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) return section;

        const fields = [...section.fields];
        const index = fields.findIndex((field) => field.id === fieldId);

        if (index === -1 || index >= fields.length - 1) return section;

        [fields[index + 1], fields[index]] = [fields[index], fields[index + 1]];

        return {
          ...section,
          fields,
        };
      })
    );

    setMessage("Field moved down. Click Save Layout to store changes.");
  }

  function addSection() {
    const title = sectionDraft.trim();

    if (!title) {
      setMessage("Please enter section name.");
      return;
    }

    setLayout((prev) => [
      ...prev,
      {
        id: createId("section"),
        title,
        fields: [],
      },
    ]);

    setSectionDraft("");
    setMessage("Section added. Click Save Layout to store changes.");
  }

  function deleteSection(sectionId) {
    const section = layout.find((item) => item.id === sectionId);

    if (!section) return;

    if (section.fields.length > 0) {
      const confirmDelete = window.confirm(
        "This section has fields. Deleting it will remove fields from layout. Continue?"
      );

      if (!confirmDelete) return;
    }

    setLayout((prev) => prev.filter((item) => item.id !== sectionId));
    setMessage("Section deleted. Click Save Layout to store changes.");
  }

  function startEditSection(section) {
    setEditingSectionId(section.id);
    setEditingSectionTitle(section.title);
  }

  function saveSectionTitle(sectionId) {
    const title = editingSectionTitle.trim();

    if (!title) {
      setMessage("Section title cannot be empty.");
      return;
    }

    setLayout((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              title,
            }
          : section
      )
    );

    setEditingSectionId(null);
    setEditingSectionTitle("");
    setMessage("Section renamed. Click Save Layout to store changes.");
  }

  function openCreateFieldModal(type, sectionId, targetIndex = null) {
    const currentCustomFieldCount = layout.reduce((sum, section) => {
      return (
        sum + section.fields.filter((field) => field.source === "custom").length
      );
    }, 0);

    if (currentCustomFieldCount >= MAX_CUSTOM_FIELDS_PER_MODULE) {
      setMessage(
        `You can create maximum ${MAX_CUSTOM_FIELDS_PER_MODULE} custom fields in Student module.`
      );
      return;
    }

    setFieldModalMode("create");
    setFieldDraft(getInitialFieldDraft(type));
    setFieldTargetSectionId(sectionId);
    setFieldTargetIndex(targetIndex);
    setFieldEditingSectionId(null);
    setFieldModalOpen(true);
  }

  function openEditFieldModal(field, sectionId) {
    setFieldModalMode("edit");
    setFieldDraft({
      id: field.id,
      name: field.name,
      label: field.label,
      type: field.type,
      required: Boolean(field.required),
      placeholder: field.placeholder || "",
      masterCategory: field.masterCategory || "",
      source: field.source || "custom",
    });
    setFieldTargetSectionId(null);
    setFieldTargetIndex(null);
    setFieldEditingSectionId(sectionId);
    setFieldModalOpen(true);
  }

  function closeFieldModal() {
    setFieldModalOpen(false);
    setFieldDraft(getInitialFieldDraft());
    setFieldTargetSectionId(null);
    setFieldTargetIndex(null);
    setFieldEditingSectionId(null);
  }

  function handleFieldDraftChange(e) {
    const { name, value, type, checked } = e.target;

    setFieldDraft((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function saveFieldFromModal() {
    const label = fieldDraft.label.trim();

    if (!label) {
      setMessage("Field label is required.");
      return;
    }

    const fieldName =
      fieldDraft.source === "system" && fieldDraft.name
        ? fieldDraft.name
        : fieldDraft.name.trim() || `custom_${createFieldKey(label)}`;

    if (!fieldName) {
      setMessage("Field key is required.");
      return;
    }

    const fieldToSave = {
      ...fieldDraft,
      id: fieldDraft.id || createId("field"),
      label,
      name: fieldName,
      source: fieldDraft.source || "custom",
      placeholder: fieldDraft.placeholder || "",
      masterCategory:
        fieldDraft.type === "picklist" ? fieldDraft.masterCategory || "" : "",
    };

    if (fieldModalMode === "create") {
      setLayout((prev) =>
        prev.map((section) => {
          if (section.id !== fieldTargetSectionId) return section;

          const fields = [...section.fields];

          let insertIndex =
            fieldTargetIndex === null || fieldTargetIndex === undefined
              ? fields.length
              : Number(fieldTargetIndex);

          if (Number.isNaN(insertIndex)) {
            insertIndex = fields.length;
          }

          if (insertIndex < 0) insertIndex = 0;

          if (insertIndex > fields.length) {
            insertIndex = fields.length;
          }

          fields.splice(insertIndex, 0, fieldToSave);

          return {
            ...section,
            fields,
          };
        })
      );

      setMessage("Custom field added. Click Save Layout to store changes.");
    } else {
      setLayout((prev) =>
        prev.map((section) =>
          section.id === fieldEditingSectionId
            ? {
                ...section,
                fields: section.fields.map((field) =>
                  field.id === fieldToSave.id ? fieldToSave : field
                ),
              }
            : section
        )
      );

      setMessage("Field updated. Click Save Layout to store changes.");
    }

    closeFieldModal();
  }

  function deleteField(sectionId, fieldId) {
    const confirmDelete = window.confirm(
      "Remove this field from student layout?"
    );

    if (!confirmDelete) return;

    setLayout((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              fields: section.fields.filter((field) => field.id !== fieldId),
            }
          : section
      )
    );

    setMessage("Field removed. Click Save Layout to store changes.");
  }

  function renderPreviewField(field) {
    if (field.type === "multiline") {
      return <textarea disabled rows="3" placeholder={field.placeholder} />;
    }

    if (field.type === "picklist") {
      return (
        <select disabled>
          <option>
            {field.masterCategory
              ? `Values from ${field.masterCategory}`
              : "Pick List Values"}
          </option>
        </select>
      );
    }

    if (field.type === "checkbox") {
      return (
        <label className="layout-checkbox-preview">
          <input type="checkbox" disabled />
          <span>{field.label}</span>
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
        disabled
        type={inputTypeMap[field.type] || "text"}
        placeholder={field.placeholder}
      />
    );
  }

  return (
    <div className="layout-builder-page">
      <section className="layout-builder-header">
        <div>
          <p className="eyebrow">Student Module Customization</p>
          <h2>Student Layout Builder</h2>
          <p>
            Layout is now saved in backend. Drag a field on top of another field
            to swap their positions.
          </p>
        </div>

        <div className="layout-header-actions">
          <button
            type="button"
            className="light-button"
            onClick={() => navigate("/students")}
          >
            <ArrowLeft size={17} />
            Back to Students
          </button>

          <button
            type="button"
            className="light-button"
            onClick={() => setPreviewMode((prev) => !prev)}
          >
            <Eye size={17} />
            {previewMode ? "Edit Layout" : "Preview"}
          </button>

          <button
            type="button"
            className="light-button"
            onClick={loadLayoutFromBackend}
            disabled={loadingLayout || savingLayout}
          >
            <RotateCcw size={17} />
            Reload
          </button>

          <button
            type="button"
            className="light-button"
            onClick={resetLayout}
            disabled={loadingLayout || savingLayout}
          >
            <RotateCcw size={17} />
            Reset
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={saveLayout}
            disabled={loadingLayout || savingLayout}
          >
            <Save size={17} />
            {savingLayout ? "Saving..." : "Save Layout"}
          </button>
        </div>
      </section>

      <section className="summary-strip report-summary-grid">
        <div className="summary-card">
          <Layers size={22} />
          <div>
            <span>Sections</span>
            <strong>{layout.length}</strong>
          </div>
        </div>

        <div className="summary-card">
          <Layers size={22} />
          <div>
            <span>Total Fields</span>
            <strong>{totalFields}</strong>
          </div>
        </div>

        <div className="summary-card warning">
          <Layers size={22} />
          <div>
            <span>Custom Fields</span>
            <strong>
              {customFieldsCount}/{MAX_CUSTOM_FIELDS_PER_MODULE}
            </strong>
          </div>
        </div>
      </section>

      {loadingLayout && <div className="message-box">Loading backend layout...</div>}

      {message && <div className="message-box">{message}</div>}

      <section className="layout-builder-shell">
        {!previewMode && (
          <aside className="layout-toolbox">
            <div className="layout-toolbox-title">
              <h3>New Fields</h3>
              <p>
                Drag a field into any section. Limit:{" "}
                {MAX_CUSTOM_FIELDS_PER_MODULE} custom fields.
              </p>
            </div>

            <div className="layout-tool-grid">
              {FIELD_TYPES.map((item) => {
                const Icon = item.icon;

                return (
                  <button
                    key={item.type}
                    type="button"
                    className="layout-tool-item"
                    draggable
                    onDragStart={(e) => handleToolDragStart(e, item.type)}
                    disabled={
                      customFieldsCount >= MAX_CUSTOM_FIELDS_PER_MODULE
                    }
                  >
                    <Icon size={17} />
                    {item.label}
                  </button>
                );
              })}
            </div>

            <div className="layout-add-section-box">
              <h4>Add New Section</h4>

              <input
                type="text"
                value={sectionDraft}
                onChange={(e) => setSectionDraft(e.target.value)}
                placeholder="Example: Scholarship Details"
              />

              <button
                type="button"
                className="primary-button"
                onClick={addSection}
              >
                <PlusCircle size={16} />
                Add Section
              </button>
            </div>

            <div className="layout-help-box">
              <strong>Backend Layout</strong>
              <p>
                Changes are not permanent until you click Save Layout. Once
                saved, every browser will use this layout.
              </p>
            </div>
          </aside>
        )}

        <main className={previewMode ? "layout-canvas preview" : "layout-canvas"}>
          <div className="layout-canvas-top">
            <div>
              <h3>Student Form Layout</h3>
              <p>
                Rearrange fields by dragging one field on top of another field.
              </p>
            </div>
          </div>

          {layout.map((section) => (
            <section
              key={section.id}
              className="layout-section-card"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDropOnSection(e, section.id)}
            >
              <div className="layout-section-header">
                {editingSectionId === section.id ? (
                  <div className="layout-section-edit">
                    <input
                      type="text"
                      value={editingSectionTitle}
                      onChange={(e) => setEditingSectionTitle(e.target.value)}
                    />

                    <button
                      type="button"
                      className="primary-button small"
                      onClick={() => saveSectionTitle(section.id)}
                    >
                      Save
                    </button>

                    <button
                      type="button"
                      className="light-button small"
                      onClick={() => {
                        setEditingSectionId(null);
                        setEditingSectionTitle("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <div>
                      <h4>{section.title}</h4>
                      <p>{section.fields.length} field(s)</p>
                    </div>

                    {!previewMode && (
                      <div className="layout-section-actions">
                        <button
                          type="button"
                          className="light-icon-button"
                          onClick={() => startEditSection(section)}
                          title="Rename section"
                        >
                          <Edit size={15} />
                        </button>

                        <button
                          type="button"
                          className="delete-button"
                          onClick={() => deleteSection(section.id)}
                          title="Delete section"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {section.fields.length === 0 ? (
                <div
                  className="layout-empty-drop"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDropOnSection(e, section.id)}
                >
                  Drop fields here
                </div>
              ) : (
                <div
                  className="layout-field-grid"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDropOnSection(e, section.id)}
                >
                  {section.fields.map((field) => (
                    <div
                      key={field.id}
                      className={
                        previewMode
                          ? "layout-field-preview"
                          : activeHoverField === field.id
                          ? "layout-field-card swap-target"
                          : "layout-field-card"
                      }
                      draggable={!previewMode}
                      onDragStart={(e) =>
                        handleLayoutFieldDragStart(e, section.id, field.id)
                      }
                      onDragEnter={(e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        if (!previewMode) {
                          setActiveHoverField(field.id);
                        }
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setActiveHoverField(null);
                      }}
                      onDrop={(e) => handleDropOnField(e, section.id, field.id)}
                    >
                      {previewMode ? (
                        <>
                          <label>
                            {field.label}
                            {field.required && <span> *</span>}
                          </label>

                          {renderPreviewField(field)}
                        </>
                      ) : (
                        <>
                          <div className="layout-field-left">
                            <GripVertical size={17} />
                            <div>
                              <strong>
                                {field.label}
                                {field.required && <span> *</span>}
                              </strong>
                              <p>
                                {getTypeLabel(field.type)} • {field.name}
                                {field.source === "custom" ? " • Custom" : ""}
                              </p>
                            </div>
                          </div>

                          <div className="layout-field-actions">
                            <button
                              type="button"
                              className="light-button small"
                              onClick={() => moveFieldUp(section.id, field.id)}
                            >
                              ↑
                            </button>

                            <button
                              type="button"
                              className="light-button small"
                              onClick={() => moveFieldDown(section.id, field.id)}
                            >
                              ↓
                            </button>

                            <button
                              type="button"
                              className="edit-button"
                              onClick={() =>
                                openEditFieldModal(field, section.id)
                              }
                            >
                              <Edit size={14} />
                            </button>

                            <button
                              type="button"
                              className="delete-button"
                              onClick={() => deleteField(section.id, field.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </main>
      </section>

      {fieldModalOpen && (
        <div className="layout-modal-backdrop">
          <div className="layout-modal">
            <div className="layout-modal-header">
              <div>
                <h3>
                  {fieldModalMode === "create"
                    ? "Add Custom Field"
                    : "Edit Field"}
                </h3>
                <p>
                  Configure label, type, required status, and dropdown source.
                </p>
              </div>

              <button
                type="button"
                className="drawer-close"
                onClick={closeFieldModal}
              >
                <X size={18} />
              </button>
            </div>

            <div className="classic-form">
              <div className="form-grid">
                <div className="form-field">
                  <label>Field Label *</label>
                  <input
                    type="text"
                    name="label"
                    value={fieldDraft.label}
                    onChange={handleFieldDraftChange}
                    placeholder="Example: Aadhaar No"
                  />
                </div>

                <div className="form-field">
                  <label>Field Key</label>
                  <input
                    type="text"
                    name="name"
                    value={fieldDraft.name}
                    onChange={handleFieldDraftChange}
                    disabled={fieldDraft.source === "system"}
                    placeholder="custom_aadhaar_no"
                  />
                </div>

                <div className="form-field">
                  <label>Field Type</label>
                  <select
                    name="type"
                    value={fieldDraft.type}
                    onChange={handleFieldDraftChange}
                  >
                    {FIELD_TYPES.map((item) => (
                      <option key={item.type} value={item.type}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label>Placeholder</label>
                  <input
                    type="text"
                    name="placeholder"
                    value={fieldDraft.placeholder}
                    onChange={handleFieldDraftChange}
                    placeholder="Input placeholder"
                  />
                </div>

                {fieldDraft.type === "picklist" && (
                  <div className="form-field">
                    <label>Master Data Category</label>
                    <select
                      name="masterCategory"
                      value={fieldDraft.masterCategory}
                      onChange={handleFieldDraftChange}
                    >
                      <option value="">No Master Data</option>
                      {MASTER_CATEGORIES.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="form-field checkbox-field">
                  <label>Required Field</label>
                  <label className="switch-row">
                    <input
                      type="checkbox"
                      name="required"
                      checked={fieldDraft.required}
                      onChange={handleFieldDraftChange}
                    />
                    <span>{fieldDraft.required ? "Required" : "Optional"}</span>
                  </label>
                </div>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={saveFieldFromModal}
                >
                  <Save size={17} />
                  {fieldModalMode === "create" ? "Add Field" : "Save Field"}
                </button>

                <button
                  type="button"
                  className="light-button"
                  onClick={closeFieldModal}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}