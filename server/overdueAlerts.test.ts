import { describe, expect, it } from "vitest";
import { buildOverdueOwnerAlertContent, deliveryDateUtc } from "./overdueAlerts";

describe("overdue owner alerts", () => {
  it("uses a stable UTC delivery key for idempotency", () => {
    expect(deliveryDateUtc(new Date("2026-08-18T23:59:59.999Z"))).toBe("2026-08-18");
  });

  it("summarizes overdue requests without exposing more than five detail rows", () => {
    const rows = Array.from({ length: 6 }, (_, index) => ({ referenceNumber: `TRZ-${index + 1}`, title: `طلب ${index + 1}`, amount: "100", currency: "YER", scheduledFor: new Date("2026-08-10T00:00:00Z"), companyName: "شركة الاختبار" }));
    const content = buildOverdueOwnerAlertContent(rows);

    expect(content).toContain("يوجد 6 طلبات صرف متأخرة");
    expect(content).toContain("TRZ-5");
    expect(content).not.toContain("TRZ-6");
    expect(content).toContain("و1 طلبات أخرى متأخرة");
  });
});


import { afterEach, vi } from "vitest";
import { appRouter } from "./routers";
import * as database from "./db";
import type { TrpcContext } from "./_core/context";

type AlertTestUser = NonNullable<TrpcContext["user"]>;
function alertContext(role: "admin" | "user" = "admin"): TrpcContext {
  const now = new Date();
  const user: AlertTestUser = { id: 11, openId: "alert-admin", email: "alert@example.com", name: "مدير التنبيهات", loginMethod: "test", role, createdAt: now, updatedAt: now, lastSignedIn: now };
  return { user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("overdue alert history and retry guards", () => {
  afterEach(() => vi.restoreAllMocks());

  it("exposes delivery history to administrators", async () => {
    const rows = [{ id: 4, deliveryDate: "2026-08-19", status: "failed", attempts: 1, requestCount: 2, lastError: "timeout", lastAttemptAt: new Date() }];
    const db = { select: vi.fn(() => ({ from: vi.fn(() => ({ orderBy: vi.fn(() => ({ limit: vi.fn().mockResolvedValue(rows) })) })) })) };
    vi.spyOn(database, "getDb").mockResolvedValue(db as never);
    await expect(appRouter.createCaller(alertContext()).overdueAlerts.history({ limit: 10 })).resolves.toEqual(rows);
  });

  it("does not retry a delivery that is already sent", async () => {
    const db = { select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ id: 4, status: "sent", attempts: 1 }]) })) })) })) };
    vi.spyOn(database, "getDb").mockResolvedValue(db as never);
    await expect(appRouter.createCaller(alertContext()).overdueAlerts.retry({ deliveryId: 4 })).rejects.toThrow("لا يمكن إعادة إرسال تنبيه غير فاشل");
  });

  it("blocks alert history for non-administrators", async () => {
    await expect(appRouter.createCaller(alertContext("user")).overdueAlerts.history({ limit: 10 })).rejects.toThrow("سجل التنبيهات متاح لمدير النظام فقط");
  });
});
