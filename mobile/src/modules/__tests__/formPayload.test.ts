import { buildFormPayload } from "../formPayload";
import { FormFieldConfig } from "../types";

const fields: FormFieldConfig[] = [
  { key: "title", label: "Title", type: "text", required: true },
  { key: "due_date", label: "Due Date", type: "date" },
  { key: "seats", label: "Seats", type: "number" },
  { key: "student_id", label: "Student", type: "reference" },
];

describe("buildFormPayload", () => {
  it("sends a field the user cleared as null so it actually clears", () => {
    const { payload } = buildFormPayload(
      fields,
      { title: "Homework", due_date: "" },
      { title: "Homework", due_date: "2026-09-10" },
      true
    );
    expect(payload).toEqual({ title: "Homework", due_date: null });
  });

  it("omits a field that was never filled in", () => {
    const { payload } = buildFormPayload(fields, { title: "Homework" }, { title: "Homework" }, true);
    expect(payload).toEqual({ title: "Homework" });
    expect("due_date" in payload).toBe(false);
  });

  it("never sends nulls when creating", () => {
    const { payload } = buildFormPayload(fields, { title: "New" }, {}, false);
    expect(payload).toEqual({ title: "New" });
  });

  it("sends numbers and references as numbers", () => {
    const { payload } = buildFormPayload(
      fields,
      { title: "x", seats: "30", student_id: "7" },
      {},
      false
    );
    expect(payload).toMatchObject({ seats: 30, student_id: 7 });
  });

  it("flags non-numeric input instead of sending NaN", () => {
    const { notNumeric } = buildFormPayload(fields, { title: "x", seats: "thirty" }, {}, false);
    expect(notNumeric.map((f) => f.key)).toEqual(["seats"]);
  });

  it("accepts a negative or decimal number", () => {
    const { notNumeric, payload } = buildFormPayload(fields, { title: "x", seats: "-2.5" }, {}, false);
    expect(notNumeric).toHaveLength(0);
    expect(payload.seats).toBe(-2.5);
  });

  it("reports blank required fields", () => {
    const { missing } = buildFormPayload(fields, { title: "   " }, {}, false);
    expect(missing.map((f) => f.key)).toEqual(["title"]);
  });
});
