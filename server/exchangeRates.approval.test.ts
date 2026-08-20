import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import * as database from "./db";
import type { TrpcContext } from "./_core/context";

type TestUser = NonNullable<TrpcContext["user"]>;

function adminContext(): TrpcContext {
  const now = new Date();
  const user: TestUser = { id: 7, openId: "approval-admin", email: "admin@example.com", name: "مدير الاعتماد", loginMethod: "test", role: "admin", createdAt: now, updatedAt: now, lastSignedIn: now };
  return { user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("settings.createExchangeRate approval metadata", () => {
  afterEach(() => vi.restoreAllMocks());

  it("records a pending manual rate for second-user approval without self-approval", async () => {
    const inserted: Array<Record<string, unknown>> = [];
    const db = {
      insert: vi.fn(() => ({
        values: vi.fn((values: Record<string, unknown>) => {
          inserted.push(values);
          return { $returningId: vi.fn().mockResolvedValue([{ id: inserted.length }]) };
        }),
      })),
    };
    vi.spyOn(database, "getDb").mockResolvedValue(db as never);

    const caller = appRouter.createCaller(adminContext());
    await caller.settings.createExchangeRate({
      baseCurrency: "USD",
      quoteCurrency: "YER",
      rate: 2450.5,
      effectiveAt: new Date("2026-08-18T06:00:00.000Z"),
      source: "إدخال يدوي",
      approvalNote: "اعتماد لجنة الخزينة",
    });

    const rateRow = inserted.find((row) => row.baseCurrency === "USD");
    expect(rateRow).toMatchObject({
      quoteCurrency: "YER",
      rate: "2450.5000000000",
      source: "إدخال يدوي",
      approvalStatus: "pending",
      createdBy: 7,
      approvedBy: null,
      approvalNote: "اعتماد لجنة الخزينة",
      approvedAt: null,
    });
  });
});


describe("settings exchange-rate dual control", () => {
  afterEach(() => vi.restoreAllMocks());

  it("denies the creator from approving their own pending rate", async () => {
    const db = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ id: 9, createdBy: 7, approvalStatus: "pending" }]) })) })) })),
    };
    vi.spyOn(database, "getDb").mockResolvedValue(db as never);
    const caller = appRouter.createCaller(adminContext());
    await expect(caller.settings.approveExchangeRate({ id: 9 })).rejects.toThrow("لا يمكن اعتماد سعر الصرف من نفس المستخدم");
  });

  it("records the second approver and audit event when approving", async () => {
    const updated: Array<Record<string, unknown>> = [];
    const audited: Array<Record<string, unknown>> = [];
    const db = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ id: 9, createdBy: 4, approvalStatus: "pending", approvalNote: null }]) })) })) })),
      update: vi.fn(() => ({ set: vi.fn((values: Record<string, unknown>) => { updated.push(values); return { where: vi.fn().mockResolvedValue(undefined) }; }) })),
      insert: vi.fn(() => ({ values: vi.fn((values: Record<string, unknown>) => { audited.push(values); return { $returningId: vi.fn().mockResolvedValue([{ id: 1 }]) }; }) })),
    };
    vi.spyOn(database, "getDb").mockResolvedValue(db as never);
    await appRouter.createCaller({ ...adminContext(), user: { ...adminContext().user!, id: 8 } }).settings.approveExchangeRate({ id: 9, approvalNote: "مراجعة ثانية" });
    expect(updated[0]).toMatchObject({ approvalStatus: "approved", approvedBy: 8, approvalNote: "مراجعة ثانية" });
    expect(audited[0]).toMatchObject({ action: "exchange_rate.approve", entityType: "exchange_rate" });
  });
});
