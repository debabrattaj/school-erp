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

export function hasAccess(allowedRoles) {
  const user = getUser();

  if (!user) return false;

  if (!allowedRoles || allowedRoles.length === 0) return true;

  if (allowedRoles.includes(user.role)) return true;

  // Custom roles aren't in any route's allowedRoles list. Let them through the
  // route guard — the sidebar hides pages they lack, and the backend enforces
  // every request by permission (returns 403 if not granted).
  return isCustomRole();
}

export function isFeatureEnabled(featureKey) {
  if (!featureKey) return true;

  const user = getUser();

  if (!user?.features) return true;

  return user.features[featureKey] !== false;
}
