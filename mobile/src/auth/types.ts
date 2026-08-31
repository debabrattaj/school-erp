export type PermissionLevel = "view" | "manage";

export type PermissionMap = Record<string, PermissionLevel>;

export type Role = "Admin" | "Principal" | "Accounts" | "Teacher" | "Parent" | "Student" | string;

/**
 * Per-school module switches from the login response. A school that has not
 * bought Hostel, Transport, Library, Inventory, Mess, Infirmary, Online Tests,
 * Leave or Biometric gets `false` here, and every route behind that flag
 * answers 403 "This module is not enabled for your school."
 */
export type FeatureMap = Record<string, boolean>;

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  mfa_enabled: boolean;
  permissions: PermissionMap;
  features?: FeatureMap;
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

/** The roles the backend authorizes by name rather than by permission map. */
export const BUILT_IN_ROLES = ["Admin", "Principal", "Accounts", "Teacher", "Parent", "Student"] as const;

export function isBuiltInRole(role: Role | undefined) {
  return !!role && (BUILT_IN_ROLES as readonly string[]).includes(role);
}

/**
 * Should this module appear in the drawer?
 *
 * The same rule the web sidebar uses: a built-in role is allowed by name, and
 * any role is allowed by its permission map. Gating on the permission map
 * alone — which is what this app did — hid eleven modules from Principals,
 * Teachers and Accounts users that the web shows them, because the built-in
 * role maps simply have no entry for those features.
 */
export function canViewModule(
  user: { role?: Role; permissions?: PermissionMap; features?: FeatureMap } | null | undefined,
  feature: string,
  roles?: readonly string[],
  featureFlag?: string
) {
  if (!user) return false;

  // The school's own module switches come first. This app ignored them
  // entirely, so a school without Hostel, Transport, Library, Inventory, Mess,
  // Infirmary, Online Tests, Leave or Biometric still saw all nineteen of those
  // entries in the drawer, and every one of them opened onto a 403.
  const flag = featureFlag ?? feature;
  if (user.features && user.features[flag] === false) return false;

  if (hasAccess(user.permissions, feature, "view")) return true;
  return !!roles && isBuiltInRole(user.role) && roles.includes(user.role as string);
}

/**
 * Can this user take an approver-only action (approving leave, signing off a
 * lesson plan)? The backend restricts these to Admin and Principal by name for
 * built-in roles, and to the feature's `manage` grant for custom roles — so
 * checking either one alone gets a class of user wrong. Hardcoding the two role
 * names, as this app did, locked every custom role out of work it is granted.
 */
export function canApprove(
  user: { role?: Role; permissions?: PermissionMap } | null | undefined,
  feature: string
) {
  if (!user) return false;
  if (isBuiltInRole(user.role)) return user.role === "Admin" || user.role === "Principal";
  return hasAccess(user.permissions, feature, "manage");
}

export function isPortalRole(role: Role) {
  return role === "Parent" || role === "Student";
}
