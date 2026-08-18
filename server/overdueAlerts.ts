import type { RequestHandler } from "express";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { companies, disbursementRequests, overdueAlertConfigs, overdueAlertDeliveries } from "../drizzle/schema";
import { getDb } from "./db";
import { notifyOwner } from "./_core/notification";
import { sdk } from "./_core/sdk";

export const DEFAULT_OVERDUE_ALERT_CRON = "0 0 6 * * *";
export const OVERDUE_ALERT_PATH = "/api/scheduled/overdue-owner-alert";

type OverdueRequestSummary = {
  referenceNumber: string;
  title: string;
  amount: string;
  currency: string;
  scheduledFor: Date | null;
  companyName: string;
};

export function deliveryDateUtc(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function buildOverdueOwnerAlertContent(rows: OverdueRequestSummary[]): string {
  if (!rows.length) return "لا توجد طلبات صرف متأخرة عند وقت الفحص.";
  const preview = rows.slice(0, 5).map((row) => {
    const due = row.scheduledFor ? row.scheduledFor.toLocaleDateString("ar-SA") : "تاريخ غير محدد";
    return `• ${row.referenceNumber} — ${row.title} (${row.amount} ${row.currency})، ${row.companyName}، استحقاق ${due}`;
  });
  const remaining = rows.length > preview.length ? `\nو${rows.length - preview.length} طلبات أخرى متأخرة.` : "";
  return `يوجد ${rows.length} طلبات صرف متأخرة لم تُنفذ بعد:\n${preview.join("\n")}${remaining}\n\nراجع مساحة العمل > طلبات الصرف لاتخاذ الإجراء المناسب.`;
}

export const runOverdueOwnerAlert: RequestHandler = async (req, res) => {
  const startedAt = new Date();
  let taskUid: string | undefined;
  try {
    const cronUser = await sdk.authenticateRequest(req);
    if (!cronUser.isCron || !cronUser.taskUid) return res.status(403).json({ error: "cron-only" });
    taskUid = cronUser.taskUid;

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "database-unavailable", taskUid, timestamp: startedAt.toISOString() });
    const config = (await db.select().from(overdueAlertConfigs).where(eq(overdueAlertConfigs.scheduleCronTaskUid, taskUid)).limit(1))[0];
    if (!config) return res.json({ ok: true, skipped: "orphan" });
    if (!config.isEnabled) return res.json({ ok: true, skipped: "disabled" });

    const dateKey = deliveryDateUtc(startedAt);
    const existing = (await db.select().from(overdueAlertDeliveries).where(and(eq(overdueAlertDeliveries.alertConfigId, config.id), eq(overdueAlertDeliveries.deliveryDate, dateKey))).limit(1))[0];
    if (existing?.status === "sent") return res.json({ ok: true, skipped: "already-sent", deliveryId: existing.id });

    const rows = await db.select({
      referenceNumber: disbursementRequests.referenceNumber,
      title: disbursementRequests.title,
      amount: disbursementRequests.amount,
      currency: disbursementRequests.currency,
      scheduledFor: disbursementRequests.scheduledFor,
      companyName: companies.name,
    }).from(disbursementRequests).innerJoin(companies, eq(disbursementRequests.companyId, companies.id)).where(and(
      lt(disbursementRequests.scheduledFor, startedAt),
      inArray(disbursementRequests.status, ["draft", "review", "approved"]),
    )).orderBy(disbursementRequests.scheduledFor);

    const content = buildOverdueOwnerAlertContent(rows);
    let deliveryId = existing?.id;
    if (!deliveryId) {
      const [created] = await db.insert(overdueAlertDeliveries).values({
        alertConfigId: config.id,
        deliveryDate: dateKey,
        status: "pending",
        requestCount: rows.length,
        content,
        attempts: 1,
      }).$returningId();
      deliveryId = created?.id;
    } else {
      await db.update(overdueAlertDeliveries).set({ status: "pending", requestCount: rows.length, content, lastError: null, attempts: (existing?.attempts ?? 0) + 1 }).where(eq(overdueAlertDeliveries.id, deliveryId));
    }
    if (!deliveryId) throw new Error("تعذر تسجيل نتيجة تنبيه الطلبات المتأخرة");

    const delivered = await notifyOwner({ title: rows.length ? `طلبات صرف متأخرة (${rows.length})` : "فحص الطلبات المتأخرة", content });
    if (!delivered) {
      await db.update(overdueAlertDeliveries).set({ status: "failed", lastError: "تعذر إرسال الإشعار إلى مالك النظام" }).where(eq(overdueAlertDeliveries.id, deliveryId));
      throw new Error("تعذر إرسال الإشعار إلى مالك النظام");
    }

    await db.update(overdueAlertDeliveries).set({ status: "sent", sentAt: new Date(), lastError: null }).where(eq(overdueAlertDeliveries.id, deliveryId));
    return res.json({ ok: true, deliveryId, requestCount: rows.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message, context: { url: req.originalUrl, taskUid }, timestamp: new Date().toISOString() });
  }
};
