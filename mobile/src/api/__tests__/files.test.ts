import { buildFileUrl, buildQuery } from "../files";

describe("buildQuery", () => {
  it("drops empty, null and undefined values", () => {
    expect(buildQuery({ a: 1, b: "", c: undefined })).toBe("?a=1");
  });

  it("returns nothing when every value is dropped", () => {
    expect(buildQuery({ a: "", b: undefined })).toBe("");
    expect(buildQuery(undefined)).toBe("");
  });

  it("encodes keys and values", () => {
    expect(buildQuery({ "a b": "c&d" })).toBe("?a%20b=c%26d");
  });
});

describe("buildFileUrl", () => {
  it("builds the certificate paths the screens ask for", () => {
    expect(buildFileUrl("https://host/api", "/students/7/bonafide")).toBe(
      "https://host/api/students/7/bonafide"
    );
  });

  it("carries the report-card parameters", () => {
    expect(
      buildFileUrl("https://host/api", "/marks/report-card", { student_id: 4, exam_id: 1 })
    ).toBe("https://host/api/marks/report-card?student_id=4&exam_id=1");
  });

  it("does not double up slashes for a base that has none trailing", () => {
    expect(buildFileUrl("https://host/api", "/x")).not.toContain("//x");
  });
});
