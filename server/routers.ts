import { COOKIE_NAME } from "@shared/const";
import { amountInArabicWords } from "@shared/amountInWords";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_KEYS, hasPermission } from "@shared/permissions";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { attachments, auditLogs, banks, beneficiaryBankAccounts, beneficiaries, companies, currencies, disbursementChannels, disbursementRequests, exchangeRates, fiscalYears, paymentCalendarEntries, permissions as permissionRows, rolePermissions, roles, sequenceSettings, users, workflowEvents } from "../drizzle/schema";
import { getDb } from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { storagePut } from "./storage";

const statuses = ["draft", "review", "approved", "executed", "rejected"] as const;
const statusSchema = z.enum(statuses);
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

async function hasEffectivePermission(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, roleName: string, permission: PermissionKey) {
  const role = (await db.select().from(roles).where(eq(roles.name, roleName)).limit(1))[0];
  const catalogPermission = (await db.select().from(permissionRows).where(eq(permissionRows.code, permission)).limit(1))[0];
  if (!role || !catalogPermission) return hasPermission(roleName === "admin" ? "admin" : "user", permission);
  const assignment = (await db.select({ roleId: rolePermissions.roleId }).from(rolePermissions).where(and(eq(rolePermissions.roleId, role.id), eq(rolePermissions.permissionId, catalogPermission.id))).limit(1))[0];
  return Boolean(assignment);
}

