import { toISODate, toLocalISODate, todayISO } from "../dates";

describe("toLocalISODate", () => {
  it("uses the local calendar, not UTC", () => {
    // 00:30 on 1 September, local time. toISOString() on this instant reports
    // 31 August in any timezone east of UTC — the bug that filed attendance,
    // gate passes and payroll payment dates against the wrong day.
    const justAfterMidnight = new Date(2026, 8, 1, 0, 30, 0);
    expect(toLocalISODate(justAfterMidnight)).toBe("2026-09-01");
  });

  it("zero-pads single-digit months and days", () => {
    expect(toLocalISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("handles the last instant of a day", () => {
    expect(toLocalISODate(new Date(2026, 11, 31, 23, 59, 59))).toBe("2026-12-31");
  });
});

describe("todayISO", () => {
  it("agrees with the local calendar", () => {
    const now = new Date();
    expect(todayISO()).toBe(toLocalISODate(now));
  });
});

describe("toISODate", () => {
  it("keeps a plain date", () => {
    expect(toISODate("2026-03-04")).toBe("2026-03-04");
  });

  it("trims a full timestamp to its date", () => {
    expect(toISODate("2026-03-04T11:22:33.456789")).toBe("2026-03-04");
  });

  it("returns empty for anything unparseable", () => {
    expect(toISODate("")).toBe("");
    expect(toISODate(null)).toBe("");
    expect(toISODate(undefined)).toBe("");
    expect(toISODate("not a date")).toBe("");
  });
});
