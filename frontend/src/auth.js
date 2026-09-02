export function saveAuth(token, user) {
  localStorage.setItem("school_erp_token", token);
  localStorage.setItem("school_erp_user", JSON.stringify(user));

  if (user?.account?.account_code) {
    localStorage.setItem("school_erp_account_code", user.account.account_code);
  }

  window.dispatchEvent(new CustomEvent("school-erp-auth-updated"));
}

export function getToken() {
  return localStorage.getItem("school_erp_token");
}

export function getUser() {
  const user = localStorage.getItem("school_erp_user");

  if (!user) return null;

  return JSON.parse(user);
}

export function logout() {
  localStorage.removeItem("school_erp_token");
  localStorage.removeItem("school_erp_user");
  localStorage.removeItem("school_erp_account_code");
  window.dispatchEvent(new CustomEvent("school-erp-auth-updated"));
}

export function isLoggedIn() {
  return !!getToken();
}

const BUILT_IN_ROLES = ["Admin", "Principal", "Accounts", "Teacher", "Parent", "Student"];

export function isCustomRole() {
  const user = getUser();
  return !!user && !BUILT_IN_ROLES.includes(user.role);
}

// Mirrors backend/app/permissions.py's PATH_FEATURE_MAP -- keep the two in
// sync. Maps a frontend route prefix to the feature key a custom role's
// permission map is keyed by. Longest prefix wins, matching feature_for_path().
const PATH_FEATURE_MAP = {
  "/students": "students",
  "/teachers": "teachers",
  "/classes": "classes",
  "/attendance": "attendance",
  "/fees": "fees",
  "/accounting": "accounting",
  "/exams": "exams",
  "/marks": "marks",
  "/timetable": "timetable",
  "/payroll": "payroll",
  "/homework": "homework",
  "/online-tests": "online_tests",
  "/admissions": "admissions",
  "/admission-assessments": "admissions",
  "/communications": "parent_communication",
  "/student-services": "student_services",
  "/counseling": "counseling",
  "/enrichment": "enrichment",
  "/compliance": "compliance",
  "/international-documents": "international_documents",
  "/multi-curriculum": "multi_curriculum",
  "/academic-years": "academic_years",
  "/hostel": "hostel",
  "/transport": "transport",
  "/health-infirmary": "health_infirmary",
  "/mess": "mess_management",
  "/library": "library",
  "/inventory": "inventory",
  "/alumni-withdrawals": "alumni_withdrawals",
  "/leave": "staff_leave",
  "/concessions": "fee_concessions",
  "/gate": "gate_register",
  "/syllabus": "syllabus",
  "/transport-tracking": "vehicle_tracking",
  "/master-data": "master_data",
  "/users": "users",
  "/settings": "settings",
};

function featureForPath(pathname) {
  if (pathname === "/") return "dashboard";

  let best = null;
  for (const [prefix, feature] of Object.entries(PATH_FEATURE_MAP)) {
    if (pathname.startsWith(prefix) && (!best || prefix.length > best[0].length)) {
      best = [prefix, feature];
    }
  }
  return best ? best[1] : null;
}

// Mirrors backend/app/permissions.py's permission_grants().
function permissionGrants(permissions, feature, action) {
  if (!permissions) return false;
  if (permissions["*"] === "manage") return true;
  const level = permissions[feature];
  if (level === "manage") return true;
  if (level === "view" && action === "view") return true;
  return false;
}

// `action` is "view" (page/read access, the default) or "manage" (a mutating
// action gated within a page). Built-in roles are checked by name, exactly as
// before. Custom roles are checked against their real permission map for
// whichever feature the current page belongs to -- the same check the
// backend already independently enforces on every request, so this can only
// ever hide UI a custom role's actual API calls would already get 403'd on.
export function hasAccess(allowedRoles, action = "view") {
  const user = getUser();

  if (!user) return false;

  if (!allowedRoles || allowedRoles.length === 0) return true;

  if (allowedRoles.includes(user.role)) return true;

  if (!isCustomRole()) return false;

  const feature = featureForPath(window.location.pathname);
  if (!feature) return false;

  return permissionGrants(user.permissions, feature, action);
}

export function isFeatureEnabled(featureKey) {
  if (!featureKey) return true;

  const user = getUser();

  if (!user?.features) return true;

  return user.features[featureKey] !== false;
}