const allowedTransitions: Record<(typeof statuses)[number], (typeof statuses)[number][]> = {
  draft: ["review", "rejected"], review: ["approved", "rejected"], approved: ["executed", "rejected"], executed: [], rejected: ["draft"],
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
    logout: publicProcedure.mutation(({ ctx }) => { const options = getSessionCookieOptions(ctx.req); ctx.res.clearCookie(COOKIE_NAME, { ...options, maxAge: -1 }); return { success: true } as const; }),
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
    list: protectedProcedure.query(async ({ ctx }) => { if (ctx.user.role !== "admin") throw new Error("صلاحية المدير مطلوبة"); const db = await getDb(); return db ? db.select({ id: users.id, name: users.name, email: users.email, role: users.role, lastSignedIn: users.lastSignedIn }).from(users).orderBy(desc(users.lastSignedIn)) : []; }),
    updateRole: protectedProcedure.input(z.object({ id: z.number().int().positive(), role: z.enum(["user", "admin"]) })).mutation(async ({ input, ctx }) => { if (ctx.user.role !== "admin") throw new Error("صلاحية المدير مطلوبة"); if (input.id === ctx.user.id) throw new Error("لا يمكن تغيير دور المستخدم الحالي"); const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const [previous] = await db.select({ role: users.role }).from(users).where(eq(users.id, input.id)).limit(1); await db.update(users).set({ role: input.role }).where(eq(users.id, input.id)); await writeEntityAudit(db, ctx.user.id, "user.role.update", "user", input.id, { role: input.role }, previous ? { role: previous.role } : undefined); return { success: true }; }),
  }),
  entities: router({
    companies: router({
      list: protectedProcedure.query(async () => { const db = await getDb(); return db ? db.select().from(companies).orderBy(desc(companies.createdAt)) : []; }),
      create: protectedProcedure.input(z.object({ name: z.string().min(2).max(180), legalName: z.string().max(220).optional(), registrationNumber: z.string().max(80).optional(), defaultCurrency: z.string().length(3) })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); try { const [row] = await db.insert(companies).values({ ...input, createdBy: ctx.user.id }).$returningId(); if (row?.id) await writeEntityAudit(db, ctx.user.id, "company.create", "company", row.id, input); return row; } catch (error) { if (isDuplicateKeyError(error)) throw new Error("اسم الشركة أو رقم التسجيل مستخدم مسبقاً. اختر قيمة مختلفة أو استخدم الشركة الموجودة في القائمة."); throw error; } }),
      update: protectedProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().min(2).max(180), legalName: z.string().max(220).optional(), registrationNumber: z.string().max(80).optional(), defaultCurrency: z.string().length(3) })).mutation(async ({ input, ctx }) => { if (ctx.user.role !== "admin") throw new Error("صلاحية المدير مطلوبة"); const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const [previous] = await db.select().from(companies).where(eq(companies.id, input.id)).limit(1); await db.update(companies).set({ name: input.name, legalName: input.legalName, registrationNumber: input.registrationNumber, defaultCurrency: input.defaultCurrency }).where(eq(companies.id, input.id)); await writeEntityAudit(db, ctx.user.id, "company.update", "company", input.id, input, previous ? { name: previous.name, legalName: previous.legalName, registrationNumber: previous.registrationNumber, defaultCurrency: previous.defaultCurrency } : undefined); return { success: true }; }),
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
    list: protectedProcedure.input(z.object({ entityType: z.string().max(80).optional(), entityId: z.string().max(80).optional() }).optional()).query(async ({ input }) => { const db = await getDb(); if (!db) return []; const rows = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(200); return rows.filter((row) => (!input?.entityType || row.entityType === input.entityType) && (!input?.entityId || row.entityId === input.entityId)); }),
  }),
  dashboard: router({
        summary: protectedProcedure.query(async () => { const db = await getDb(); if (!db) return { total: 0, pending: 0, executed: 0, upcoming: 0, byCurrency: [] }; const [row] = await db.select({ total: sql<string>`coalesce(sum(${disbursementRequests.amount}), 0)`, pending: sql<string>`coalesce(sum(case when ${disbursementRequests.status} in ('draft','review') then ${disbursementRequests.amount} else 0 end), 0)`, executed: sql<string>`coalesce(sum(case when ${disbursementRequests.status} = 'executed' then ${disbursementRequests.amount} else 0 end), 0)`, upcoming: sql<string>`coalesce(sum(case when ${disbursementRequests.scheduledFor} >= now() and ${disbursementRequests.scheduledFor} < date_add(now(), interval 7 day) then ${disbursementRequests.amount} else 0 end), 0)` }).from(disbursementRequests); const byCurrency = await db.select({ currency: disbursementRequests.currency, total: sql<string>`coalesce(sum(${disbursementRequests.amount}), 0)` }).from(disbursementRequests).groupBy(disbursementRequests.currency); return { ...(row ?? { total: 0, pending: 0, executed: 0, upcoming: 0 }), byCurrency }; }),
        unified: protectedProcedure.input(z.object({ baseCurrency: z.string().min(3).max(8) })).query(async ({ input }) => { const db = await getDb(); if (!db) return { baseCurrency: input.baseCurrency, total: null, byCurrency: [], missingRates: [] as string[] }; const byCurrency = await db.select({ currency: disbursementRequests.currency, total: sql<string>`coalesce(sum(${disbursementRequests.amount}), 0)` }).from(disbursementRequests).groupBy(disbursementRequests.currency); let total = 0; const missingRates: string[] = []; const converted = []; for (const item of byCurrency) { const amount = Number(item.total); if (item.currency === input.baseCurrency) { total += amount; converted.push({ ...item, convertedTotal: amount, rate: 1 }); continue; } const [direct] = await db.select().from(exchangeRates).where(and(eq(exchangeRates.baseCurrency, item.currency), eq(exchangeRates.quoteCurrency, input.baseCurrency))).orderBy(desc(exchangeRates.effectiveAt), desc(exchangeRates.createdAt)).limit(1); const [inverse] = await db.select().from(exchangeRates).where(and(eq(exchangeRates.baseCurrency, input.baseCurrency), eq(exchangeRates.quoteCurrency, item.currency))).orderBy(desc(exchangeRates.effectiveAt), desc(exchangeRates.createdAt)).limit(1); const rate = direct ? Number(direct.rate) : inverse ? 1 / Number(inverse.rate) : null; if (rate === null || !Number.isFinite(rate)) { missingRates.push(item.currency); converted.push({ ...item, convertedTotal: null, rate: null }); continue; } const convertedTotal = amount * rate; total += convertedTotal; converted.push({ ...item, convertedTotal, rate }); } return { baseCurrency: input.baseCurrency, total: missingRates.length ? null : total, byCurrency: converted, missingRates }; }),
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
    createExchangeRate: protectedProcedure.input(z.object({ baseCurrency: z.string().min(3).max(8), quoteCurrency: z.string().min(3).max(8), rate: z.number().positive().finite(), effectiveAt: z.date(), source: z.string().max(120).optional() })).mutation(async ({ input, ctx }) => { if (ctx.user.role !== "admin") throw new Error("صلاحية المدير مطلوبة"); if (input.baseCurrency === input.quoteCurrency) throw new Error("يجب أن تكون عملة الأساس وعملة التسعير مختلفتين"); const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const [row] = await db.insert(exchangeRates).values({ ...input, rate: input.rate.toFixed(10), createdBy: ctx.user.id }).$returningId(); if (row?.id) await writeEntityAudit(db, ctx.user.id, "exchange_rate.create", "exchange_rate", row.id, input); return row; }),
  }),
  attachments: router({
    list: protectedProcedure.input(z.object({ requestId: z.number().int().positive() })).query(async ({ input, ctx }) => { const db = await getDb(); if (!db) return []; const [request] = await db.select({ createdBy: disbursementRequests.createdBy }).from(disbursementRequests).where(eq(disbursementRequests.id, input.requestId)).limit(1); if (!request || !canAccessOwnedRequest(ctx.user.role, ctx.user.id, request.createdBy)) throw new Error("لا تملك صلاحية الوصول إلى مرفقات هذا الطلب"); return db.select().from(attachments).where(eq(attachments.requestId, input.requestId)).orderBy(desc(attachments.createdAt)); }),
    download: protectedProcedure.input(z.object({ attachmentId: z.number().int().positive() })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const [row] = await db.select({ attachment: attachments, requestCreatedBy: disbursementRequests.createdBy }).from(attachments).innerJoin(disbursementRequests, eq(attachments.requestId, disbursementRequests.id)).where(eq(attachments.id, input.attachmentId)).limit(1); if (!row || !canAccessOwnedRequest(ctx.user.role, ctx.user.id, row.requestCreatedBy)) throw new Error("لا تملك صلاحية تنزيل هذا المرفق"); return { fileName: row.attachment.fileName, mimeType: row.attachment.mimeType, url: `/manus-storage/${row.attachment.storageKey}` }; }),
    upload: protectedProcedure.input(z.object({ requestId: z.number().int().positive(), fileName: z.string().min(1).max(240), mimeType: z.string().min(1).max(120), sizeBytes: z.number().int().positive().max(8_000_000), base64: z.string().min(1).max(12_000_000) })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const [request] = await db.select({ createdBy: disbursementRequests.createdBy }).from(disbursementRequests).where(eq(disbursementRequests.id, input.requestId)).limit(1); if (!request || !canAccessOwnedRequest(ctx.user.role, ctx.user.id, request.createdBy)) throw new Error("لا تملك صلاحية إرفاق ملف بهذا الطلب"); const base64Data = input.base64.includes(",") ? input.base64.split(",")[1] : input.base64; const bytes = Buffer.from(base64Data, "base64"); if (bytes.length !== input.sizeBytes) throw new Error("حجم المرفق غير متطابق"); const stored = await storagePut(`requests/${input.requestId}/${input.fileName}`, bytes, input.mimeType); const [row] = await db.insert(attachments).values({ requestId: input.requestId, fileName: input.fileName, mimeType: input.mimeType, sizeBytes: bytes.length, storageKey: stored.key, uploadedBy: ctx.user.id }).$returningId(); if (row?.id) await writeEntityAudit(db, ctx.user.id, "attachment.upload", "attachment", row.id, { requestId: input.requestId, fileName: input.fileName, sizeBytes: bytes.length }); return { ...row, url: stored.url }; }),
  }),
  requests: router({
    list: protectedProcedure.input(z.object({ status: statusSchema.optional() }).optional()).query(async ({ input }) => { const db = await getDb(); if (!db) return []; return db.select().from(disbursementRequests).where(input?.status ? eq(disbursementRequests.status, input.status) : undefined).orderBy(desc(disbursementRequests.createdAt)).limit(100); }),
    createDraft: protectedProcedure.input(requestInput).mutation(async ({ input, ctx }) => {
      const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة حالياً");
      return db.transaction(async (tx) => {
        const [year] = await tx.select().from(fiscalYears).where(eq(fiscalYears.id, input.fiscalYearId)).limit(1);
        if (!year) throw new Error("السنة المالية غير موجودة");
        const [sequence] = await tx.select().from(sequenceSettings).where(eq(sequenceSettings.fiscalYearId, input.fiscalYearId)).limit(1);
        if (!sequence) throw new Error("لم يتم إعداد تسلسل السنة المالية");
        const serial = String(sequence.nextValue).padStart(sequence.padding, "0");
        const referenceNumber = `${sequence.prefix}-${year.year}-${serial}`;
        const sequenceUpdate = await tx.update(sequenceSettings).set({ nextValue: sequence.nextValue + 1 }).where(and(eq(sequenceSettings.id, sequence.id), eq(sequenceSettings.nextValue, sequence.nextValue))); if (sequenceUpdate[0]?.affectedRows !== 1) throw new Error("تعذر حجز الرقم المرجعي؛ أعد المحاولة");
        const [created] = await tx.insert(disbursementRequests).values({ ...input, amount: input.amount.toFixed(4), amountInWords: amountInArabicWords(input.amount, input.currency), referenceNumber, createdBy: ctx.user.id, status: "draft" }).$returningId();
        if (!created?.id) throw new Error("تعذر إنشاء الطلب");
        await writeWorkflowEvent(tx, created.id, null, "draft", ctx.user.id, "إنشاء مسودة");
        return { id: created.id, referenceNumber };
      });
    }),
    transition: protectedProcedure.input(z.object({ requestId: z.number().int().positive(), toStatus: statusSchema, comment: z.string().max(2000).optional() })).mutation(async ({ input, ctx }) => {
      const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة حالياً");
      const [request] = await db.select().from(disbursementRequests).where(eq(disbursementRequests.id, input.requestId)).limit(1);
      if (!request) throw new Error("طلب الصرف غير موجود");
      if (!allowedTransitions[request.status].includes(input.toStatus)) throw new Error("انتقال الحالة غير مسموح");
      const requiredPermission = requiredPermissionForTransition(input.toStatus);
      if (requiredPermission && !(await hasEffectivePermission(db, ctx.user.role, requiredPermission))) throw new Error("لا تملك الصلاحية المطلوبة لهذه العملية");
      const updates: Partial<typeof disbursementRequests.$inferInsert> = { status: input.toStatus };
      if (input.toStatus === "review") updates.submittedAt = new Date();
      if (input.toStatus === "approved") updates.approvedAt = new Date();
      if (input.toStatus === "executed") updates.executedAt = new Date();
      await db.transaction(async (tx) => { await tx.update(disbursementRequests).set(updates).where(eq(disbursementRequests.id, input.requestId)); await writeWorkflowEvent(tx, input.requestId, request.status, input.toStatus, ctx.user.id, input.comment); });
      return { requestId: input.requestId, status: input.toStatus };
    }),
  }),
});

export type AppRouter = typeof appRouter;
