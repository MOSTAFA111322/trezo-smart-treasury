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
export type OperationalRole = "accountant" | "reviewer" | "cfo" | "gm" | "auditor";

export const ROLE_PROFILE_LABELS: Record<OperationalRole, string> = {
  accountant: "المحاسب التشغيلي",
  reviewer: "المراجع المالي",
  cfo: "المدير المالي",
  gm: "المدير العام",
  auditor: "مراجع التدقيق",
};

export const ROLE_PROFILE_DESCRIPTIONS: Record<OperationalRole, string> = {
  accountant: "إنشاء الطلبات وتجهيز المرفقات ومتابعة التنفيذ دون اعتماد ذاتي.",
  reviewer: "فحص المستندات والبيانات قبل رفع الطلب إلى مرحلة الاعتماد.",
  cfo: "اعتماد الطلبات ومراجعة السيولة والتقارير المالية.",
  gm: "اعتماد إداري نهائي وفق التفويض المؤسسي المعتمد.",
  auditor: "قراءة سجل التدقيق والتقارير دون تعديل السجلات التشغيلية.",
};

export const DEFAULT_ROLE_PERMISSIONS: Record<AppRole, readonly PermissionKey[]> = {
  user: ["dashboard.view", "requests.create", "attachments.manage", "reports.print"],
  admin: PERMISSION_KEYS,
};

export function hasPermission(role: AppRole, permission: PermissionKey): boolean {
  return DEFAULT_ROLE_PERMISSIONS[role].includes(permission);
}

export function getOperationalProfiles(): Array<{ key: OperationalRole; label: string; description: string }> {
  return (Object.keys(ROLE_PROFILE_LABELS) as OperationalRole[]).map((key) => ({ key, label: ROLE_PROFILE_LABELS[key], description: ROLE_PROFILE_DESCRIPTIONS[key] }));
}
