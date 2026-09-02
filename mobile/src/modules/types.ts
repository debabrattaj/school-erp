import type { ComponentType } from "react";

export type FieldType =
  | "text"
  | "number"
  | "email"
  | "date"
  /** Clock time, "HH:MM". */
  | "time"
  | "select"
  | "textarea"
  | "phone"
  /** Pick/capture an image, upload it, store the returned URL. */
  | "photo"
  /** Numeric foreign key chosen from another module's records. */
  | "reference"
  /**
   * A text value chosen from another module's records — e.g. `class_name`
   * picked from the Classes list. Stores the record's display value, not its id,
   * because that is what these denormalised columns hold.
   */
  | "lookup"
  /** A value chosen from a Master Data category (Gender, House, Section, …). */
  | "masterSelect"
  /** Masked entry for credentials. */
  | "password";

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
  /** For `lookup` fields: which module to pick from, and which value to store. */
  lookup?: {
    endpoint: string;
    /** The field whose value is saved (e.g. "class_name"). */
    valueField: string;
    /**
     * Fields joined with a space to form the saved value, when one column is
     * not the whole of it. A student's name lives in `first_name` and
     * `last_name`, so storing `valueField` alone saved "Asha" for "Asha Rao".
     * Takes precedence over `valueField` when set.
     */
    valueFields?: string[];
    searchFields: string[];
    subtitleFields?: string[];
  };
  /** For `masterSelect` fields: the Master Data category to offer. */
  masterCategory?: string;
  /**
   * Rendered read-only. Reserved for fields a school has not had switched on —
   * the value still shows, but cannot be edited from the app.
   */
  disabled?: boolean;
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
  /**
   * Built-in roles allowed by name, mirroring the web sidebar's `roles` list.
   * Only needed where a role is granted the module by name rather than through
   * its permission map.
   */
  roles?: readonly string[];
  /**
   * The key in the school's `features` map, when it differs from `feature`
   * (Leave is granted as "staff_leave" but sold as "leave"). Defaults to
   * `feature`.
   */
  featureFlag?: string;
  endpoint: string;
  /**
   * False when `{endpoint}/{id}` is a *different* route rather than a missing
   * one, so the record must be found in the list instead. Master Data is the
   * case: `/master-data/{category}` reads the id as a category name.
   */
  hasDetailRoute?: boolean;
  /**
   * The list endpoint understands `search`, `sort`, `order`, `limit` and
   * `offset`, so this module fetches a page at a time and hands searching and
   * sorting to the server.
   *
   * Only set where the table grows with use. Paging a list while still
   * searching it client-side would silently search only the loaded page, so
   * the two go together or not at all.
   */
  paged?: boolean;
  titleField: string;
  subtitleField?: string;
  searchFields: string[];
  listColumns: ListColumnConfig[];
  formFields: FormFieldConfig[];
  readOnlyDetailFields?: { key: string; label: string }[];
  allowCreate?: boolean;
  allowEdit?: boolean;
  allowDelete?: boolean;
  /** Overrides the generic field-list detail screen with a bespoke one, e.g. a composite dashboard. */
  detailComponent?: ComponentType<any>;
}
