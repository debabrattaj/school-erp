import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "./ModuleLayoutBuilder.css";
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
  ShieldCheck,
} from "lucide-react";

import {
  getModuleLayout,
  saveModuleLayout,
} from "../services/moduleLayoutService";

import {
  MODULE_CONFIGS,
  MODULE_LAYOUT_LIMIT,
} from "../config/moduleLayouts.js";

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

const REQUIRED_SYSTEM_FIELDS = {
  Students: ["admission_no", "first_name"],
  Teachers: ["teacher_code", "first_name"],
  Classes: ["class_name", "section"],
  Fees: ["student_id", "fee_type", "amount"],
  Attendance: ["student_id", "attendance_date", "status"],
  Exams: ["exam_name", "class_name", "section", "exam_date"],
  Marks: ["student_id", "exam_id", "subject", "marks_obtained", "max_marks"],
};

const FIELD_TYPES = [
  {
    type: "singleline",
    label: "Single Line",
    icon: Type,
  },
  {
    type: "multiline",
    label: "Multi Line",
    icon: AlignLeft,
  },
  {
    type: "email",
    label: "Email",
    icon: Mail,
  },
  {
    type: "phone",
    label: "Phone",
    icon: Phone,
  },
  {
    type: "date",
    label: "Date",
    icon: Calendar,
  },
  {
    type: "number",
    label: "Number",
    icon: Hash,
  },
  {
    type: "decimal",
    label: "Decimal",
    icon: Hash,
  },
  {
    type: "checkbox",
    label: "Checkbox",
    icon: CheckSquare,
  },
  {
    type: "url",
    label: "URL",
    icon: Link,
  },
  {
    type: "picklist",
    label: "Picklist",
    icon: ListChecks,
  },
];

