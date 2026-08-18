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

  it("records an append-only approved manual rate with its approver, timestamp, and note", async () => {
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
      approvalStatus: "approved",
      createdBy: 7,
      approvedBy: 7,
      approvalNote: "اعتماد لجنة الخزينة",
    });
    expect(rateRow?.approvedAt).toBeInstanceOf(Date);
  });
});
