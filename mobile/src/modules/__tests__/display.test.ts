import { formatFieldValue, singular } from "../display";

describe("singular", () => {
  it("drops a trailing s", () => {
    expect(singular("Students")).toBe("Student");
    expect(singular("Exams")).toBe("Exam");
  });

  it("leaves a title that is not plural alone", () => {
    // `slice(0, -1)` turned this into "Master Dat".
    expect(singular("Master Data")).toBe("Master Data");
    expect(singular("Timetable")).toBe("Timetable");
  });

  it("handles -ies and -es plurals", () => {
    expect(singular("Curricula")).toBe("Curricula");
    expect(singular("Categories")).toBe("Category");
    expect(singular("Classes")).toBe("Class");
  });

  it("does not mangle a word ending in double s", () => {
    expect(singular("Progress")).toBe("Progress");
  });
});

describe("formatFieldValue", () => {
  it("renders booleans as Yes/No rather than true/false", () => {
    expect(formatFieldValue({ type: "text" }, true)).toBe("Yes");
    expect(formatFieldValue({ type: "text" }, false)).toBe("No");
  });

  it("shows a select's label, not its stored value", () => {
    const field = {
      type: "select" as const,
      options: [{ label: "Day Scholar", value: "DAY" }],
    };
    expect(formatFieldValue(field, "DAY")).toBe("Day Scholar");
  });

  it("falls back to the raw value when a select option is unknown", () => {
    const field = { type: "select" as const, options: [{ label: "A", value: "a" }] };
    expect(formatFieldValue(field, "zzz")).toBe("zzz");
  });

  it("never prints a photo path or a password", () => {
    expect(formatFieldValue({ type: "photo" }, "/uploads/x.jpg")).toBe("Photo attached");
    expect(formatFieldValue({ type: "password" }, "hunter2")).toBe("••••••••");
  });

  it("trims a timestamp on a date field", () => {
    expect(formatFieldValue({ type: "date" }, "2026-03-04T00:00:00")).toBe("2026-03-04");
  });

  it("shows a dash for empty values", () => {
    expect(formatFieldValue({ type: "text" }, null)).toBe("—");
    expect(formatFieldValue({ type: "text" }, undefined)).toBe("—");
    expect(formatFieldValue({ type: "text" }, "")).toBe("—");
  });

  it("keeps zero, which is a real value", () => {
    expect(formatFieldValue({ type: "number" }, 0)).toBe("0");
  });
});
