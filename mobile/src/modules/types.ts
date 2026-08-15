export type FieldType =
  | "text"
  | "number"
  | "email"
  | "date"
  | "select"
  | "textarea"
  | "phone"
  /** Pick/capture an image, upload it, store the returned URL. */
  | "photo"
  /** Numeric foreign key chosen from another module's records. */
  | "reference";

export interface FormFieldConfig {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: { label: string; value: string }[];
  placeholder?: string;
  /** For `reference` fields: where to pick the record from. */
  reference?: {
    endpoint: string;
    /** Fields to search, and the fields composing the display label. */
    searchFields: string[];
    labelFields: string[];
    subtitleFields?: string[];
  };
}

export interface ListColumnConfig {
  key: string;
  label: string;
  primary?: boolean;
}

/** Drawer sections, in the order they appear. */
/**
 * Same groups, in the same order, as the web sidebar's GROUP_ORDER
 * (`frontend/src/components/Sidebar.jsx`), so a user moving between the two
 * clients finds each module filed where they expect it.
 */
export const MODULE_GROUPS = [
  "Overview",
  "Finance & Operations",
  "Academics",
  "Students",
  "Admissions",
  "Student Wellbeing",
  "Communication & Portal",
  "People & Access",
  "Reports & Administration",
] as const;

export type ModuleGroup = (typeof MODULE_GROUPS)[number];

export interface ModuleConfig {
  key: string;
  title: string;
  /** Short monogram shown on the drawer/list tile. */
  icon: string;
  group: ModuleGroup;
  feature: string;
  endpoint: string;
  titleField: string;
  subtitleField?: string;
  searchFields: string[];
  listColumns: ListColumnConfig[];
  formFields: FormFieldConfig[];
  readOnlyDetailFields?: { key: string; label: string }[];
  allowCreate?: boolean;
  allowEdit?: boolean;
  allowDelete?: boolean;
}
