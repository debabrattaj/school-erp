import { FormFieldConfig } from "./types";

export interface PayloadResult {
  payload: Record<string, unknown>;
  /** Required fields the user left blank. */
  missing: FormFieldConfig[];
  /** Number fields holding something that is not a number. */
  notNumeric: FormFieldConfig[];
}

/**
 * Turns the form's string state into the body to send.
 *
 * Two rules matter here and both were bugs:
 *
 * - An empty value used to be skipped entirely, so the key vanished from the
 *   payload and the stored value survived — no field could ever be cleared
 *   once set. On an edit, a field that *had* a value and is now blank is sent
 *   as null; one that was never filled in is still omitted.
 * - A number field holding non-numeric text became NaN, which JSON encodes as
 *   null, silently wiping the column instead of reporting the typo.
 */
export function buildFormPayload(
  fields: FormFieldConfig[],
  values: Record<string, string>,
  loaded: Record<string, string>,
  isEdit: boolean
): PayloadResult {
  const missing = fields.filter((f) => f.required && !values[f.key]?.trim());
  const notNumeric = fields.filter(
    (f) =>
      (f.type === "number" || f.type === "reference") &&
      (values[f.key] ?? "") !== "" &&
      !Number.isFinite(Number(values[f.key]))
  );

  const payload: Record<string, unknown> = {};
  fields.forEach((f) => {
    const raw = values[f.key];
    if (raw === undefined || raw === "") {
      if (isEdit && loaded[f.key] !== undefined && loaded[f.key] !== "") payload[f.key] = null;
      return;
    }
    // A reference holds a foreign key, so it goes out as a number like any
    // other numeric field — not as the string the text input produced.
    payload[f.key] = f.type === "number" || f.type === "reference" ? Number(raw) : raw;
  });

  return { payload, missing, notNumeric };
}
