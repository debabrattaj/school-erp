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

export function isPortalRole(role: Role) {
  return role === "Parent" || role === "Student";
}
