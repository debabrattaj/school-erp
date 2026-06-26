export function saveAuth(token, user) {
  localStorage.setItem("school_erp_token", token);
  localStorage.setItem("school_erp_user", JSON.stringify(user));
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
}

export function isLoggedIn() {
  return !!getToken();
}

export function hasAccess(allowedRoles) {
  const user = getUser();

  if (!user) return false;

  if (!allowedRoles || allowedRoles.length === 0) return true;

  return allowedRoles.includes(user.role);
}