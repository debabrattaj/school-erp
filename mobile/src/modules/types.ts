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

export interface ModuleConfig {
  key: string;
  title: string;
  icon: string;
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
