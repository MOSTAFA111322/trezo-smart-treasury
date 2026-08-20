import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import * as database from "./db";
import type { TrpcContext } from "./_core/context";

type TestUser = NonNullable<TrpcContext["user"]>;

function context(role: "admin" | "user" = "admin"): TrpcContext {
  const now = new Date();
  const user: TestUser = { id: 17, openId: "report-user", email: "report@example.com", name: "مستخدم التقارير", loginMethod: "test", role, createdAt: now, updatedAt: now, lastSignedIn: now };
  return { user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("financial report export audit", () => {
  afterEach(() => vi.restoreAllMocks());

  it("records the filtered PDF export scope in audit metadata", async () => {
    const audited: Array<Record<string, unknown>> = [];
    const db = { insert: vi.fn(() => ({ values: vi.fn((values: Record<string, unknown>) => { audited.push(values); return Promise.resolve(undefined); }) })) };
    vi.spyOn(database, "getDb").mockResolvedValue(db as never);
    await appRouter.createCaller(context()).reports.logExport({ format: "pdf", companyId: 4, fiscalYearId: 2026, recordCount: 12 });
    expect(audited[0]).toMatchObject({ action: "report.export.pdf", entityType: "financial_report", entityId: "4-2026", afterData: { companyId: 4, fiscalYearId: 2026, recordCount: 12 } });
  });

  it("blocks report export audit logging for non-administrators", async () => {
    await expect(appRouter.createCaller(context("user")).reports.logExport({ format: "csv", recordCount: 0 })).rejects.toThrow("تسجيل تصدير التقارير متاح لمدير النظام فقط");
  });
});

export {};
