import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import * as database from "./db";
import type { TrpcContext } from "./_core/context";

type TestUser = NonNullable<TrpcContext["user"]>;

function context(role: "admin" | "user" = "admin"): TrpcContext {
  const now = new Date();
  const user: TestUser = { id: 7, openId: "workflow-test", email: "workflow@example.com", name: "مستخدم الاختبار", loginMethod: "test", role, createdAt: now, updatedAt: now, lastSignedIn: now };
  return { user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

function selectChain(value: unknown) {
  return { from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue(value) })) })) };
}

describe("requests workflow routes", () => {
  afterEach(() => vi.restoreAllMocks());

  it("creates a draft with a reference and initial workflow audit event", async () => {
    const auditRows: Array<Record<string, unknown>> = [];
    let selectCalls = 0;
    const tx = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockImplementation(async () => { selectCalls += 1; return selectCalls === 1 ? [{ id: 3, year: 2026 }] : [{ id: 4, fiscalYearId: 3, prefix: "TRZ", nextValue: 12, padding: 4 }]; }) })) })) })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) })) })),
      insert: vi.fn(() => ({ values: vi.fn((values: Record<string, unknown>) => { if (typeof values.action === "string") auditRows.push(values); return { $returningId: vi.fn().mockResolvedValue([{ id: 88 }]) }; }) })),
    };
    const db = { transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)) };
    vi.spyOn(database, "getDb").mockResolvedValue(db as never);
    const caller = appRouter.createCaller(context());
    const result = await caller.requests.createDraft({ title: "طلب اختبار سير العمل", companyId: 1, beneficiaryId: 2, channelId: 3, fiscalYearId: 3, amount: 1250, currency: "SAR" });
    expect(result).toEqual({ id: 88, referenceNumber: "TRZ-2026-0012" });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({ action: "request.status.draft", entityType: "disbursement_request", entityId: "88" });
  });

  it("allows the primary lifecycle transitions and records workflow plus audit for each one", async () => {
    let currentStatus: "draft" | "review" | "approved" | "executed" = "draft";
    const workflowRows: Array<Record<string, unknown>> = [];
    const auditRows: Array<Record<string, unknown>> = [];
    const tx = {
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) })) })),
      insert: vi.fn(() => ({ values: vi.fn((values: Record<string, unknown>) => { if (values.requestId && values.toStatus) workflowRows.push(values); if (typeof values.action === "string") auditRows.push(values); return { $returningId: vi.fn().mockResolvedValue([{ id: 1 }]) }; }) })),
    };
    const db = {
      select: vi.fn(() => selectChain(currentStatus === "draft" ? [{ id: 41, status: "draft" }] : [{ id: 41, status: currentStatus }]).from),
      transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    // The permission lookup is intentionally empty so the admin default permissions apply.
    db.select = vi.fn()
      .mockImplementationOnce(() => selectChain([{ id: 41, status: "draft" }]))
      .mockImplementationOnce(() => selectChain([]))
      .mockImplementationOnce(() => selectChain([]))
      .mockImplementationOnce(() => selectChain([{ id: 41, status: "review" }]))
      .mockImplementationOnce(() => selectChain([]))
      .mockImplementationOnce(() => selectChain([]))
      .mockImplementationOnce(() => selectChain([{ id: 41, status: "approved" }]))
      .mockImplementationOnce(() => selectChain([]))
      .mockImplementationOnce(() => selectChain([]));
    vi.spyOn(database, "getDb").mockResolvedValue(db as never);
    const caller = appRouter.createCaller(context());
    for (const toStatus of ["review", "approved", "executed"] as const) {
      const result = await caller.requests.transition({ requestId: 41, toStatus });
      expect(result.status).toBe(toStatus);
      currentStatus = toStatus;
    }
    expect(workflowRows.map((row) => row.toStatus)).toEqual(["review", "approved", "executed"]);
    expect(auditRows.map((row) => row.action)).toEqual(["request.status.review", "request.status.approved", "request.status.executed"]);
  });

  it("runs createDraft through review, approved, and executed as one audited sequence", async () => {
    const workflowRows: Array<Record<string, unknown>> = [];
    const auditRows: Array<Record<string, unknown>> = [];
    let createSelect = 0;
    const tx = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockImplementation(async () => { createSelect += 1; return createSelect === 1 ? [{ id: 3, year: 2026 }] : [{ id: 4, fiscalYearId: 3, prefix: "TRZ", nextValue: 12, padding: 4 }]; }) })) })) })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) })) })),
      insert: vi.fn(() => ({ values: vi.fn((values: Record<string, unknown>) => { if (values.toStatus) workflowRows.push(values); if (typeof values.action === "string") auditRows.push(values); return { $returningId: vi.fn().mockResolvedValue([{ id: 88 }]) }; }) })),
    };
    const db = {
      select: vi.fn().mockImplementationOnce(() => selectChain([{ id: 88, status: "draft" }])).mockImplementationOnce(() => selectChain([])).mockImplementationOnce(() => selectChain([])).mockImplementationOnce(() => selectChain([{ id: 88, status: "review" }])).mockImplementationOnce(() => selectChain([])).mockImplementationOnce(() => selectChain([])).mockImplementationOnce(() => selectChain([{ id: 88, status: "approved" }])).mockImplementationOnce(() => selectChain([])).mockImplementationOnce(() => selectChain([])),
      transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    vi.spyOn(database, "getDb").mockResolvedValue(db as never);
    const caller = appRouter.createCaller(context());
    const draft = await caller.requests.createDraft({ title: "سلسلة اختبار", companyId: 1, beneficiaryId: 2, channelId: 3, fiscalYearId: 3, amount: 100, currency: "SAR" });
    expect(draft).toEqual({ id: 88, referenceNumber: "TRZ-2026-0012" });
    for (const toStatus of ["review", "approved", "executed"] as const) await caller.requests.transition({ requestId: 88, toStatus });
    expect(workflowRows.map((row) => row.toStatus)).toEqual(["draft", "review", "approved", "executed"]);
    expect(auditRows.map((row) => row.action)).toEqual(["request.status.draft", "request.status.review", "request.status.approved", "request.status.executed"]);
  });

  it("records rejected and rejected-to-draft transitions", async () => {
    const workflowRows: Array<Record<string, unknown>> = [];
    const auditRows: Array<Record<string, unknown>> = [];
    const tx = { update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) })) })), insert: vi.fn(() => ({ values: vi.fn((values: Record<string, unknown>) => { if (values.toStatus) workflowRows.push(values); if (typeof values.action === "string") auditRows.push(values); return { $returningId: vi.fn().mockResolvedValue([{ id: 1 }]) }; }) })) };
    const db = { select: vi.fn().mockImplementationOnce(() => selectChain([{ id: 41, status: "draft" }])).mockImplementationOnce(() => selectChain([])).mockImplementationOnce(() => selectChain([])).mockImplementationOnce(() => selectChain([{ id: 41, status: "rejected" }])), transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)) };
    vi.spyOn(database, "getDb").mockResolvedValue(db as never);
    const caller = appRouter.createCaller(context());
    await expect(caller.requests.transition({ requestId: 41, toStatus: "rejected", comment: "مرفوض للاختبار" })).resolves.toMatchObject({ status: "rejected" });
    await expect(caller.requests.transition({ requestId: 41, toStatus: "draft", comment: "إعادة للمراجعة" })).resolves.toMatchObject({ status: "draft" });
    expect(workflowRows.map((row) => [row.fromStatus, row.toStatus])).toEqual([["draft", "rejected"], ["rejected", "draft"]]);
    expect(auditRows.map((row) => row.action)).toEqual(["request.status.rejected", "request.status.draft"]);
  });

  it("rejects an invalid transition before writing workflow or audit rows", async () => {
    const tx = { update: vi.fn(), insert: vi.fn() };
    const db = { select: vi.fn(() => selectChain([{ id: 41, status: "draft" }])), transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)) };
    vi.spyOn(database, "getDb").mockResolvedValue(db as never);
    const caller = appRouter.createCaller(context());
    await expect(caller.requests.transition({ requestId: 41, toStatus: "executed" })).rejects.toThrow("انتقال الحالة غير مسموح");
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

export {};
