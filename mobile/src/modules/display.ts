import { FormFieldConfig } from "./types";

/**
 * "Students" → "Student". Titles are pluralised module names; `slice(0, -1)`
 * was used inline and mangled any title not ending in a plain "s"
 * ("Master Data" → "Master Dat").
 */
export function singular(title: string) {
  if (/[^aeiou]ies$/i.test(title)) return title.replace(/ies$/i, "y");
  if (/(ch|sh|ss|x|z)es$/i.test(title)) return title.replace(/es$/i, "");
  if (/[^s]s$/i.test(title)) return title.replace(/s$/i, "");
  return title;
}

/**
 * Renders a stored value the way its field type means it. `String(value)` alone
 * printed "true"/"false" for flags and a raw "/uploads/..." path for photos.
 */
export function formatFieldValue(field: Pick<FormFieldConfig, "type" | "options">, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";

  if (field.type === "select" && field.options) {
    const match = field.options.find((o) => o.value === String(value));
    if (match) return match.label;
  }
  if (field.type === "photo") return "Photo attached";
  if (field.type === "password") return "••••••••";
  if (field.type === "date") return String(value).slice(0, 10);

  if (Array.isArray(value)) return value.map((v) => String(v)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
