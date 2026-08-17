import { COOKIE_NAME } from "@shared/const";
import { amountInArabicWords } from "@shared/amountInWords";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { auditLogs, banks, beneficiaries, companies, disbursementChannels, disbursementRequests, fiscalYears, paymentCalendarEntries, sequenceSettings, workflowEvents } from "../drizzle/schema";
import { getDb } from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

const statuses = ["draft", "review", "approved", "executed", "rejected"] as const;
const statusSchema = z.enum(statuses);
const requestInput = z.object({
  title: z.string().min(3).max(240), companyId: z.number().int().positive(), beneficiaryId: z.number().int().positive(),
  bankAccountId: z.number().int().positive().optional(), channelId: z.number().int().positive(), fiscalYearId: z.number().int().positive(),
  amount: z.number().positive(), currency: z.string().min(3).max(8), scheduledFor: z.date().optional(), description: z.string().max(5000).optional(),
});

type DbLike = Pick<NonNullable<Awaited<ReturnType<typeof getDb>>>, "insert">;

const allowedTransitions: Record<(typeof statuses)[number], (typeof statuses)[number][]> = {
  draft: ["review", "rejected"], review: ["approved", "rejected"], approved: ["executed", "rejected"], executed: [], rejected: ["draft"],
};

async function writeWorkflowEvent(db: DbLike, requestId: number, fromStatus: (typeof statuses)[number] | null, toStatus: (typeof statuses)[number], actorId: number, comment?: string) {
  await db.insert(workflowEvents).values({ requestId, fromStatus, toStatus, actorId, comment });
  await db.insert(auditLogs).values({ actorId, action: `request.status.${toStatus}`, entityType: "disbursement_request", entityId: String(requestId), beforeData: { status: fromStatus }, afterData: { status: toStatus }, metadata: { workflow: true } });
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => { const options = getSessionCookieOptions(ctx.req); ctx.res.clearCookie(COOKIE_NAME, { ...options, maxAge: -1 }); return { success: true } as const; }),
  }),
  entities: router({
    companies: router({
      list: protectedProcedure.query(async () => { const db = await getDb(); return db ? db.select().from(companies).orderBy(desc(companies.createdAt)) : []; }),
      create: protectedProcedure.input(z.object({ name: z.string().min(2).max(180), legalName: z.string().max(220).optional(), registrationNumber: z.string().max(80).optional(), defaultCurrency: z.string().length(3) })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const [row] = await db.insert(companies).values({ ...input, createdBy: ctx.user.id }).$returningId(); return row; }),
      remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => { if (ctx.user.role !== "admin") throw new Error("صلاحية المدير مطلوبة"); const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); await db.update(companies).set({ isActive: false }).where(eq(companies.id, input.id)); return { success: true }; }),
    }),
    beneficiaries: router({
      list: protectedProcedure.input(z.object({ companyId: z.number().int().positive().optional() }).optional()).query(async ({ input }) => { const db = await getDb(); return db ? db.select().from(beneficiaries).where(input?.companyId ? eq(beneficiaries.companyId, input.companyId) : undefined).orderBy(desc(beneficiaries.createdAt)) : []; }),
      create: protectedProcedure.input(z.object({ companyId: z.number().int().positive(), name: z.string().min(2).max(180), type: z.enum(["individual", "organization"]), taxNumber: z.string().max(80).optional(), phone: z.string().max(40).optional(), email: z.string().email().optional() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const [row] = await db.insert(beneficiaries).values(input).$returningId(); return row; }),
    }),
    banks: router({
      list: protectedProcedure.query(async () => { const db = await getDb(); return db ? db.select().from(banks).orderBy(desc(banks.createdAt)) : []; }),
      create: protectedProcedure.input(z.object({ name: z.string().min(2).max(160), swiftCode: z.string().max(40).optional(), country: z.string().max(80).optional() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const [row] = await db.insert(banks).values(input).$returningId(); return row; }),
    }),
    channels: router({
      list: protectedProcedure.query(async () => { const db = await getDb(); return db ? db.select().from(disbursementChannels).orderBy(desc(disbursementChannels.createdAt)) : []; }),
      create: protectedProcedure.input(z.object({ name: z.string().min(2).max(120), code: z.string().min(2).max(32), description: z.string().max(500).optional() })).mutation(async ({ input }) => { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const [row] = await db.insert(disbursementChannels).values(input).$returningId(); return row; }),
    }),
  }),
  calendar: router({
    list: protectedProcedure.input(z.object({ from: z.date().optional(), to: z.date().optional() }).optional()).query(async ({ input }) => { const db = await getDb(); if (!db) return []; const rows = await db.select().from(paymentCalendarEntries).orderBy(paymentCalendarEntries.dueDate); return rows.filter((row) => (!input?.from || row.dueDate >= input.from) && (!input?.to || row.dueDate <= input.to)); }),
    create: protectedProcedure.input(z.object({ companyId: z.number().int().positive(), beneficiaryId: z.number().int().positive().optional(), title: z.string().min(3).max(240), amount: z.number().positive(), currency: z.string().length(3), dueDate: z.date(), notes: z.string().max(2000).optional() })).mutation(async ({ input, ctx }) => { const db = await getDb(); if (!db) throw new Error("قاعدة البيانات غير متاحة"); const [row] = await db.insert(paymentCalendarEntries).values({ ...input, amount: input.amount.toFixed(4), createdBy: ctx.user.id }).$returningId(); return row; }),
  }),
  audit: router({
    list: protectedProcedure.input(z.object({ entityType: z.string().max(80).optional(), entityId: z.string().max(80).optional() }).optional()).query(async ({ input }) => { const db = await getDb(); if (!db) return []; const rows = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(200); return rows.filter((row) => (!input?.entityType || row.entityType === input.entityType) && (!input?.entityId || row.entityId === input.entityId)); }),
  }),
  dashboard: router({
    summary: protectedProcedure.query(async () => {
      const db = await getDb(); if (!db) return { total: 0, pending: 0, executed: 0, upcoming: 0 };
      const [row] = await db.select({ total: sql<string>`coalesce(sum(${disbursementRequests.amount}), 0)`, pending: sql<string>`coalesce(sum(case when ${disbursementRequests.status} in ('draft','review') then ${disbursementRequests.amount} else 0 end), 0)`, executed: sql<string>`coalesce(sum(case when ${disbursementRequests.status} = 'executed' then ${disbursementRequests.amount} else 0 end), 0)`, upcoming: sql<string>`coalesce(sum(case when ${disbursementRequests.scheduledFor} >= now() and ${disbursementRequests.scheduledFor} < date_add(now(), interval 7 day) then ${disbursementRequests.amount} else 0 end), 0)` }).from(disbursementRequests);
      return row ?? { total: 0, pending: 0, executed: 0, upcoming: 0 };
    }),
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
        await tx.update(sequenceSettings).set({ nextValue: sequence.nextValue + 1 }).where(eq(sequenceSettings.id, sequence.id));
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
      if (["approved", "executed", "rejected"].includes(input.toStatus) && ctx.user.role !== "admin") throw new Error("لا تملك صلاحية اعتماد هذه العملية");
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
