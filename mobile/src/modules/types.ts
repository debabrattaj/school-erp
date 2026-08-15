export type FieldType = "text" | "number" | "email" | "date" | "select" | "textarea" | "phone";

export interface FormFieldConfig {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: { label: string; value: string }[];
  placeholder?: string;
}

export interface ListColumnConfig {
  key: string;
  label: string;
  primary?: boolean;
}

/** Drawer sections, in the order they appear. */
export const MODULE_GROUPS = [
  "Academics",
  "People",
  "Finance",
  "Student Life",
  "Facilities",
  "Admin",
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
