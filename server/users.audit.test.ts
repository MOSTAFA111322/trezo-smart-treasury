import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import * as database from "./db";
import type { TrpcContext } from "./_core/context";

type TestUser = NonNullable<TrpcContext["user"]>;

function context(): TrpcContext {
  const now = new Date();
  const user: TestUser = { id: 1, openId: "admin-audit", email: "admin@example.com", name: "مدير الاختبار", loginMethod: "test", role: "admin", createdAt: now, updatedAt: now, lastSignedIn: now };
  return { user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("users.updateRole audit", () => {
  afterEach(() => vi.restoreAllMocks());

  it("records the previous and next role", async () => {
    const auditValues: Array<Record<string, unknown>> = [];
    const fakeDb = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ role: "user" }]) })) })) })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
      insert: vi.fn(() => ({ values: vi.fn((values: Record<string, unknown>) => { auditValues.push(values); return Promise.resolve(); }) })),
    };
    vi.spyOn(database, "getDb").mockResolvedValue(fakeDb as never);
    const caller = appRouter.createCaller(context());
    await expect(caller.users.updateRole({ id: 9, role: "admin" })).resolves.toEqual({ success: true });
    expect(auditValues[0]).toMatchObject({ action: "user.role.update", beforeData: { role: "user" }, afterData: { role: "admin" } });
  });
});

export {};


describe("audit.list filters", () => {
  afterEach(() => vi.restoreAllMocks());

  it("filters by action and date range", async () => {
    const rows = [
      { id: 1, action: "report.export.pdf", entityType: "financial_report", entityId: "1", createdAt: new Date("2026-08-10T12:00:00Z") },
      { id: 2, action: "overdue_alert.retry", entityType: "overdue_alert_delivery", entityId: "2", createdAt: new Date("2026-08-18T12:00:00Z") },
    ];
    const fakeDb = { select: vi.fn(() => ({ from: vi.fn(() => ({ orderBy: vi.fn(() => ({ limit: vi.fn().mockResolvedValue(rows) })) })) })) };
    vi.spyOn(database, "getDb").mockResolvedValue(fakeDb as never);
    const caller = appRouter.createCaller(context());
    const result = await caller.audit.list({ action: "overdue_alert.retry", from: new Date("2026-08-18T00:00:00Z"), to: new Date("2026-08-18T23:59:59Z") });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 2, action: "overdue_alert.retry" });
  });
});