function normalizeKey(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getConfigFromParam(moduleParam) {
  const requested = String(moduleParam || "").toLowerCase();

  const foundKey = Object.keys(MODULE_CONFIGS).find(
    (key) => key.toLowerCase() === requested
  );

  if (!foundKey) return null;

  return MODULE_CONFIGS[foundKey];
}

function getAllFields(layout) {
  return layout.flatMap((section) => section.fields || []);
}

function buildRequiredFieldMap(moduleName, defaultLayout) {
  const requiredNames = REQUIRED_SYSTEM_FIELDS[moduleName] || [];
  const defaultFields = getAllFields(defaultLayout || []);

  const map = {};

  requiredNames.forEach((fieldName) => {
    const originalField = defaultFields.find((field) => field.name === fieldName);

    if (originalField) {
      map[fieldName] = {
        ...originalField,
        source: "system",
        required: true,
      };
    }
  });

  return map;
}

function repairLayoutWithRequiredFields(layoutToRepair, moduleName, defaultLayout) {
  const requiredMap = buildRequiredFieldMap(moduleName, defaultLayout);
  const requiredNames = Object.keys(requiredMap);

  let repairedLayout =
    Array.isArray(layoutToRepair) && layoutToRepair.length > 0
      ? deepClone(layoutToRepair)
      : deepClone(defaultLayout);

  if (!Array.isArray(repairedLayout) || repairedLayout.length === 0) {
    repairedLayout = deepClone(defaultLayout);
  }

  repairedLayout = repairedLayout.map((section) => ({
    ...section,
    fields: Array.isArray(section.fields) ? section.fields : [],
  }));

  const existingFields = getAllFields(repairedLayout);
  const existingNames = new Set(existingFields.map((field) => field.name));

  requiredNames.forEach((fieldName) => {
    if (!existingNames.has(fieldName)) {
      repairedLayout[0].fields.unshift(requiredMap[fieldName]);
    }
  });

  repairedLayout = repairedLayout.map((section) => ({
    ...section,
    fields: section.fields.map((field) => {
      if (requiredMap[field.name]) {
        return {
          ...requiredMap[field.name],
          label: field.label || requiredMap[field.name].label,
          id: field.id || requiredMap[field.name].id,
          required: true,
          source: "system",
        };
      }

      return field;
    }),
  }));

  return repairedLayout;
}

export default function ModuleLayoutBuilder() {
  const navigate = useNavigate();
  const { moduleName: moduleParam } = useParams();

  const config = getConfigFromParam(moduleParam);
  const moduleName = config?.moduleName || "Students";
  const defaultLayout = config?.defaultLayout || [];
  const backPath = config?.backPath || "/students";
  const title = config?.title || `${moduleName} Layout Builder`;
  const subtitle =
    config?.subtitle || `Customize the ${moduleName} module form layout.`;
  const storageKey = config?.storageKey || `${moduleName}_layout_v1`;

  const [layout, setLayout] = useState(() =>
    repairLayoutWithRequiredFields(defaultLayout, moduleName, defaultLayout)
  );

  const [selectedSectionId, setSelectedSectionId] = useState(null);
  const [editingField, setEditingField] = useState(null);
  const [editingSectionId, setEditingSectionId] = useState(null);
  const [sectionTitle, setSectionTitle] = useState("");
  const [draggedField, setDraggedField] = useState(null);
  const [draggedExistingField, setDraggedExistingField] = useState(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return undefined;

    const timeoutId = window.setTimeout(() => {
      setMessage("");
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  const [saving, setSaving] = useState(false);

  const requiredFieldNames = REQUIRED_SYSTEM_FIELDS[moduleName] || [];

  const customFieldCount = useMemo(() => {
    return getAllFields(layout).filter((field) => field.source === "custom")
      .length;
  }, [layout]);

  const allFieldNames = useMemo(() => {
    return getAllFields(layout).map((field) => field.name);
  }, [layout]);

  function isProtectedField(field) {
    return (
      field?.source === "system" && requiredFieldNames.includes(field?.name)
    );
  }

  function validateRequiredFields(layoutToValidate) {
    const fieldNames = getAllFields(layoutToValidate).map((field) => field.name);

    const missingFields = requiredFieldNames.filter(
      (fieldName) => !fieldNames.includes(fieldName)
    );

    if (missingFields.length > 0) {
      return {
        ok: false,
        message: `Required system fields missing: ${missingFields.join(", ")}`,
      };
    }

    return {
      ok: true,
      message: "",
    };
  }

  async function loadLayout() {
    try {
      setMessage("");

      const backendLayout = await getModuleLayout(moduleName);

      const repairedLayout = repairLayoutWithRequiredFields(
        backendLayout,
        moduleName,
        defaultLayout
      );

      setLayout(repairedLayout);

      if (JSON.stringify(backendLayout || []) !== JSON.stringify(repairedLayout)) {
        await saveModuleLayout(moduleName, repairedLayout);
      }
    } catch (error) {
      console.error(error);

      const localLayout = localStorage.getItem(storageKey);

      if (localLayout) {
        try {
          const parsedLayout = JSON.parse(localLayout);

          const repairedLayout = repairLayoutWithRequiredFields(
            parsedLayout,
            moduleName,
            defaultLayout
          );

          setLayout(repairedLayout);
          return;
        } catch {
          setLayout(
            repairLayoutWithRequiredFields(defaultLayout, moduleName, defaultLayout)
          );
        }
      }

      setLayout(
        repairLayoutWithRequiredFields(defaultLayout, moduleName, defaultLayout)
      );
    }
  }

  useEffect(() => {
    if (!config) {
      navigate("/students", { replace: true });
      return;
    }

    loadLayout();
  }, [moduleParam]);

  async function saveLayout() {
    try {
      setSaving(true);
      setMessage("");

      const repairedLayout = repairLayoutWithRequiredFields(
        layout,
        moduleName,
        defaultLayout
      );

      const validation = validateRequiredFields(repairedLayout);

      if (!validation.ok) {
        setMessage(validation.message);
        return;
      }

      await saveModuleLayout(moduleName, repairedLayout);
      localStorage.setItem(storageKey, JSON.stringify(repairedLayout));

      setLayout(repairedLayout);
      setMessage(`${moduleName} layout saved successfully.`);
    } catch (error) {
      console.error(error);
      setMessage(
        error.response?.data?.detail ||
          `Unable to save ${moduleName} layout.`
      );
    } finally {
      setSaving(false);
    }
  }

  function resetLayout() {
    const confirmReset = window.confirm(
      `Reset ${moduleName} layout to default? Custom fields will be removed from layout.`
    );

    if (!confirmReset) return;

    const repairedLayout = repairLayoutWithRequiredFields(
      defaultLayout,
      moduleName,
      defaultLayout
    );

    setLayout(repairedLayout);
    setMessage(`${moduleName} layout reset. Click Save Layout to update backend.`);
  }

  function addSection() {
    const newSection = {
      id: `section_${Date.now()}`,
      title: "New Section",
      fields: [],
    };

    setLayout((prev) => [...prev, newSection]);
    setSelectedSectionId(newSection.id);
  }

  function startRenameSection(section) {
    setEditingSectionId(section.id);
    setSectionTitle(section.title);
  }

  function saveSectionTitle() {
    if (!sectionTitle.trim()) {
      setMessage("Section title cannot be empty.");
      return;
    }

    setLayout((prev) =>
      prev.map((section) =>
        section.id === editingSectionId
          ? {
              ...section,
              title: sectionTitle.trim(),
            }
          : section
      )
    );

    setEditingSectionId(null);
    setSectionTitle("");
  }

  function deleteSection(sectionId) {
    const section = layout.find((item) => item.id === sectionId);

    const hasProtectedField = section?.fields?.some((field) =>
      isProtectedField(field)
    );

    if (hasProtectedField) {
      setMessage(
        "This section contains required system fields. Move those fields to another section before deleting."
      );
      return;
    }

    const confirmDelete = window.confirm("Delete this section?");

    if (!confirmDelete) return;

    setLayout((prev) => prev.filter((section) => section.id !== sectionId));
  }

  function openNewFieldModal(sectionId, fieldType) {
    if (customFieldCount >= MODULE_LAYOUT_LIMIT) {
      setMessage(`Maximum ${MODULE_LAYOUT_LIMIT} custom fields are allowed.`);
      return;
    }

    const baseName = `custom_${fieldType}_${Date.now()}`;

    setEditingField({
      mode: "create",
      sectionId,
      id: `field_${Date.now()}`,
      name: baseName,
      label: "New Field",
      type: fieldType,
      required: false,
      source: "custom",
      placeholder: "",
      masterCategory: "",
    });
  }

  function openEditFieldModal(sectionId, field) {
    setEditingField({
      mode: "edit",
      sectionId,
      ...field,
      protected: isProtectedField(field),
    });
  }

  function closeFieldModal() {
    setEditingField(null);
  }

  function saveField() {
    if (!editingField.label.trim()) {
      setMessage("Field label is required.");
      return;
    }

    let cleanName = normalizeKey(editingField.name);

    if (!cleanName) {
      cleanName = normalizeKey(editingField.label);
    }

    if (!cleanName) {
      setMessage("Field name is required.");
      return;
    }

    const isProtected = Boolean(editingField.protected);

    if (isProtected) {
      cleanName = editingField.name;
    }

    const duplicateExists = allFieldNames.some((name) => {
      if (editingField.mode === "edit" && name === editingField.name) {
        return false;
      }

      return name === cleanName;
    });

    if (duplicateExists) {
      setMessage("Field name already exists in this layout.");
      return;
    }

    const fieldToSave = {
      id: editingField.id,
      name: cleanName,
      label: editingField.label.trim(),
      type: isProtected ? editingField.type : editingField.type,
      required: isProtected ? true : Boolean(editingField.required),
      source: isProtected ? "system" : editingField.source || "custom",
      placeholder: editingField.placeholder || "",
      masterCategory:
        editingField.type === "picklist"
          ? editingField.masterCategory || ""
          : "",
    };

    setLayout((prev) =>
      prev.map((section) => {
        if (section.id !== editingField.sectionId) {
          return section;
        }

        if (editingField.mode === "create") {
          return {
            ...section,
            fields: [...section.fields, fieldToSave],
          };
        }

        return {
          ...section,
          fields: section.fields.map((field) =>
            field.id === editingField.id ? fieldToSave : field
          ),
        };
      })
    );

    setEditingField(null);
  }

  function deleteField(sectionId, field) {
    if (isProtectedField(field)) {
      setMessage(
        `${field.label} is a required system field and cannot be deleted.`
      );
      return;
    }

    const confirmDelete = window.confirm(`Delete field "${field.label}"?`);

    if (!confirmDelete) return;

    setLayout((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              fields: section.fields.filter((item) => item.id !== field.id),
            }
          : section
      )
    );
  }

  function moveField(sectionId, fieldId, direction) {
    setLayout((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) return section;

        const fields = [...section.fields];
        const index = fields.findIndex((field) => field.id === fieldId);

        if (index === -1) return section;

        const newIndex = direction === "up" ? index - 1 : index + 1;

        if (newIndex < 0 || newIndex >= fields.length) return section;

        const temp = fields[index];
        fields[index] = fields[newIndex];
        fields[newIndex] = temp;

        return {
          ...section,
          fields,
        };
      })
    );
  }

  function handleNewFieldDragStart(fieldType) {
    setDraggedField(fieldType);
    setDraggedExistingField(null);
  }

  function handleExistingFieldDragStart(sectionId, field) {
    setDraggedExistingField({
      sectionId,
      fieldId: field.id,
    });
    setDraggedField(null);
  }

  function handleDropOnSection(sectionId) {
    if (draggedField) {
      openNewFieldModal(sectionId, draggedField);
      setDraggedField(null);
      return;
    }

    if (draggedExistingField) {
      setLayout((prev) => {
        let movedField = null;

        const withoutMoved = prev.map((section) => {
          if (section.id !== draggedExistingField.sectionId) return section;

          movedField = section.fields.find(
            (field) => field.id === draggedExistingField.fieldId
          );

          return {
            ...section,
            fields: section.fields.filter(
              (field) => field.id !== draggedExistingField.fieldId
            ),
          };
        });

        if (!movedField) return prev;

        return withoutMoved.map((section) =>
          section.id === sectionId
            ? {
                ...section,
                fields: [...section.fields, movedField],
              }
            : section
        );
      });

      setDraggedExistingField(null);
    }
  }

  function handleDropOnField(targetSectionId, targetFieldId) {
    if (!draggedExistingField) return;

    setLayout((prev) => {
      let movedField = null;

      const removedLayout = prev.map((section) => {
        if (section.id !== draggedExistingField.sectionId) return section;

        movedField = section.fields.find(
          (field) => field.id === draggedExistingField.fieldId
        );

        return {
          ...section,
          fields: section.fields.filter(
            (field) => field.id !== draggedExistingField.fieldId
          ),
        };
      });

      if (!movedField) return prev;

      return removedLayout.map((section) => {
        if (section.id !== targetSectionId) return section;

        const targetIndex = section.fields.findIndex(
          (field) => field.id === targetFieldId
        );

        const fields = [...section.fields];

        if (targetIndex === -1) {
          fields.push(movedField);
        } else {
          fields.splice(targetIndex, 0, movedField);
        }

        return {
          ...section,
          fields,
        };
      });
    });

    setDraggedExistingField(null);
  }

  function renderPreviewField(field) {
    if (field.type === "picklist") {
      return (
        <select disabled>
          <option>{field.label}</option>
        </select>
      );
    }

    if (field.type === "multiline") {
      return <textarea disabled placeholder={field.placeholder || field.label} />;
    }

    if (field.type === "checkbox") {
      return (
        <label className="switch-row">
          <input type="checkbox" disabled />
          <span>No</span>
        </label>
      );
    }

    return (
      <input
        disabled
        type={
          field.type === "date"
            ? "date"
            : field.type === "email"
            ? "email"
            : field.type === "phone"
            ? "tel"
            : field.type === "number" || field.type === "decimal"
            ? "number"
            : field.type === "url"
            ? "url"
            : "text"
        }
        placeholder={field.placeholder || field.label}
      />
    );
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Layout Builder</p>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>

        <div className="module-header-actions">
          <button
            type="button"
            className="light-button"
            onClick={() => navigate(backPath)}
          >
            <ArrowLeft size={17} />
            Back
          </button>

          <button
            type="button"
            className="light-button"
            onClick={() => setPreviewMode((prev) => !prev)}
          >
            <Eye size={17} />
            {previewMode ? "Builder View" : "Preview"}
          </button>

          <button type="button" className="light-button" onClick={resetLayout}>
            <RotateCcw size={17} />
            Reset
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={saveLayout}
            disabled={saving}
          >
            <Save size={17} />
            {saving ? "Saving..." : "Save Layout"}
          </button>
        </div>
      </section>

      {message && <div className="toast-notification">{message}</div>}

      <section className="summary-strip report-summary-grid">
        <div className="summary-card">
          <Layers size={22} />
          <div>
            <span>Sections</span>
            <strong>{layout.length}</strong>
          </div>
        </div>

        <div className="summary-card">
          <Type size={22} />
          <div>
            <span>Total Fields</span>
            <strong>{getAllFields(layout).length}</strong>
          </div>
        </div>

        <div className="summary-card warning">
          <ShieldCheck size={22} />
          <div>
            <span>Protected Fields</span>
            <strong>{requiredFieldNames.length}</strong>
          </div>
        </div>

        <div className="summary-card">
          <PlusCircle size={22} />
          <div>
            <span>Custom Fields</span>
            <strong>
              {customFieldCount}/{MODULE_LAYOUT_LIMIT}
            </strong>
          </div>
        </div>
      </section>

      <div className="mlb-builder-grid">
        {!previewMode && (
          <aside className="mlb-toolbox">
            <div className="mlb-toolbox-header">
              <h3>Field Toolbox</h3>
              <p>Drag a field type into a section.</p>
            </div>

            <div className="mlb-toolbox-list">
              {FIELD_TYPES.map((fieldType) => {
                const Icon = fieldType.icon;

                return (
                  <div
                    key={fieldType.type}
                    className="mlb-toolbox-item"
                    draggable
                    onDragStart={() => handleNewFieldDragStart(fieldType.type)}
                  >
                    <Icon size={17} />
                    <span>{fieldType.label}</span>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              className="primary-button mlb-add-section-button"
              onClick={addSection}
            >
              <PlusCircle size={17} />
              Add Section
            </button>
          </aside>
        )}

        <section className="form-panel mlb-canvas">
          <div className="panel-header">
            <div>
              <h3>{previewMode ? "Form Preview" : "Layout Canvas"}</h3>
              <p>
                Required system fields are protected and cannot be deleted.
              </p>
            </div>
          </div>

          {layout.map((section) => (
            <div
              key={section.id}
              className="mlb-section-card"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDropOnSection(section.id)}
            >
              <div className="mlb-section-header">
                {editingSectionId === section.id ? (
                  <div className="mlb-section-title-editor">
                    <input
                      value={sectionTitle}
                      onChange={(e) => setSectionTitle(e.target.value)}
                    />
                    <button
                      type="button"
                      className="primary-button"
                      onClick={saveSectionTitle}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="light-button"
                      onClick={() => {
                        setEditingSectionId(null);
                        setSectionTitle("");
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
                      <div className="action-buttons">
                        <button
                          type="button"
                          className="edit-button"
                          onClick={() => startRenameSection(section)}
                        >
                          <Edit size={15} />
                        </button>

                        <button
                          type="button"
                          className="delete-button"
                          onClick={() => deleteSection(section.id)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {section.fields.length === 0 ? (
                <div className="empty-table">
                  Drag fields here or click a field type.
                </div>
              ) : previewMode ? (
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
                      </label>
                      {renderPreviewField(field)}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mlb-field-list">
                  {section.fields.map((field, index) => (
                    <div
                      key={field.id}
                      className={
                          isProtectedField(field)
                            ? "mlb-field-card mlb-protected-field"
                            : "mlb-field-card"
                        }
                      draggable
                      onDragStart={() =>
                        handleExistingFieldDragStart(section.id, field)
                      }
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDropOnField(section.id, field.id)}
                    >
                      <div className="mlb-field-left">
                        <GripVertical size={16} />
                        <div>
                          <strong>
                            {field.label}
                            {field.required && " *"}
                          </strong>
                          <p>
                            {field.name} • {field.type} • {field.source}
                            {isProtectedField(field) && " • protected"}
                          </p>
                        </div>
                      </div>

                      <div className="action-buttons">
                        <button
                          type="button"
                          className="light-button"
                          onClick={() => moveField(section.id, field.id, "up")}
                          disabled={index === 0}
                        >
                          ↑
                        </button>

                        <button
                          type="button"
                          className="light-button"
                          onClick={() => moveField(section.id, field.id, "down")}
                          disabled={index === section.fields.length - 1}
                        >
                          ↓
                        </button>

                        <button
                          type="button"
                          className="edit-button"
                          onClick={() => openEditFieldModal(section.id, field)}
                        >
                          <Edit size={15} />
                        </button>

                        <button
                          type="button"
                          className="delete-button"
                          onClick={() => deleteField(section.id, field)}
                          disabled={isProtectedField(field)}
                          title={
                            isProtectedField(field)
                              ? "Required system field cannot be deleted"
                              : "Delete field"
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      </div>

      {editingField && (
        <div className="student-drawer-backdrop">
          <aside className="student-drawer">
            <button
              type="button"
              className="drawer-close"
              onClick={closeFieldModal}
            >
              <X size={18} />
            </button>

            <div className="student-profile-head">
              <div className="student-avatar">
                {editingField.protected ? (
                  <ShieldCheck size={42} />
                ) : (
                  <Type size={42} />
                )}
              </div>

              <h3>
                {editingField.mode === "create"
                  ? "Add Custom Field"
                  : "Edit Field"}
              </h3>

              <p>
                {editingField.protected
                  ? "Required system field"
                  : "Customizable field"}
              </p>
            </div>

            <div className="drawer-section">
              <div className="classic-form">
                <div className="form-field">
                  <label>Field Label *</label>
                  <input
                    value={editingField.label}
                    onChange={(e) =>
                      setEditingField((prev) => ({
                        ...prev,
                        label: e.target.value,
                        name:
                          prev.protected || prev.mode === "edit"
                            ? prev.name
                            : `custom_${normalizeKey(e.target.value)}`,
                      }))
                    }
                  />
                </div>

                <div className="form-field">
                  <label>Field Name *</label>
                  <input
                    value={editingField.name}
                    disabled={editingField.protected}
                    onChange={(e) =>
                      setEditingField((prev) => ({
                        ...prev,
                        name: normalizeKey(e.target.value),
                      }))
                    }
                  />
                  {editingField.protected && (
                    <small>This system field name cannot be changed.</small>
                  )}
                </div>

                <div className="form-field">
                  <label>Field Type</label>
                  <select
                    value={editingField.type}
                    disabled={editingField.protected}
                    onChange={(e) =>
                      setEditingField((prev) => ({
                        ...prev,
                        type: e.target.value,
                      }))
                    }
                  >
                    {FIELD_TYPES.map((item) => (
                      <option key={item.type} value={item.type}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>

                {editingField.type === "picklist" && (
                  <div className="form-field">
                    <label>Master Category</label>
                    <select
                      value={editingField.masterCategory || ""}
                      disabled={editingField.protected}
                      onChange={(e) =>
                        setEditingField((prev) => ({
                          ...prev,
                          masterCategory: e.target.value,
                        }))
                      }
                    >
                      <option value="">Select Category</option>
                      {MASTER_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="form-field">
                  <label>Placeholder</label>
                  <input
                    value={editingField.placeholder || ""}
                    onChange={(e) =>
                      setEditingField((prev) => ({
                        ...prev,
                        placeholder: e.target.value,
                      }))
                    }
                  />
                </div>

                <label className="switch-row">
                  <input
                    type="checkbox"
                    checked={Boolean(editingField.required)}
                    disabled={editingField.protected}
                    onChange={(e) =>
                      setEditingField((prev) => ({
                        ...prev,
                        required: e.target.checked,
                      }))
                    }
                  />
                  <span>Required Field</span>
                </label>

                {editingField.protected && (
                  <div className="message-box">
                    This is a protected system field. You may rename the label,
                    but field name, type, source and required status are locked.
                  </div>
                )}

                <div className="form-actions">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={saveField}
                  >
                    <Save size={17} />
                    Save Field
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
          </aside>
        </div>
      )}
    </div>
  );
}