import { COOKIE_NAME } from "@shared/const";
import { amountInArabicWords } from "@shared/amountInWords";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_KEYS, hasPermission } from "@shared/permissions";
import { parse as parseCookie } from "cookie";
import { and, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { approvalDelegations, approvalPolicies, attachments, auditLogs, banks, beneficiaryBankAccounts, beneficiaries, companies, currencies, disbursementChannels, disbursementRequests, exchangeRates, fiscalYears, internalEmployees, localAuthAccounts, overdueAlertConfigs, overdueAlertDeliveries, paymentCalendarEntries, permissions as permissionRows, requestApprovalRoutes, rolePermissions, roles, sequenceSettings, userRoles, users, workflowEvents } from "../drizzle/schema";
import { getDb } from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { createHeartbeatJob, updateHeartbeatJob } from "./_core/heartbeat";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { storagePut } from "./storage";
import { DEFAULT_OVERDUE_ALERT_CRON, OVERDUE_ALERT_PATH } from "./overdueAlerts";
import { notifyOwner } from "./_core/notification";
import { createLocalSession, hashSecret, normalizeUsername, resetLocalLoginFailures, revokeLocalSession, verifySecret, markLocalLoginFailure, LOCAL_SESSION_COOKIE } from "./localAuth";

const statuses = ["draft", "review", "approved", "executed", "rejected"] as const;
const approvalStages = ["accountant", "reviewer", "cfo", "gm", "auditor"] as const;
const DEFAULT_APPROVAL_ROUTE = [...approvalStages] as string[];
type ApprovalStage = (typeof approvalStages)[number];
function normalizeApprovalStages(value: unknown): ApprovalStage[] { if (!Array.isArray(value)) return [...approvalStages]; const valid = value.filter((stage): stage is ApprovalStage => typeof stage === "string" && (approvalStages as readonly string[]).includes(stage)); return valid.length ? Array.from(new Set(valid)) : [...approvalStages]; }
type ApprovalRouteDb = Pick<NonNullable<Awaited<ReturnType<typeof getDb>>>, "select">;
async function resolveApprovalRoute(db: ApprovalRouteDb, companyId: number, amount: number) {
  const policies = await db.select().from(approvalPolicies).where(eq(approvalPolicies.isActive, true));
  const policyRows = Array.isArray(policies) ? policies : [];
  const matching = policyRows.find((policy) => {
    const companyMatches = policy.companyId === null || policy.companyId === companyId;
    const minMatches = policy.minAmount === null || amount >= Number(policy.minAmount);
    const maxMatches = policy.maxAmount === null || amount <= Number(policy.maxAmount);
    return companyMatches && minMatches && maxMatches;
  });
  return { policyId: matching?.id ?? null, stages: normalizeApprovalStages(matching?.stages), allowSkip: matching?.allowSkip ?? false };
}
function defaultApprovalRoute() { return { policyId: null, stages: [...approvalStages], allowSkip: false }; }
async function getRequestApprovalRoute(db: ApprovalRouteDb, requestId: number) {
  try {
    const [route] = await db.select().from(requestApprovalRoutes).where(eq(requestApprovalRoutes.requestId, requestId)).limit(1);
    if (!route) return defaultApprovalRoute();
    return { policyId: route.policyId, stages: normalizeApprovalStages(route.stagesSnapshot), allowSkip: true };
  } catch {
    return defaultApprovalRoute();
  }
}
const statusSchema = z.enum(statuses);
function requestUserSession(cookieHeader?: string): string { return parseCookie(cookieHeader ?? "")[COOKIE_NAME] ?? ""; }
export function canAccessOwnedRequest(userRole: string, userId: number, ownerId: number | null | undefined) { return userRole === "admin" || ownerId === userId; }
const requestInput = z.object({
  title: z.string().min(3).max(240), companyId: z.number().int().positive(), beneficiaryId: z.number().int().positive(),
  bankAccountId: z.number().int().positive().optional(), channelId: z.number().int().positive(), fiscalYearId: z.number().int().positive(),
  amount: z.number().positive(), currency: z.string().min(3).max(8), scheduledFor: z.date().optional(), description: z.string().max(5000).optional(),
});

type DbLike = Pick<NonNullable<Awaited<ReturnType<typeof getDb>>>, "insert">;
type PermissionKey = (typeof PERMISSION_KEYS)[number];

export function requiredPermissionForTransition(status: (typeof statuses)[number]): PermissionKey | null {
  if (status === "review") return "requests.review";
  if (status === "approved" || status === "rejected") return "requests.approve";
  if (status === "executed") return "requests.execute";
  return null;
}

const OPERATIONAL_ROLE_PERMISSIONS: Record<string, readonly PermissionKey[]> = {
  accountant: ["requests.review"],
  reviewer: ["requests.review"],
  cfo: ["requests.approve"],
  gm: ["requests.execute"],
  auditor: [],
};

export function operationalRoleGrantsPermission(roleName: string, permission: PermissionKey) {
  return OPERATIONAL_ROLE_PERMISSIONS[roleName]?.includes(permission) ?? false;
}

async function hasEffectivePermission(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, roleName: string, permission: PermissionKey) {
  const role = (await db.select().from(roles).where(eq(roles.name, roleName)).limit(1))[0];
  const catalogPermission = (await db.select().from(permissionRows).where(eq(permissionRows.code, permission)).limit(1))[0];
  if (!role || !catalogPermission) return hasPermission(roleName === "admin" ? "admin" : "user", permission);
  const assignment = (await db.select({ roleId: rolePermissions.roleId }).from(rolePermissions).where(and(eq(rolePermissions.roleId, role.id), eq(rolePermissions.permissionId, catalogPermission.id))).limit(1))[0];
  return Boolean(assignment);
}

type RequestValidationDb = Pick<NonNullable<Awaited<ReturnType<typeof getDb>>>, "select">;

export async function validateRequestChannelAndBank(
  db: RequestValidationDb,
  channelId: number,
  beneficiaryId: number,
  bankAccountId: number | null | undefined,
) {
  const [channel] = await db.select().from(disbursementChannels).where(eq(disbursementChannels.id, channelId)).limit(1);
  if (!channel || !channel.isActive) throw new Error("قناة الصرف غير موجودة أو غير مفعلة");
  const isBankChannel = channel.code.toLowerCase().includes("bank") || channel.name.includes("بنك");
  if (isBankChannel) {
    if (!bankAccountId) throw new Error("يجب اختيار الحساب البنكي عند استخدام قناة البنك");
    const [account] = await db.select().from(beneficiaryBankAccounts).where(and(eq(beneficiaryBankAccounts.id, bankAccountId), eq(beneficiaryBankAccounts.beneficiaryId, beneficiaryId), eq(beneficiaryBankAccounts.isActive, true))).limit(1);
    if (!account) throw new Error("الحساب البنكي غير مرتبط بالمستفيد أو غير مفعّل");
    return bankAccountId;
  }
  return null;
}

const allowedTransitions: Record<(typeof statuses)[number], (typeof statuses)[number][]> = {
  draft: ["review", "rejected"], review: ["review", "approved", "rejected"], approved: ["executed", "rejected"], executed: [], rejected: ["draft"],
};

async function writeWorkflowEvent(db: DbLike, requestId: number, fromStatus: (typeof statuses)[number] | null, toStatus: (typeof statuses)[number], actorId: number, comment?: string) {
  await db.insert(workflowEvents).values({ requestId, fromStatus, toStatus, actorId, comment });
  await db.insert(auditLogs).values({ actorId, action: `request.status.${toStatus}`, entityType: "disbursement_request", entityId: String(requestId), beforeData: { status: fromStatus }, afterData: { status: toStatus }, metadata: { workflow: true } });
}

async function writeEntityAudit(db: DbLike, actorId: number, action: string, entityType: string, entityId: number | string, afterData?: Record<string, unknown>, beforeData?: Record<string, unknown>) {
  await db.insert(auditLogs).values({ actorId, action, entityType, entityId: String(entityId), beforeData, afterData, metadata: { source: "application" } });
}

function isDuplicateKeyError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; errno?: number; message?: string };
  return candidate.code === "ER_DUP_ENTRY" || candidate.errno === 1062 || candidate.message?.includes("Duplicate entry") === true;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    currentProfile: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { appRole: ctx.user.role, operationalRoles: [] as string[] };
      const roleRows = await db.select({ roleName: roles.name }).from(userRoles).innerJoin(roles, eq(userRoles.roleId, roles.id)).where(eq(userRoles.userId, ctx.user.id));
      const linkedEmployeeRows = await db.select({ operationalRole: internalEmployees.operationalRole }).from(internalEmployees).where(eq(internalEmployees.linkedUserId, ctx.user.id));
      const localEmployeeRows = await db.select({ operationalRole: internalEmployees.operationalRole }).from(localAuthAccounts).innerJoin(internalEmployees, eq(localAuthAccounts.employeeId, internalEmployees.id)).where(eq(localAuthAccounts.userId, ctx.user.id));
      const roleNames = [...roleRows.map((row) => row.roleName), ...linkedEmployeeRows.map((row) => row.operationalRole), ...localEmployeeRows.map((row) => row.operationalRole)];
      const operationalRoles = roleNames.filter((name): name is "accountant" | "reviewer" | "cfo" | "gm" | "auditor" => ["accountant", "reviewer", "cfo", "gm", "auditor"].includes(name));
      return { appRole: ctx.user.role, operationalRoles: Array.from(new Set(operationalRoles)) };
    }),
    localLogin: publicProcedure.input(z.object({ username: z.string().trim().min(3).max(80), secret: z.string().min(8).max(128) })).mutation(async ({ input, ctx }) => {
      const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة");
      const username = normalizeUsername(input.username);
      const [account] = await db.select({ id: localAuthAccounts.id, userId: localAuthAccounts.userId, secretHash: localAuthAccounts.secretHash, mustChangeSecret: localAuthAccounts.mustChangeSecret, isActive: localAuthAccounts.isActive, failedAttempts: localAuthAccounts.failedAttempts, lockedUntil: localAuthAccounts.lockedUntil }).from(localAuthAccounts).where(eq(localAuthAccounts.username, username)).limit(1);
      if (!account || !account.isActive) throw new Error("اسم المستخدم أو الرمز السري غير صحيح");
      if (account.lockedUntil && account.lockedUntil > new Date()) throw new Error("تم تعليق الحساب مؤقتاً بعد محاولات فاشلة");
      if (!verifySecret(input.secret, account.secretHash)) { await markLocalLoginFailure(account.id, account.failedAttempts); throw new Error("اسم المستخدم أو الرمز السري غير صحيح"); }
      const [user] = await db.select().from(users).where(eq(users.id, account.userId)).limit(1); if (!user) throw new Error("حساب الموظف غير مكتمل");
      await resetLocalLoginFailures(account.id); await createLocalSession(ctx.req, ctx.res, user.id); await writeEntityAudit(db, user.id, "auth.local.login", "user", user.id, { username });
      return { success: true, mustChangeSecret: account.mustChangeSecret } as const;
    }),
    localChangeSecret: protectedProcedure.input(z.object({ currentSecret: z.string().min(8).max(128), newSecret: z.string().min(8).max(128) })).mutation(async ({ input, ctx }) => {
      const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة");
      const [account] = await db.select().from(localAuthAccounts).where(eq(localAuthAccounts.userId, ctx.user.id)).limit(1);
      if (!account || !verifySecret(input.currentSecret, account.secretHash)) throw new Error("الرمز الحالي غير صحيح");
      await db.update(localAuthAccounts).set({ secretHash: hashSecret(input.newSecret), mustChangeSecret: false }).where(eq(localAuthAccounts.id, account.id));
      await writeEntityAudit(db, ctx.user.id, "auth.local.secret.change", "local_auth_account", account.id, { mustChangeSecret: false }); return { success: true } as const;
    }),
    logout: publicProcedure.mutation(async ({ ctx }) => { const options = getSessionCookieOptions(ctx.req); ctx.res.clearCookie(COOKIE_NAME, { ...options, maxAge: -1 }); await revokeLocalSession(ctx.req, ctx.res); return { success: true } as const; }),
  }),
  permissions: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { role: ctx.user.role, roleId: null, keys: PERMISSION_KEYS.map((key) => ({ key, permissionId: null, enabled: hasPermission(ctx.user.role, key) })), configurableRoles: Object.keys(DEFAULT_ROLE_PERMISSIONS), source: "defaults" as const };
      const role = (await db.select().from(roles).where(eq(roles.name, ctx.user.role)).limit(1))[0];
      if (!role) return { role: ctx.user.role, roleId: null, keys: PERMISSION_KEYS.map((key) => ({ key, permissionId: null, enabled: hasPermission(ctx.user.role, key) })), configurableRoles: Object.keys(DEFAULT_ROLE_PERMISSIONS), source: "defaults" as const };
      const rows = await db.select({ code: permissionRows.code }).from(rolePermissions).innerJoin(permissionRows, eq(rolePermissions.permissionId, permissionRows.id)).where(eq(rolePermissions.roleId, role.id));
      const catalog = await db.select({ id: permissionRows.id, code: permissionRows.code }).from(permissionRows);
      const enabled = new Set(rows.map((row) => row.code));
      return { role: ctx.user.role, roleId: role.id, keys: catalog.map((permission) => ({ key: permission.code, permissionId: permission.id, enabled: enabled.has(permission.code) })), configurableRoles: Object.keys(DEFAULT_ROLE_PERMISSIONS), source: "database" as const };
    }),
    update: protectedProcedure.input(z.object({ roleId: z.number().int().positive(), permissionId: z.number().int().positive(), enabled: z.boolean() })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new Error("صلاحية المدير مطلوبة");
      const db = await getDb();
      if (!db) throw new Error("قاعدة البيانات غير متاحة");
      const beforeData = { roleId: input.roleId, permissionId: input.permissionId, enabled: !input.enabled };
      if (input.enabled) await db.insert(rolePermissions).values({ roleId: input.roleId, permissionId: input.permissionId }).onDuplicateKeyUpdate({ set: { permissionId: input.permissionId } });
      else await db.delete(rolePermissions).where(and(eq(rolePermissions.roleId, input.roleId), eq(rolePermissions.permissionId, input.permissionId)));
      await writeEntityAudit(db, ctx.user.id, "permission.update", "role_permission", input.roleId, input, beforeData);
      return { success: true } as const;
    }),
  }),
  users: router({
    list: protectedProcedure.query(async ({ ctx }) => { if (ctx.user.role !== "admin") throw new Error("صلاحية المدير مطلوبة"); const db = await getDb(); return db ? db.select({ id: users.id, name: users.name, email: users.email, role: users.role, operationalRole: roles.name, lastSignedIn: users.lastSignedIn }).from(users).leftJoin(userRoles, eq(userRoles.userId, users.id)).leftJoin(roles, eq(roles.id, userRoles.roleId)).orderBy(desc(users.lastSignedIn)) : []; }),
    updateRole: protectedProcedure.input(z.object({ id: z.number().int().positive(), role: z.enum(["user", "admin"]) })).mutation(async ({ input, ctx }) => { if (ctx.user.role !== "admin") throw new Error("صلاحية المدير مطلوبة"); if (input.id === ctx.user.id) throw new Error("لا يمكن تغيير دور المستخدم الحالي"); const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const [previous] = await db.select({ role: users.role }).from(users).where(eq(users.id, input.id)).limit(1); await db.update(users).set({ role: input.role }).where(eq(users.id, input.id)); await writeEntityAudit(db, ctx.user.id, "user.role.update", "user", input.id, { role: input.role }, previous ? { role: previous.role } : undefined); return { success: true }; }),
    assignOperationalRole: protectedProcedure.input(z.object({ userId: z.number().int().positive(), role: z.enum(["accountant", "reviewer", "cfo", "gm", "auditor"]) })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new Error("صلاحية المدير مطلوبة");
      const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة");
      const descriptions = { accountant: "إنشاء وتعديل وإرسال طلبات الصرف", reviewer: "مراجعة الطلبات وإعادتها أو رفعها", cfo: "اعتماد المرحلة المالية", gm: "الاعتماد النهائي والتنفيذ", auditor: "قراءة السجل والتقارير" } as const;
      const [role] = await db.select().from(roles).where(eq(roles.name, input.role)).limit(1);
      let roleId = role?.id;
      if (!roleId) { const [created] = await db.insert(roles).values({ name: input.role, description: descriptions[input.role] }).$returningId(); roleId = created?.id; }
      if (!roleId) throw new Error("تعذر إنشاء الدور التشغيلي");
      await db.insert(userRoles).values({ userId: input.userId, roleId }).onDuplicateKeyUpdate({ set: { roleId } });
      await writeEntityAudit(db, ctx.user.id, "user.operational_role.update", "user", input.userId, { role: input.role });
      return { success: true, role: input.role } as const;
    }),
  }),
  employees: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new Error("صلاحية المدير مطلوبة");
      const db = await getDb();
      if (!db) return [];
      const rows = await db.select({ employee: internalEmployees, localUsername: localAuthAccounts.username, localAuthActive: localAuthAccounts.isActive, mustChangeSecret: localAuthAccounts.mustChangeSecret }).from(internalEmployees).leftJoin(localAuthAccounts, eq(localAuthAccounts.employeeId, internalEmployees.id)).orderBy(desc(internalEmployees.createdAt));
      return rows.map(({ employee, ...account }) => ({ ...employee, ...account }));
    }),
    create: protectedProcedure.input(z.object({ employeeNo: z.string().trim().min(1).max(64), fullName: z.string().trim().min(2).max(180), department: z.string().trim().max(160).optional(), jobTitle: z.string().trim().max(160).optional(), phone: z.string().trim().max(40).optional(), operationalRole: z.enum(["accountant", "reviewer", "cfo", "gm", "auditor"]) })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new Error("صلاحية المدير مطلوبة");
      const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة");
      try {
        const [row] = await db.insert(internalEmployees).values({ ...input, createdBy: ctx.user.id }).$returningId();
        if (row?.id) await writeEntityAudit(db, ctx.user.id, "internal_employee.create", "internal_employee", row.id, input);
        return { success: true, id: row?.id } as const;
      } catch (error) { if (isDuplicateKeyError(error)) throw new Error("الرقم الوظيفي مستخدم مسبقاً."); throw error; }
    }),
    createLocalAccount: protectedProcedure.input(z.object({ employeeId: z.number().int().positive(), username: z.string().trim().min(3).max(80), secret: z.string().min(8).max(128) })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new Error("صلاحية المدير مطلوبة");
      const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة");
      const [employee] = await db.select().from(internalEmployees).where(eq(internalEmployees.id, input.employeeId)).limit(1);
      if (!employee) throw new Error("الموظف غير موجود"); if (!employee.isActive) throw new Error("لا يمكن إنشاء دخول لموظف غير نشط");
      const username = normalizeUsername(input.username);
      const [existing] = await db.select({ id: localAuthAccounts.id }).from(localAuthAccounts).where(eq(localAuthAccounts.username, username)).limit(1);
      if (existing) throw new Error("اسم المستخدم مستخدم مسبقاً");
      if (employee.linkedUserId) throw new Error("الموظف مرتبط بحساب دخول Manus بالفعل");
      const [createdUser] = await db.insert(users).values({ openId: `local:${randomUUID()}`, name: employee.fullName, email: null, loginMethod: "local", role: "user" }).$returningId();
      if (!createdUser?.id) throw new Error("تعذر إنشاء هوية الموظف");
      await db.insert(localAuthAccounts).values({ username, userId: createdUser.id, employeeId: employee.id, secretHash: hashSecret(input.secret), mustChangeSecret: true, isActive: true });
      const [role] = await db.select().from(roles).where(eq(roles.name, employee.operationalRole)).limit(1);
      if (role) await db.insert(userRoles).values({ userId: createdUser.id, roleId: role.id }).onDuplicateKeyUpdate({ set: { roleId: role.id } });
      await writeEntityAudit(db, ctx.user.id, "local_auth_account.create", "local_auth_account", createdUser.id, { employeeId: employee.id, username });
      return { success: true, userId: createdUser.id, username } as const;
    }),
    setLocalAccountActive: protectedProcedure.input(z.object({ employeeId: z.number().int().positive(), isActive: z.boolean() })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new Error("صلاحية المدير مطلوبة"); const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة");
      const [account] = await db.select({ id: localAuthAccounts.id, isActive: localAuthAccounts.isActive }).from(localAuthAccounts).where(eq(localAuthAccounts.employeeId, input.employeeId)).limit(1);
      if (!account) throw new Error("لا يوجد حساب محلي لهذا الموظف");
      await db.update(localAuthAccounts).set({ isActive: input.isActive, failedAttempts: 0, lockedUntil: null }).where(eq(localAuthAccounts.id, account.id));
      await writeEntityAudit(db, ctx.user.id, input.isActive ? "local_auth_account.activate" : "local_auth_account.deactivate", "local_auth_account", account.id, { isActive: input.isActive }, { isActive: account.isActive });
      return { success: true, isActive: input.isActive } as const;
    }),
    linkUser: protectedProcedure.input(z.object({ employeeId: z.number().int().positive(), userId: z.number().int().positive().nullable() })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new Error("صلاحية المدير مطلوبة");
      const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة");
      if (input.userId !== null) {
        const [targetUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).limit(1);
        if (!targetUser) throw new Error("حساب الدخول غير موجود. يجب أن يسجل المستخدم الدخول مرة واحدة أولاً.");
      }
      const [previous] = await db.select({ linkedUserId: internalEmployees.linkedUserId }).from(internalEmployees).where(eq(internalEmployees.id, input.employeeId)).limit(1);
      await db.update(internalEmployees).set({ linkedUserId: input.userId }).where(eq(internalEmployees.id, input.employeeId));
      await writeEntityAudit(db, ctx.user.id, "internal_employee.link_user", "internal_employee", input.employeeId, { linkedUserId: input.userId }, previous);
      return { success: true } as const;
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), employeeNo: z.string().trim().min(1).max(64), fullName: z.string().trim().min(2).max(180), department: z.string().trim().max(160).optional(), jobTitle: z.string().trim().max(160).optional(), phone: z.string().trim().max(40).optional(), operationalRole: z.enum(["accountant", "reviewer", "cfo", "gm", "auditor"]), isActive: z.boolean() })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new Error("صلاحية المدير مطلوبة");
      const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة");
      const [previous] = await db.select().from(internalEmployees).where(eq(internalEmployees.id, input.id)).limit(1);
      const { id, ...values } = input;
      await db.update(internalEmployees).set(values).where(eq(internalEmployees.id, id));
      await writeEntityAudit(db, ctx.user.id, "internal_employee.update", "internal_employee", id, values, previous);
      return { success: true } as const;
    }),
  }),
  entities: router({
    companies: router({
      list: protectedProcedure.query(async () => { const db = await getDb(); return db ? db.select().from(companies).orderBy(desc(companies.createdAt)) : []; }),
      create: protectedProcedure.input(z.object({ name: z.string().min(2).max(180), legalName: z.string().max(220).optional(), registrationNumber: z.string().max(80).optional(), taxNumber: z.string().max(80).optional(), phone: z.string().max(40).optional(), address: z.string().max(300).optional(), logoUrl: z.string().url().max(500).optional(), defaultCurrency: z.string().length(3) })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); try { const [row] = await db.insert(companies).values({ ...input, createdBy: ctx.user.id }).$returningId(); if (row?.id) await writeEntityAudit(db, ctx.user.id, "company.create", "company", row.id, input); return row; } catch (error) { if (isDuplicateKeyError(error)) throw new Error("اسم الشركة أو رقم التسجيل مستخدم مسبقاً. اختر قيمة مختلفة أو استخدم الشركة الموجودة في القائمة."); throw error; } }),
      update: protectedProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().min(2).max(180), legalName: z.string().max(220).optional(), registrationNumber: z.string().max(80).optional(), taxNumber: z.string().max(80).optional(), phone: z.string().max(40).optional(), address: z.string().max(300).optional(), logoUrl: z.string().url().max(500).optional(), defaultCurrency: z.string().length(3) })).mutation(async ({ input, ctx }) => { if (ctx.user.role !== "admin") throw new Error("صلاحية المدير مطلوبة"); const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const [previous] = await db.select().from(companies).where(eq(companies.id, input.id)).limit(1); await db.update(companies).set({ name: input.name, legalName: input.legalName, registrationNumber: input.registrationNumber, taxNumber: input.taxNumber, phone: input.phone, address: input.address, logoUrl: input.logoUrl, defaultCurrency: input.defaultCurrency }).where(eq(companies.id, input.id)); await writeEntityAudit(db, ctx.user.id, "company.update", "company", input.id, input, previous ? { name: previous.name, legalName: previous.legalName, registrationNumber: previous.registrationNumber, defaultCurrency: previous.defaultCurrency } : undefined); return { success: true }; }),
      remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => { if (ctx.user.role !== "admin") throw new Error("صلاحية المدير مطلوبة"); const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const [previous] = await db.select({ isActive: companies.isActive }).from(companies).where(eq(companies.id, input.id)).limit(1); await db.update(companies).set({ isActive: false }).where(eq(companies.id, input.id)); await writeEntityAudit(db, ctx.user.id, "company.deactivate", "company", input.id, { isActive: false }, previous ? { isActive: previous.isActive } : undefined); return { success: true }; }),
    }),
    beneficiaries: router({
      list: protectedProcedure.input(z.object({ companyId: z.number().int().positive().optional() }).optional()).query(async ({ input }) => { const db = await getDb(); return db ? db.select().from(beneficiaries).where(input?.companyId ? eq(beneficiaries.companyId, input.companyId) : undefined).orderBy(desc(beneficiaries.createdAt)) : []; }),
      create: protectedProcedure.input(z.object({ companyId: z.number().int().positive(), name: z.string().min(2).max(180), type: z.enum(["individual", "organization"]), taxNumber: z.string().max(80).optional(), phone: z.string().max(40).optional(), email: z.string().email().optional() })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const [row] = await db.insert(beneficiaries).values(input).$returningId(); if (row?.id) await writeEntityAudit(db, ctx.user.id, "beneficiary.create", "beneficiary", row.id, input); return row; }),
      update: protectedProcedure.input(z.object({ id: z.number().int().positive(), companyId: z.number().int().positive(), name: z.string().min(2).max(180), type: z.enum(["individual", "organization"]), taxNumber: z.string().max(80).optional(), phone: z.string().max(40).optional(), email: z.string().email().optional() })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const [previous] = await db.select().from(beneficiaries).where(eq(beneficiaries.id, input.id)).limit(1); await db.update(beneficiaries).set({ companyId: input.companyId, name: input.name, type: input.type, taxNumber: input.taxNumber, phone: input.phone, email: input.email }).where(eq(beneficiaries.id, input.id)); await writeEntityAudit(db, ctx.user.id, "beneficiary.update", "beneficiary", input.id, input, previous ? { companyId: previous.companyId, name: previous.name, type: previous.type, taxNumber: previous.taxNumber, phone: previous.phone, email: previous.email } : undefined); return { success: true }; }),
      remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => { if (ctx.user.role !== "admin") throw new Error("صلاحية المدير مطلوبة"); const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const [previous] = await db.select({ isActive: beneficiaries.isActive }).from(beneficiaries).where(eq(beneficiaries.id, input.id)).limit(1); await db.update(beneficiaries).set({ isActive: false }).where(eq(beneficiaries.id, input.id)); await writeEntityAudit(db, ctx.user.id, "beneficiary.deactivate", "beneficiary", input.id, { isActive: false }, previous ? { isActive: previous.isActive } : undefined); return { success: true }; }),
    }),
    banks: router({
      list: protectedProcedure.query(async () => { const db = await getDb(); return db ? db.select().from(banks).where(eq(banks.isActive, true)).orderBy(desc(banks.createdAt)) : []; }),
      create: protectedProcedure.input(z.object({ name: z.string().min(2).max(160), swiftCode: z.string().max(40).optional(), country: z.string().max(80).optional() })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const [row] = await db.insert(banks).values(input).$returningId(); if (row?.id) await writeEntityAudit(db, ctx.user.id, "bank.create", "bank", row.id, input); return row; }),
      update: protectedProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().min(2).max(160), swiftCode: z.string().max(40).optional(), country: z.string().max(80).optional() })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const [previous] = await db.select().from(banks).where(eq(banks.id, input.id)).limit(1); await db.update(banks).set({ name: input.name, swiftCode: input.swiftCode, country: input.country }).where(eq(banks.id, input.id)); await writeEntityAudit(db, ctx.user.id, "bank.update", "bank", input.id, input, previous ? { name: previous.name, swiftCode: previous.swiftCode, country: previous.country } : undefined); return { success: true }; }),
      remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => { if (ctx.user.role !== "admin") throw new Error("صلاحية المدير مطلوبة"); const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const [previous] = await db.select({ isActive: banks.isActive }).from(banks).where(eq(banks.id, input.id)).limit(1); await db.update(banks).set({ isActive: false }).where(eq(banks.id, input.id)); await writeEntityAudit(db, ctx.user.id, "bank.deactivate", "bank", input.id, { isActive: false }, previous ? { isActive: previous.isActive } : undefined); return { success: true }; }),
    }),
    beneficiaryBankAccounts: router({
      list: protectedProcedure.input(z.object({ beneficiaryId: z.number().int().positive() })).query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        return db.select({ id: beneficiaryBankAccounts.id, beneficiaryId: beneficiaryBankAccounts.beneficiaryId, bankId: beneficiaryBankAccounts.bankId, bankName: banks.name, accountName: beneficiaryBankAccounts.accountName, iban: beneficiaryBankAccounts.iban, currency: beneficiaryBankAccounts.currency, isDefault: beneficiaryBankAccounts.isDefault }).from(beneficiaryBankAccounts).innerJoin(banks, eq(beneficiaryBankAccounts.bankId, banks.id)).where(and(eq(beneficiaryBankAccounts.beneficiaryId, input.beneficiaryId), eq(beneficiaryBankAccounts.isActive, true), eq(banks.isActive, true))).orderBy(desc(beneficiaryBankAccounts.isDefault), desc(beneficiaryBankAccounts.createdAt));
      }),
    }),
    channels: router({
      list: protectedProcedure.query(async () => { const db = await getDb(); return db ? db.select().from(disbursementChannels).orderBy(desc(disbursementChannels.createdAt)) : []; }),
      create: protectedProcedure.input(z.object({ name: z.string().min(2).max(120), code: z.string().min(2).max(32), description: z.string().max(500).optional() })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const [row] = await db.insert(disbursementChannels).values(input).$returningId(); if (row?.id) await writeEntityAudit(db, ctx.user.id, "channel.create", "disbursement_channel", row.id, input); return row; }),
      update: protectedProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().min(2).max(120), code: z.string().min(2).max(32), description: z.string().max(500).optional() })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const [previous] = await db.select().from(disbursementChannels).where(eq(disbursementChannels.id, input.id)).limit(1); await db.update(disbursementChannels).set({ name: input.name, code: input.code, description: input.description }).where(eq(disbursementChannels.id, input.id)); await writeEntityAudit(db, ctx.user.id, "channel.update", "disbursement_channel", input.id, input, previous ? { name: previous.name, code: previous.code, description: previous.description } : undefined); return { success: true }; }),
      remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => { if (ctx.user.role !== "admin") throw new Error("صلاحية المدير مطلوبة"); const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const [previous] = await db.select({ isActive: disbursementChannels.isActive }).from(disbursementChannels).where(eq(disbursementChannels.id, input.id)).limit(1); await db.update(disbursementChannels).set({ isActive: false }).where(eq(disbursementChannels.id, input.id)); await writeEntityAudit(db, ctx.user.id, "channel.deactivate", "disbursement_channel", input.id, { isActive: false }, previous ? { isActive: previous.isActive } : undefined); return { success: true }; }),
    }),
  }),
  calendar: router({
    list: protectedProcedure.input(z.object({ from: z.date().optional(), to: z.date().optional() }).optional()).query(async ({ input }) => { const db = await getDb(); if (!db) return []; const rows = await db.select().from(paymentCalendarEntries).orderBy(paymentCalendarEntries.dueDate); return rows.filter((row) => (!input?.from || row.dueDate >= input.from) && (!input?.to || row.dueDate <= input.to)); }),
    create: protectedProcedure.input(z.object({ companyId: z.number().int().positive(), beneficiaryId: z.number().int().positive().optional(), title: z.string().min(3).max(240), amount: z.number().positive(), currency: z.string().length(3), dueDate: z.date(), notes: z.string().max(2000).optional() })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const [row] = await db.insert(paymentCalendarEntries).values({ ...input, amount: input.amount.toFixed(4), createdBy: ctx.user.id }).$returningId(); if (row?.id) await writeEntityAudit(db, ctx.user.id, "calendar.create", "payment_calendar_entry", row.id, input); return row; }),
    convert: protectedProcedure.input(z.object({ entryId: z.number().int().positive(), channelId: z.number().int().positive(), fiscalYearId: z.number().int().positive() })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const [entry] = await db.select().from(paymentCalendarEntries).where(eq(paymentCalendarEntries.id, input.entryId)).limit(1); if (!entry || !entry.beneficiaryId) throw new Error("الموعد يحتاج إلى مستفيد قبل التحويل"); const [sequence] = await db.select().from(sequenceSettings).where(eq(sequenceSettings.fiscalYearId, input.fiscalYearId)).limit(1); const [year] = await db.select().from(fiscalYears).where(eq(fiscalYears.id, input.fiscalYearId)).limit(1); if (!sequence || !year) throw new Error("إعدادات السنة والتسلسل غير مكتملة"); const referenceNumber = `${sequence.prefix}-${year.year}-${String(sequence.nextValue).padStart(sequence.padding, "0")}`; await db.transaction(async (tx) => { const sequenceUpdate = await tx.update(sequenceSettings).set({ nextValue: sequence.nextValue + 1 }).where(and(eq(sequenceSettings.id, sequence.id), eq(sequenceSettings.nextValue, sequence.nextValue))); if (sequenceUpdate[0]?.affectedRows !== 1) throw new Error("تعذر حجز الرقم المرجعي؛ أعد المحاولة"); const [created] = await tx.insert(disbursementRequests).values({ referenceNumber, companyId: entry.companyId, beneficiaryId: entry.beneficiaryId!, channelId: input.channelId, fiscalYearId: input.fiscalYearId, title: entry.title, description: entry.notes, amount: entry.amount, currency: entry.currency, amountInWords: amountInArabicWords(Number(entry.amount), entry.currency), scheduledFor: entry.dueDate, createdBy: ctx.user.id, status: "draft" }).$returningId(); if (!created?.id) throw new Error("تعذر إنشاء الطلب"); await tx.update(paymentCalendarEntries).set({ convertedRequestId: created.id }).where(eq(paymentCalendarEntries.id, entry.id)); await writeWorkflowEvent(tx, created.id, null, "draft", ctx.user.id, "تحويل من التقويم"); await writeEntityAudit(tx, ctx.user.id, "calendar.convert", "payment_calendar_entry", entry.id, { convertedRequestId: created.id }, { convertedRequestId: null }); }); return { referenceNumber }; }),
  }),
  audit: router({
    list: protectedProcedure.input(z.object({ entityType: z.string().max(80).optional(), entityId: z.string().max(80).optional(), action: z.string().max(80).optional(), from: z.date().optional(), to: z.date().optional() }).optional()).query(async ({ input }) => { const db = await getDb(); if (!db) return []; const rows = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(500); return rows.filter((row) => (!input?.entityType || row.entityType === input.entityType) && (!input?.entityId || row.entityId === input.entityId) && (!input?.action || row.action === input.action) && (!input?.from || row.createdAt >= input.from) && (!input?.to || row.createdAt <= input.to)); }),
    logExport: protectedProcedure.input(z.object({ recordCount: z.number().int().min(0), filters: z.object({ search: z.string().max(120).optional(), action: z.string().max(80).optional(), from: z.string().max(10).optional(), to: z.string().max(10).optional() }) })).mutation(async ({ input, ctx }) => { if (ctx.user.role !== "admin") throw new Error("تصدير سجل التدقيق متاح لمدير النظام فقط"); const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); await writeEntityAudit(db, ctx.user.id, "audit.export.csv", "audit_log", "filtered", { recordCount: input.recordCount, filters: input.filters }); return { success: true } as const; }),
  }),
  dashboard: router({
        summary: protectedProcedure.query(async () => { const db = await getDb(); if (!db) return { total: null, pending: null, executed: null, upcoming: null, byCurrency: [] }; const byCurrency = await db.select({ currency: disbursementRequests.currency, total: sql<string>`coalesce(sum(${disbursementRequests.amount}), 0)`, pending: sql<string>`coalesce(sum(case when ${disbursementRequests.status} in ('draft','review') then ${disbursementRequests.amount} else 0 end), 0)`, executed: sql<string>`coalesce(sum(case when ${disbursementRequests.status} = 'executed' then ${disbursementRequests.amount} else 0 end), 0)`, upcoming: sql<string>`coalesce(sum(case when ${disbursementRequests.scheduledFor} >= now() and ${disbursementRequests.scheduledFor} < date_add(now(), interval 7 day) then ${disbursementRequests.amount} else 0 end), 0)` }).from(disbursementRequests).groupBy(disbursementRequests.currency); return { total: null, pending: null, executed: null, upcoming: null, byCurrency }; }),
        unified: protectedProcedure.input(z.object({ baseCurrency: z.string().min(3).max(8) })).query(async ({ input }) => { const db = await getDb(); if (!db) return { baseCurrency: input.baseCurrency, total: null, byCurrency: [], missingRates: [] as string[], conversionApplied: false as const }; const byCurrency = await db.select({ currency: disbursementRequests.currency, total: sql<string>`coalesce(sum(${disbursementRequests.amount}), 0)` }).from(disbursementRequests).groupBy(disbursementRequests.currency); return { baseCurrency: input.baseCurrency, total: null, byCurrency, missingRates: [] as string[], conversionApplied: false as const }; }),
  }),
  settings: router({
    fiscalYears: protectedProcedure.query(async () => { const db = await getDb(); return db ? db.select().from(fiscalYears).orderBy(desc(fiscalYears.year)) : []; }),
    createFiscalYear: protectedProcedure.input(z.object({ year: z.number().int().min(2000).max(2200), label: z.string().min(2).max(80), startsOn: z.date(), endsOn: z.date(), isCurrent: z.boolean().optional(), prefix: z.string().min(2).max(24).optional(), padding: z.number().int().min(1).max(12).optional() })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new Error("صلاحية المدير مطلوبة");
      if (input.endsOn <= input.startsOn) throw new Error("تاريخ نهاية السنة يجب أن يكون بعد تاريخ البداية");
      const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة");
      return db.transaction(async (tx) => {
        if (input.isCurrent) await tx.update(fiscalYears).set({ isCurrent: false });
        const [created] = await tx.insert(fiscalYears).values({ year: input.year, label: input.label, startsOn: input.startsOn, endsOn: input.endsOn, isCurrent: input.isCurrent ?? false }).$returningId();
        if (!created?.id) throw new Error("تعذر إنشاء السنة المالية");
        await tx.insert(sequenceSettings).values({ fiscalYearId: created.id, prefix: input.prefix ?? "TRZ", nextValue: 1, padding: input.padding ?? 5 });
        await writeEntityAudit(tx, ctx.user.id, "fiscal_year.create", "fiscal_year", created.id, input);
        return created;
      });
    }),
    currencies: protectedProcedure.query(async () => { const db = await getDb(); return db ? db.select().from(currencies).where(eq(currencies.isActive, true)).orderBy(currencies.code) : []; }),
    createCurrency: protectedProcedure.input(z.object({ code: z.string().regex(/^[A-Z]{3,8}$/), nameAr: z.string().min(2).max(80), nameEn: z.string().min(2).max(80), symbol: z.string().min(1).max(12), decimals: z.number().int().min(0).max(6).optional() })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new Error("صلاحية المدير مطلوبة");
      const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة");
      const code = input.code.toUpperCase();
      const [row] = await db.insert(currencies).values({ code, nameAr: input.nameAr, nameEn: input.nameEn, symbol: input.symbol, decimals: input.decimals ?? 2, isActive: true }).$returningId();
      await writeEntityAudit(db, ctx.user.id, "currency.create", "currency", code, { ...input, code });
      return row;
    }),
    exchangeRates: protectedProcedure.query(async () => { const db = await getDb(); return db ? db.select().from(exchangeRates).orderBy(desc(exchangeRates.effectiveAt), desc(exchangeRates.createdAt)).limit(200) : []; }),
    createExchangeRate: protectedProcedure.input(z.object({ baseCurrency: z.string().min(3).max(8), quoteCurrency: z.string().min(3).max(8), rate: z.number().positive().finite(), effectiveAt: z.date(), source: z.string().trim().min(3).max(120), approvalNote: z.string().trim().max(500).optional() })).mutation(async ({ input, ctx }) => { if (ctx.user.role !== "admin") throw new Error("صلاحية المدير مطلوبة"); if (input.baseCurrency === input.quoteCurrency) throw new Error("يجب أن تكون عملة الأساس وعملة التسعير مختلفتين"); const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const [row] = await db.insert(exchangeRates).values({ ...input, rate: input.rate.toFixed(10), createdBy: ctx.user.id, approvalStatus: "pending", approvedBy: null, approvedAt: null, approvalNote: input.approvalNote || null }).$returningId(); if (row?.id) await writeEntityAudit(db, ctx.user.id, "exchange_rate.create_pending", "exchange_rate", row.id, { ...input, approvalStatus: "pending", createdBy: ctx.user.id }); return row; }),
    approveExchangeRate: protectedProcedure.input(z.object({ id: z.number().int().positive(), approvalNote: z.string().trim().max(500).optional() })).mutation(async ({ input, ctx }) => { if (ctx.user.role !== "admin") throw new Error("صلاحية المدير مطلوبة"); const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const [rate] = await db.select().from(exchangeRates).where(eq(exchangeRates.id, input.id)).limit(1); if (!rate) throw new Error("سعر الصرف غير موجود"); if (rate.createdBy === ctx.user.id) throw new Error("لا يمكن اعتماد سعر الصرف من نفس المستخدم الذي أدخله"); if (rate.approvalStatus !== "pending") throw new Error("سعر الصرف ليس بانتظار الاعتماد"); const approvedAt = new Date(); await db.update(exchangeRates).set({ approvalStatus: "approved", approvedBy: ctx.user.id, approvedAt, approvalNote: input.approvalNote ?? rate.approvalNote }).where(eq(exchangeRates.id, input.id)); await writeEntityAudit(db, ctx.user.id, "exchange_rate.approve", "exchange_rate", input.id, { createdBy: rate.createdBy, approvedBy: ctx.user.id, approvedAt, approvalNote: input.approvalNote }); return { success: true } as const; }),
    rejectExchangeRate: protectedProcedure.input(z.object({ id: z.number().int().positive(), approvalNote: z.string().trim().min(3).max(500) })).mutation(async ({ input, ctx }) => { if (ctx.user.role !== "admin") throw new Error("صلاحية المدير مطلوبة"); const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const [rate] = await db.select().from(exchangeRates).where(eq(exchangeRates.id, input.id)).limit(1); if (!rate) throw new Error("سعر الصرف غير موجود"); if (rate.createdBy === ctx.user.id) throw new Error("لا يمكن رفض سعر الصرف من نفس المستخدم الذي أدخله"); if (rate.approvalStatus !== "pending") throw new Error("سعر الصرف ليس بانتظار الاعتماد"); await db.update(exchangeRates).set({ approvalStatus: "rejected", approvedBy: ctx.user.id, approvedAt: new Date(), approvalNote: input.approvalNote }).where(eq(exchangeRates.id, input.id)); await writeEntityAudit(db, ctx.user.id, "exchange_rate.reject", "exchange_rate", input.id, { createdBy: rate.createdBy, rejectedBy: ctx.user.id, approvalNote: input.approvalNote }); return { success: true } as const; }),
  }),
  attachments: router({
    list: protectedProcedure.input(z.object({ requestId: z.number().int().positive() })).query(async ({ input, ctx }) => { const db = await getDb(); if (!db) return []; const [request] = await db.select({ createdBy: disbursementRequests.createdBy }).from(disbursementRequests).where(eq(disbursementRequests.id, input.requestId)).limit(1); if (!request || !canAccessOwnedRequest(ctx.user.role, ctx.user.id, request.createdBy)) throw new Error("لا تملك صلاحية الوصول إلى مرفقات هذا الطلب"); return db.select().from(attachments).where(eq(attachments.requestId, input.requestId)).orderBy(desc(attachments.createdAt)); }),
    download: protectedProcedure.input(z.object({ attachmentId: z.number().int().positive() })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const [row] = await db.select({ attachment: attachments, requestCreatedBy: disbursementRequests.createdBy }).from(attachments).innerJoin(disbursementRequests, eq(attachments.requestId, disbursementRequests.id)).where(eq(attachments.id, input.attachmentId)).limit(1); if (!row || !canAccessOwnedRequest(ctx.user.role, ctx.user.id, row.requestCreatedBy)) throw new Error("لا تملك صلاحية تنزيل هذا المرفق"); return { fileName: row.attachment.fileName, mimeType: row.attachment.mimeType, url: `/manus-storage/${row.attachment.storageKey}` }; }),
    upload: protectedProcedure.input(z.object({ requestId: z.number().int().positive(), fileName: z.string().min(1).max(240), mimeType: z.string().min(1).max(120), sizeBytes: z.number().int().positive().max(8_000_000), base64: z.string().min(1).max(12_000_000) })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const [request] = await db.select({ createdBy: disbursementRequests.createdBy }).from(disbursementRequests).where(eq(disbursementRequests.id, input.requestId)).limit(1); if (!request || !canAccessOwnedRequest(ctx.user.role, ctx.user.id, request.createdBy)) throw new Error("لا تملك صلاحية إرفاق ملف بهذا الطلب"); const base64Data = input.base64.includes(",") ? input.base64.split(",")[1] : input.base64; const bytes = Buffer.from(base64Data, "base64"); if (bytes.length !== input.sizeBytes) throw new Error("حجم المرفق غير متطابق"); const stored = await storagePut(`requests/${input.requestId}/${input.fileName}`, bytes, input.mimeType); const [row] = await db.insert(attachments).values({ requestId: input.requestId, fileName: input.fileName, mimeType: input.mimeType, sizeBytes: bytes.length, storageKey: stored.key, uploadedBy: ctx.user.id }).$returningId(); if (row?.id) await writeEntityAudit(db, ctx.user.id, "attachment.upload", "attachment", row.id, { requestId: input.requestId, fileName: input.fileName, sizeBytes: bytes.length }); return { ...row, url: stored.url }; }),
  }),
  reports: router({
    financial: protectedProcedure.input(z.object({ companyId: z.number().int().positive().optional(), fiscalYearId: z.number().int().positive().optional() })).query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new Error("تصدير التقارير المالية متاح لمدير النظام فقط");
      const db = await getDb(); if (!db) return [];
      const conditions = [];
      if (input.companyId) conditions.push(eq(disbursementRequests.companyId, input.companyId));
      if (input.fiscalYearId) conditions.push(eq(disbursementRequests.fiscalYearId, input.fiscalYearId));
      return db.select({ referenceNumber: disbursementRequests.referenceNumber, companyName: companies.name, fiscalYear: fiscalYears.year, beneficiaryName: beneficiaries.name, title: disbursementRequests.title, amount: disbursementRequests.amount, currency: disbursementRequests.currency, status: disbursementRequests.status, scheduledFor: disbursementRequests.scheduledFor, createdAt: disbursementRequests.createdAt }).from(disbursementRequests).innerJoin(companies, eq(disbursementRequests.companyId, companies.id)).innerJoin(fiscalYears, eq(disbursementRequests.fiscalYearId, fiscalYears.id)).innerJoin(beneficiaries, eq(disbursementRequests.beneficiaryId, beneficiaries.id)).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(disbursementRequests.createdAt));
    }),
    logExport: protectedProcedure.input(z.object({ format: z.enum(["csv", "xlsx", "pdf"]), companyId: z.number().int().positive().optional(), fiscalYearId: z.number().int().positive().optional(), recordCount: z.number().int().min(0) })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new Error("تسجيل تصدير التقارير متاح لمدير النظام فقط");
      const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة");
      await writeEntityAudit(db, ctx.user.id, `report.export.${input.format}`, "financial_report", `${input.companyId ?? "all"}-${input.fiscalYearId ?? "all"}`, { companyId: input.companyId ?? null, fiscalYearId: input.fiscalYearId ?? null, recordCount: input.recordCount });
      return { success: true } as const;
    }),
  }),
  overdueAlerts: router({
    history: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(100).optional() }).optional()).query(async ({ input, ctx }) => { if (ctx.user.role !== "admin") throw new Error("سجل التنبيهات متاح لمدير النظام فقط"); const db = await getDb(); if (!db) return []; return db.select().from(overdueAlertDeliveries).orderBy(desc(overdueAlertDeliveries.deliveryDate), desc(overdueAlertDeliveries.createdAt)).limit(input?.limit ?? 30); }),
    retry: protectedProcedure.input(z.object({ deliveryId: z.number().int().positive() })).mutation(async ({ input, ctx }) => { if (ctx.user.role !== "admin") throw new Error("إعادة إرسال التنبيه متاحة لمدير النظام فقط"); const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const [delivery] = await db.select().from(overdueAlertDeliveries).where(eq(overdueAlertDeliveries.id, input.deliveryId)).limit(1); if (!delivery) throw new Error("سجل التنبيه غير موجود"); if (delivery.status !== "failed") throw new Error("لا يمكن إعادة إرسال تنبيه غير فاشل"); const claim = await db.update(overdueAlertDeliveries).set({ status: "pending", attempts: delivery.attempts + 1, lastAttemptAt: new Date(), lastError: null }).where(and(eq(overdueAlertDeliveries.id, delivery.id), eq(overdueAlertDeliveries.status, "failed"))); if ("affectedRows" in claim && Number((claim as { affectedRows?: number }).affectedRows) === 0) throw new Error("تمت معالجة محاولة إعادة الإرسال مسبقاً"); const delivered = await notifyOwner({ title: "إعادة إرسال: تنبيه الطلبات المتأخرة", content: delivery.content ?? "لا يوجد محتوى محفوظ للتنبيه" }); if (!delivered) { await db.update(overdueAlertDeliveries).set({ status: "failed", lastError: "تعذر إرسال الإشعار إلى مالك النظام", lastAttemptAt: new Date() }).where(eq(overdueAlertDeliveries.id, delivery.id)); throw new Error("تعذر إرسال الإشعار إلى مالك النظام"); } await db.update(overdueAlertDeliveries).set({ status: "sent", sentAt: new Date(), lastError: null, lastAttemptAt: new Date() }).where(eq(overdueAlertDeliveries.id, delivery.id)); await writeEntityAudit(db, ctx.user.id, "overdue_alert.retry", "overdue_alert_delivery", delivery.id, { attempts: delivery.attempts + 1 }); return { success: true } as const; }),
    getConfig: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new Error("إعدادات التنبيهات متاحة لمدير النظام فقط");
      const db = await getDb(); if (!db) return null;
      return (await db.select().from(overdueAlertConfigs).orderBy(desc(overdueAlertConfigs.createdAt)).limit(1))[0] ?? null;
    }),
    configure: protectedProcedure.input(z.object({ isEnabled: z.boolean(), cronExpression: z.string().regex(/^\d+\s+\d+\s+\d+\s+\*\s+\*\s+\*$/, "صيغة الجدولة غير صالحة") })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new Error("إعداد تنبيهات الطلبات المتأخرة متاح لمدير النظام فقط");
      const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة");
      const userSession = requestUserSession(ctx.req.headers.cookie);
      const current = (await db.select().from(overdueAlertConfigs).orderBy(desc(overdueAlertConfigs.createdAt)).limit(1))[0];
      let taskUid = current?.scheduleCronTaskUid ?? null;
      if (taskUid) {
        await updateHeartbeatJob(taskUid, { cron: input.cronExpression, enable: input.isEnabled, path: OVERDUE_ALERT_PATH, method: "POST", description: "تنبيه يومي لمالك النظام بالطلبات المتأخرة" }, userSession);
      } else {
        const createdJob = await createHeartbeatJob({ name: "trezo-overdue-owner-alert", cron: input.cronExpression, path: OVERDUE_ALERT_PATH, method: "POST", description: "تنبيه يومي لمالك النظام بالطلبات المتأخرة" }, userSession);
        taskUid = createdJob.taskUid;
      }
      if (current) {
        await db.update(overdueAlertConfigs).set({ isEnabled: input.isEnabled, cronExpression: input.cronExpression, scheduleCronTaskUid: taskUid }).where(eq(overdueAlertConfigs.id, current.id));
      } else {
        await db.insert(overdueAlertConfigs).values({ isEnabled: input.isEnabled, cronExpression: input.cronExpression, scheduleCronTaskUid: taskUid, createdBy: ctx.user.id });
      }
      await writeEntityAudit(db, ctx.user.id, "overdue_alert.configure", "overdue_alert_config", current?.id ?? taskUid, { ...input, taskUid, timezone: "UTC", defaultCron: DEFAULT_OVERDUE_ALERT_CRON });
      return { success: true, taskUid } as const;
    }),
  }),
  approval: router({
    policies: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new Error("إدارة سياسات الاعتماد متاحة لمدير النظام فقط");
      const db = await getDb(); if (!db) return [];
      return db.select().from(approvalPolicies).orderBy(desc(approvalPolicies.createdAt));
    }),
    createPolicy: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(160), companyId: z.number().int().positive().nullable().optional(), minAmount: z.number().nonnegative().optional(), maxAmount: z.number().positive().optional(), stages: z.array(z.enum(approvalStages)).min(1), allowSkip: z.boolean().default(false) })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new Error("إدارة سياسات الاعتماد متاحة لمدير النظام فقط");
      if (input.maxAmount !== undefined && input.minAmount !== undefined && input.maxAmount < input.minAmount) throw new Error("الحد الأعلى يجب أن يكون أكبر من أو يساوي الحد الأدنى");
      const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة");
      const stages = normalizeApprovalStages(input.stages);
      const [created] = await db.insert(approvalPolicies).values({ name: input.name, companyId: input.companyId ?? null, minAmount: input.minAmount?.toFixed(4), maxAmount: input.maxAmount?.toFixed(4), stages, allowSkip: input.allowSkip, createdBy: ctx.user.id }).$returningId();
      if (!created?.id) throw new Error("تعذر إنشاء سياسة الاعتماد");
      await writeEntityAudit(db, ctx.user.id, "approval.policy.create", "approval_policy", created.id, { ...input, stages });
      return { id: created.id } as const;
    }),
    updatePolicy: protectedProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(2).max(160).optional(), isActive: z.boolean().optional(), allowSkip: z.boolean().optional(), stages: z.array(z.enum(approvalStages)).min(1).optional() })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new Error("إدارة سياسات الاعتماد متاحة لمدير النظام فقط");
      const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة");
      const [before] = await db.select().from(approvalPolicies).where(eq(approvalPolicies.id, input.id)).limit(1); if (!before) throw new Error("سياسة الاعتماد غير موجودة");
      const updates: Partial<typeof approvalPolicies.$inferInsert> = {}; if (input.name !== undefined) updates.name = input.name; if (input.isActive !== undefined) updates.isActive = input.isActive; if (input.allowSkip !== undefined) updates.allowSkip = input.allowSkip; if (input.stages !== undefined) updates.stages = normalizeApprovalStages(input.stages);
      await db.update(approvalPolicies).set(updates).where(eq(approvalPolicies.id, input.id)); await writeEntityAudit(db, ctx.user.id, "approval.policy.update", "approval_policy", input.id, updates, before as unknown as Record<string, unknown>); return { success: true } as const;
    }),
    delegations: protectedProcedure.query(async ({ ctx }) => { if (ctx.user.role !== "admin") throw new Error("إدارة التفويضات متاحة لمدير النظام فقط"); const db = await getDb(); if (!db) return []; return db.select().from(approvalDelegations).orderBy(desc(approvalDelegations.createdAt)); }),
    createDelegation: protectedProcedure.input(z.object({ fromRole: z.enum(approvalStages), delegateUserId: z.number().int().positive(), startsAt: z.date(), endsAt: z.date(), reason: z.string().trim().min(5).max(1000) })).mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new Error("إدارة التفويضات متاحة لمدير النظام فقط"); if (input.endsAt <= input.startsAt) throw new Error("تاريخ نهاية التفويض يجب أن يكون بعد بدايته");
      const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const [delegate] = await db.select({ id: users.id }).from(users).where(eq(users.id, input.delegateUserId)).limit(1); if (!delegate) throw new Error("المستخدم المفوّض غير موجود");
      const [created] = await db.insert(approvalDelegations).values({ ...input, createdBy: ctx.user.id }).$returningId(); if (!created?.id) throw new Error("تعذر إنشاء التفويض"); await writeEntityAudit(db, ctx.user.id, "approval.delegation.create", "approval_delegation", created.id, { ...input, secret: undefined }); return { id: created.id } as const;
    }),
    deactivateDelegation: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => { if (ctx.user.role !== "admin") throw new Error("إدارة التفويضات متاحة لمدير النظام فقط"); const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); await db.update(approvalDelegations).set({ isActive: false }).where(eq(approvalDelegations.id, input.id)); await writeEntityAudit(db, ctx.user.id, "approval.delegation.deactivate", "approval_delegation", input.id, { isActive: false }); return { success: true } as const; }),
  }),
  requests: router({
    list: protectedProcedure.input(z.object({ status: statusSchema.optional() }).optional()).query(async ({ input }) => { const db = await getDb(); if (!db) return []; return db.select().from(disbursementRequests).where(input?.status ? eq(disbursementRequests.status, input.status) : undefined).orderBy(desc(disbursementRequests.createdAt)).limit(100); }),
    workflow: protectedProcedure.input(z.object({ requestId: z.number().int().positive() })).query(async ({ input }) => { const db = await getDb(); if (!db) return []; return db.select({ id: workflowEvents.id, fromStatus: workflowEvents.fromStatus, toStatus: workflowEvents.toStatus, comment: workflowEvents.comment, actorId: workflowEvents.actorId, actorName: users.name, createdAt: workflowEvents.createdAt }).from(workflowEvents).leftJoin(users, eq(workflowEvents.actorId, users.id)).where(eq(workflowEvents.requestId, input.requestId)).orderBy(desc(workflowEvents.createdAt)); }),
    createDraft: protectedProcedure.input(requestInput).mutation(async ({ input, ctx }) => {
      const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة حالياً");
      return db.transaction(async (tx) => {
        const normalizedBankAccountId = await validateRequestChannelAndBank(tx, input.channelId, input.beneficiaryId, input.bankAccountId);
        const [year] = await tx.select().from(fiscalYears).where(eq(fiscalYears.id, input.fiscalYearId)).limit(1);
        if (!year) throw new Error("السنة المالية غير موجودة");
        const [sequence] = await tx.select().from(sequenceSettings).where(eq(sequenceSettings.fiscalYearId, input.fiscalYearId)).limit(1);
        if (!sequence) throw new Error("لم يتم إعداد تسلسل السنة المالية");
        const serial = String(sequence.nextValue).padStart(sequence.padding, "0");
        const referenceNumber = `${sequence.prefix}-${year.year}-${serial}`;
        const sequenceUpdate = await tx.update(sequenceSettings).set({ nextValue: sequence.nextValue + 1 }).where(and(eq(sequenceSettings.id, sequence.id), eq(sequenceSettings.nextValue, sequence.nextValue))); if (sequenceUpdate[0]?.affectedRows !== 1) throw new Error("تعذر حجز الرقم المرجعي؛ أعد المحاولة");
        const [created] = await tx.insert(disbursementRequests).values({ ...input, bankAccountId: normalizedBankAccountId, amount: input.amount.toFixed(4), amountInWords: amountInArabicWords(input.amount, input.currency), referenceNumber, createdBy: ctx.user.id, status: "draft" }).$returningId();
        if (!created?.id) throw new Error("تعذر إنشاء الطلب");
        const route = await resolveApprovalRoute(tx, input.companyId, input.amount);
        await tx.insert(requestApprovalRoutes).values({ requestId: created.id, policyId: route.policyId, stagesSnapshot: route.stages });
        await writeWorkflowEvent(tx, created.id, null, "draft", ctx.user.id, "إنشاء مسودة");
        return { id: created.id, referenceNumber };
      });
    }),
    transition: protectedProcedure.input(z.object({ requestId: z.number().int().positive(), toStatus: statusSchema, comment: z.string().max(2000).optional() })).mutation(async ({ input, ctx }) => {
      const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة حالياً");
      const [request] = await db.select().from(disbursementRequests).where(eq(disbursementRequests.id, input.requestId)).limit(1);
      if (!request) throw new Error("طلب الصرف غير موجود");
      const route = await getRequestApprovalRoute(db, input.requestId);
      const stageSet = new Set(route.stages);
      const routeAllows = route.allowSkip;
      const isSkipTransition = !allowedTransitions[request.status].includes(input.toStatus) && routeAllows && (
        (request.status === "draft" && input.toStatus === "approved" && !stageSet.has("reviewer"))
        || (request.status === "review" && input.toStatus === "executed" && !stageSet.has("cfo"))
        || (request.status === "draft" && input.toStatus === "executed" && !stageSet.has("reviewer") && !stageSet.has("cfo"))
      );
      if (isSkipTransition && !input.comment?.trim()) throw new Error("سبب تجاوز مرحلة الاعتماد مطلوب");
      const transitionAllowed = allowedTransitions[request.status].includes(input.toStatus)
        || (routeAllows && request.status === "draft" && input.toStatus === "approved" && !stageSet.has("reviewer"))
        || (routeAllows && request.status === "review" && input.toStatus === "executed" && !stageSet.has("cfo"))
        || (routeAllows && request.status === "draft" && input.toStatus === "executed" && !stageSet.has("reviewer") && !stageSet.has("cfo"));
      if (!transitionAllowed) throw new Error("انتقال الحالة غير مسموح");
      const roleNames = new Set<string>();
      if (ctx.user.role !== "admin") {
        const assignedRoles = await db.select({ name: roles.name }).from(userRoles).innerJoin(roles, eq(userRoles.roleId, roles.id)).where(eq(userRoles.userId, ctx.user.id));
        assignedRoles.forEach((role) => roleNames.add(role.name));
        if (ctx.user.loginMethod === "local") {
          const [localAccount] = await db.select({ employeeId: localAuthAccounts.employeeId }).from(localAuthAccounts).where(eq(localAuthAccounts.userId, ctx.user.id)).limit(1);
          if (localAccount?.employeeId) {
            const [linkedEmployee] = await db.select({ operationalRole: internalEmployees.operationalRole, isActive: internalEmployees.isActive }).from(internalEmployees).where(eq(internalEmployees.id, localAccount.employeeId)).limit(1);
            if (linkedEmployee?.isActive) roleNames.add(linkedEmployee.operationalRole);
          }
        }
        const now = new Date();
        const delegations = await db.select().from(approvalDelegations).where(and(eq(approvalDelegations.delegateUserId, ctx.user.id), eq(approvalDelegations.isActive, true)));
        for (const delegation of Array.isArray(delegations) ? delegations : []) {
          if (delegation.startsAt <= now && delegation.endsAt >= now) roleNames.add(delegation.fromRole);
        }
      }
      const requiredPermission = requiredPermissionForTransition(input.toStatus);
      const hasOperationalPermission = requiredPermission ? Array.from(roleNames).some((roleName) => operationalRoleGrantsPermission(roleName, requiredPermission)) : false;
      if (requiredPermission && !(await hasEffectivePermission(db, ctx.user.role, requiredPermission)) && !hasOperationalPermission && ctx.user.role !== "admin") throw new Error("لا تملك الصلاحية المطلوبة لهذه العملية");
      if (input.toStatus === "review" && request.status === "draft" && !roleNames.has("accountant") && ctx.user.role !== "admin") throw new Error("إرسال الطلب للمراجعة متاح للمحاسب فقط");
      if (input.toStatus === "review" && request.status === "review" && !roleNames.has("reviewer") && ctx.user.role !== "admin") throw new Error("تأكيد المراجعة متاح للمراجع فقط");
      if (input.toStatus === "approved" && stageSet.has("cfo") && !roleNames.has("cfo") && ctx.user.role !== "admin") throw new Error("اعتماد الطلب متاح للمدير المالي فقط");
      if (input.toStatus === "executed" && stageSet.has("gm") && !roleNames.has("gm") && ctx.user.role !== "admin") throw new Error("الاعتماد النهائي والتنفيذ متاحان للمدير العام فقط");
      if (input.toStatus === "executed" && !stageSet.has("gm") && !roleNames.has("cfo") && ctx.user.role !== "admin") throw new Error("التنفيذ المفوض متاح للمدير المالي أو من ينوب عنه فقط");
      if (input.toStatus === "draft" && !roleNames.has("accountant") && !roleNames.has("reviewer") && ctx.user.role !== "admin") throw new Error("إعادة الطلب للمسودة متاحة للمحاسب أو المراجع فقط");
      const updates: Partial<typeof disbursementRequests.$inferInsert> = { status: input.toStatus };
      if (input.toStatus === "review") updates.submittedAt = new Date();
      if (input.toStatus === "approved") updates.approvedAt = new Date();
      if (input.toStatus === "executed") updates.executedAt = new Date();
      await db.transaction(async (tx) => { const updated = await tx.update(disbursementRequests).set(updates).where(and(eq(disbursementRequests.id, input.requestId), eq(disbursementRequests.status, request.status))); if (updated[0]?.affectedRows !== 1) throw new Error("تغيرت حالة الطلب قبل اعتماد العملية؛ أعد المحاولة"); await writeWorkflowEvent(tx, input.requestId, request.status, input.toStatus, ctx.user.id, input.comment); });
      return { requestId: input.requestId, status: input.toStatus };
    }),
    update: protectedProcedure.input(z.object({ requestId: z.number().int().positive(), title: z.string().min(2).max(240), description: z.string().max(5000).optional(), amount: z.number().positive(), currency: z.string().min(3).max(8), beneficiaryId: z.number().int().positive(), bankAccountId: z.number().int().positive().nullable().optional(), channelId: z.number().int().positive(), fiscalYearId: z.number().int().positive(), scheduledFor: z.date().nullable().optional() })).mutation(async ({ input, ctx }) => {
      const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة حالياً");
      const [request] = await db.select().from(disbursementRequests).where(eq(disbursementRequests.id, input.requestId)).limit(1);
      if (!request) throw new Error("طلب الصرف غير موجود");
      const roleNames = new Set<string>();
      let assignedRoleCount = 0;
      if (ctx.user.role !== "admin") {
        const assignedRoles = await db.select({ name: roles.name }).from(userRoles).innerJoin(roles, eq(userRoles.roleId, roles.id)).where(eq(userRoles.userId, ctx.user.id));
        assignedRoleCount = assignedRoles.length;
        assignedRoles.forEach((role) => roleNames.add(role.name));
      }
      const canEdit = ctx.user.role === "admin" || request.createdBy === ctx.user.id && (request.status === "draft" || request.status === "rejected") && (roleNames.has("accountant") || roleNames.has("reviewer") || assignedRoleCount === 0);
      if (!canEdit) throw new Error("لا يمكن تعديل الطلب إلا في المسودة أو بعد إعادته للمحاسب");
      const normalizedBankAccountId = await validateRequestChannelAndBank(db, input.channelId, input.beneficiaryId, input.bankAccountId);
      const amountInWords = amountInArabicWords(input.amount, input.currency);
      await db.update(disbursementRequests).set({ title: input.title, description: input.description, amount: input.amount.toFixed(4), currency: input.currency.toUpperCase(), amountInWords, beneficiaryId: input.beneficiaryId, bankAccountId: normalizedBankAccountId, channelId: input.channelId, fiscalYearId: input.fiscalYearId, scheduledFor: input.scheduledFor ?? null }).where(eq(disbursementRequests.id, input.requestId));
      await writeEntityAudit(db, ctx.user.id, "request.update", "disbursement_request", input.requestId, input, request);
      return { success: true } as const;
    }),
  }),
});

export type AppRouter = typeof appRouter;
