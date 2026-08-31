import { canAdminister, canViewModule, hasAccess, isBuiltInRole, isPortalRole } from "../types";

const principal = {
  role: "Principal",
  permissions: { attendance: "manage", staff_leave: "manage", reports: "view" } as const,
};
const teacher = {
  role: "Teacher",
  permissions: { attendance: "manage", staff_leave: "view", syllabus: "manage" } as const,
};
const admin = { role: "Admin", permissions: { "*": "manage" } as const };
const frontDesk = {
  // A custom role, authorized by its permission map rather than its name.
  role: "Front Desk",
  permissions: { gate_register: "manage", dashboard: "view" } as const,
};

describe("hasAccess", () => {
  it("treats * as a grant on everything", () => {
    expect(hasAccess(admin.permissions, "anything", "manage")).toBe(true);
  });

  it("distinguishes view from manage", () => {
    expect(hasAccess(teacher.permissions, "staff_leave", "view")).toBe(true);
    expect(hasAccess(teacher.permissions, "staff_leave", "manage")).toBe(false);
  });

  it("denies an unknown feature and an absent map", () => {
    expect(hasAccess(teacher.permissions, "payroll")).toBe(false);
    expect(hasAccess(undefined, "students")).toBe(false);
  });
});

describe("isBuiltInRole", () => {
  it("recognises the system roles and rejects custom ones", () => {
    expect(isBuiltInRole("Principal")).toBe(true);
    expect(isBuiltInRole("Front Desk")).toBe(false);
    expect(isBuiltInRole(undefined)).toBe(false);
  });
});

describe("canViewModule", () => {
  it("admits a built-in role by name when its permission map has no such key", () => {
    // The Leave module is granted to Principals by role, not by a "leave" key —
    // checking the map alone hid it from them entirely.
    expect(canViewModule(principal, "student_enrollments", ["Admin", "Principal", "Teacher"])).toBe(true);
  });

  it("admits any role by its permission map", () => {
    expect(canViewModule(frontDesk, "gate_register")).toBe(true);
  });

  it("does not admit a custom role by someone else's role list", () => {
    expect(canViewModule(frontDesk, "payroll", ["Admin", "Principal"])).toBe(false);
  });

  it("hides a module the school has switched off, whatever the permissions say", () => {
    const withFeatures = { ...admin, features: { hostel: false } };
    expect(canViewModule(withFeatures, "hostel")).toBe(false);
  });

  it("uses featureFlag when it differs from the permission key", () => {
    // Leave is granted as staff_leave but sold as "leave".
    const school = { ...principal, features: { leave: false } };
    expect(canViewModule(school, "staff_leave", ["Admin", "Principal"], "leave")).toBe(false);
    expect(canViewModule({ ...principal, features: { leave: true } }, "staff_leave", [], "leave")).toBe(true);
  });

  it("stays permissive when the backend sends no features map", () => {
    expect(canViewModule(principal, "attendance")).toBe(true);
  });

  it("denies with no user", () => {
    expect(canViewModule(null, "students")).toBe(false);
  });
});

describe("canAdminister", () => {
  it("allows Admin and Principal", () => {
    expect(canAdminister(admin, "staff_leave")).toBe(true);
    expect(canAdminister(principal, "staff_leave")).toBe(true);
  });

  it("refuses a Teacher even where their map says manage", () => {
    // The backend restricts approval to Admin/Principal by name, so a Teacher
    // with syllabus:manage still cannot sign off a lesson plan.
    expect(canAdminister(teacher, "syllabus")).toBe(false);
  });

  it("allows a custom role holding the manage grant", () => {
    // The case the old hardcoded role check locked out.
    expect(canAdminister(frontDesk, "gate_register")).toBe(true);
  });

  it("refuses a custom role without the grant", () => {
    expect(canAdminister(frontDesk, "staff_leave")).toBe(false);
  });
});

describe("isPortalRole", () => {
  it("routes families to the portal and staff to the drawer", () => {
    expect(isPortalRole("Parent")).toBe(true);
    expect(isPortalRole("Student")).toBe(true);
    expect(isPortalRole("Teacher")).toBe(false);
  });
});
