export type PermissionLevel = "view" | "manage";

export type PermissionMap = Record<string, PermissionLevel>;

export type Role = "Admin" | "Principal" | "Accounts" | "Teacher" | "Parent" | "Student" | string;

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  mfa_enabled: boolean;
  permissions: PermissionMap;
  account: {
    account_code: string;
    name?: string;
    [key: string]: unknown;
  };
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

export function hasAccess(permissions: PermissionMap | undefined, feature: string, level: PermissionLevel = "view") {
  if (!permissions) return false;
  const grant = permissions["*"] || permissions[feature];
  if (!grant) return false;
  if (level === "view") return grant === "view" || grant === "manage";
  return grant === "manage";
}

const BUILT_IN_ROLES: Role[] = ["Admin", "Principal", "Accounts", "Teacher", "Parent", "Student"];

export function isCustomRole(role: Role | undefined) {
  return !!role && !BUILT_IN_ROLES.includes(role);
}

/**
 * A handful of backend routes gate a specific action to a role list
 * narrower than what that role's own permissions map claims for the whole
 * feature (e.g. syllabus/routes.py's REVIEWERS = ["Admin", "Principal"] for
 * deleting a unit or approving a lesson plan, even though Teacher's
 * permission map says "syllabus": "manage" -- Teacher can create/edit but
 * not delete/approve). For a *built-in* role, `hasAccess()` alone can't see
 * that distinction (built-in roles are authorized by literal name on the
 * backend, not by their permissions map), so check the same literal list
 * here to avoid showing a button that will 403. Custom roles ARE authorized
 * by their permission map for these same routes (require_roles() only
 * consults its role-name list for built-ins), so hasAccess() alone is
 * correct for them.
 */
export function hasReviewerAccess(role: Role | undefined, permissions: PermissionMap | undefined, feature: string) {
  if (isCustomRole(role)) return hasAccess(permissions, feature, "manage");
  return role === "Admin" || role === "Principal";
}

export function isPortalRole(role: Role) {
  return role === "Parent" || role === "Student";
}
