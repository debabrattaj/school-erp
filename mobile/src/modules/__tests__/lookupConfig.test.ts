import { alumniWithdrawalsModule, admissionsModule } from "../generated";
import { FormFieldConfig } from "../types";

function field(mod: { formFields: FormFieldConfig[] }, key: string) {
  const f = mod.formFields.find((x) => x.key === key);
  if (!f) throw new Error(`no field ${key}`);
  return f;
}

describe("student_name is the right control on each module", () => {
  it("Admissions CRM takes free text", () => {
    // The inquiry is for a prospective student, who is not in /students at all.
    const f = field(admissionsModule, "student_name");
    expect(f.type).toBe("text");
    expect(f.lookup).toBeUndefined();
  });

  it("Alumni & Exit picks an existing student", () => {
    const f = field(alumniWithdrawalsModule, "student_name");
    expect(f.type).toBe("lookup");
    expect(f.lookup?.endpoint).toBe("/students");
  });

  it("the Alumni lookup stores the whole name, not just the first", () => {
    // valueField alone saved "Asha" for "Asha Rao".
    expect(field(alumniWithdrawalsModule, "student_name").lookup?.valueFields).toEqual([
      "first_name",
      "last_name",
    ]);
  });

  it("both fields stay required", () => {
    expect(field(admissionsModule, "student_name").required).toBe(true);
    expect(field(alumniWithdrawalsModule, "student_name").required).toBe(true);
  });
});
