import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import * as database from "./db";
import type { TrpcContext } from "./_core/context";

type TestUser = NonNullable<TrpcContext["user"]>;

function adminContext(): TrpcContext {
  const now = new Date();
  const user: TestUser = { id: 1, openId: "admin-entities-test", email: "admin@example.com", name: "مدير الاختبار", loginMethod: "test", role: "admin", createdAt: now, updatedAt: now, lastSignedIn: now };
  return { user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

function fakeDb() {
  const auditRows: Array<Record<string, unknown>> = [];
  const insertedValues: Array<Record<string, unknown> | Array<Record<string, unknown>>> = [];
  const insert = vi.fn(() => ({ values: vi.fn((values: Record<string, unknown> | Array<Record<string, unknown>>) => { insertedValues.push(values); if (!Array.isArray(values) && typeof values.action === "string") auditRows.push(values); return { $returningId: vi.fn().mockResolvedValue([{ id: 10 }]) }; }) }));
  const update = vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) })) }));
  const select = vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{}]) })), orderBy: vi.fn().mockResolvedValue([{ id: 7 }]) })) }));
  const transaction = vi.fn(async (callback: (transaction: { insert: typeof insert; update: typeof update; select: typeof select }) => Promise<unknown>) => callback({ insert, update, select }));
  return { auditRows, insertedValues, insert, update, select, transaction };
}

describe("entity CRUD audit routes", () => {
  afterEach(() => vi.restoreAllMocks());

  it("writes audit events for all four entity create routes", async () => {
    const db = fakeDb();
    vi.spyOn(database, "getDb").mockResolvedValue(db as never);
    const caller = appRouter.createCaller(adminContext());
    await caller.entities.companies.create({ name: "شركة الاختبار", defaultCurrency: "SAR" });
    await caller.entities.beneficiaries.create({ companyId: 1, name: "مستفيد الاختبار", type: "organization" });
    await caller.entities.banks.create({ name: "بنك الاختبار" });
    await caller.entities.channels.create({ name: "قناة الاختبار", code: "TEST" });
    expect(db.auditRows.map((row) => row.action)).toEqual(["company.create", "beneficiary.create", "bank.create", "channel.create"]);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.insertedValues.some((values) => Array.isArray(values) && values.some((value) => value.companyId === 10 && value.prefix === "TRZ-C10"))).toBe(true);
  });

  it("returns a clear Arabic error for duplicate company names", async () => {
    const db = fakeDb();
    const duplicateInsert = vi.fn(() => ({ values: vi.fn(() => ({ $returningId: vi.fn().mockRejectedValue(Object.assign(new Error("Duplicate entry"), { code: "ER_DUP_ENTRY", errno: 1062 })) })) }));
    db.insert.mockImplementation(duplicateInsert as never);
    vi.spyOn(database, "getDb").mockResolvedValue(db as never);
    const caller = appRouter.createCaller(adminContext());
    await expect(caller.entities.companies.create({ name: "شركة موجودة", defaultCurrency: "SAR" })).rejects.toThrow("اسم الشركة أو رقم التسجيل مستخدم مسبقاً");
    expect(db.auditRows).toHaveLength(0);
  });

  it("writes audit events for update and logical deactivation routes", async () => {
    const db = fakeDb();
    vi.spyOn(database, "getDb").mockResolvedValue(db as never);
    const caller = appRouter.createCaller(adminContext());
    await caller.entities.companies.update({ id: 1, name: "شركة معدلة", defaultCurrency: "SAR" });
    await caller.entities.companies.remove({ id: 1 });
    await caller.entities.beneficiaries.update({ id: 1, companyId: 1, name: "مستفيد معدل", type: "individual" });
    await caller.entities.beneficiaries.remove({ id: 1 });
    await caller.entities.banks.update({ id: 1, name: "بنك معدل" });
    await caller.entities.banks.remove({ id: 1 });
    await caller.entities.channels.update({ id: 1, name: "قناة معدلة", code: "EDIT" });
    await caller.entities.channels.remove({ id: 1 });
    expect(db.auditRows.map((row) => row.action)).toEqual([
      "company.update", "company.deactivate", "beneficiary.update", "beneficiary.deactivate",
      "bank.update", "bank.deactivate", "channel.update", "channel.deactivate",
    ]);
  });
});

export {}; 
