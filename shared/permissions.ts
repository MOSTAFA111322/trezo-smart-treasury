export const PERMISSION_KEYS = [
  "dashboard.view",
  "requests.create",
  "requests.review",
  "requests.approve",
  "requests.execute",
  "entities.manage",
  "attachments.manage",
  "reports.print",
  "users.manage",
  "settings.manage",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
export type AppRole = "user" | "admin";

export const DEFAULT_ROLE_PERMISSIONS: Record<AppRole, readonly PermissionKey[]> = {
  user: ["dashboard.view", "requests.create", "attachments.manage", "reports.print"],
  admin: PERMISSION_KEYS,
};

export function hasPermission(role: AppRole, permission: PermissionKey): boolean {
  return DEFAULT_ROLE_PERMISSIONS[role].includes(permission);
}
