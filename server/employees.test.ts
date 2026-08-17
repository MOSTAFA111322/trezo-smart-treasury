import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import * as database from "./db";
import type { TrpcContext } from "./_core/context";

type TestUser = NonNullable<TrpcContext["user"]>;

function context(role: TestUser["role"] = "admin"): TrpcContext {
  const now = new Date();
  const user: TestUser = {
    id: 1,
    openId: "employee-test",
    email: "admin@example.com",
    name: "مدير الاختبار",
    loginMethod: "test",
    role,
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("internal employees", () => {
  afterEach(() => vi.restoreAllMocks());

  it("creates and updates an employee with an operational role", async () => {
    const auditValues: Array<Record<string, unknown>> = [];
    const fakeDb = {
      insert: vi.fn((...args: unknown[]) => {
        const callNumber = fakeDb.insert.mock.calls.length;
        if (callNumber === 1) {
          return { values: vi.fn(() => ({ $returningId: vi.fn().mockResolvedValue([{ id: 44 }]) })) };
        }
        return { values: vi.fn((values: Record<string, unknown>) => { auditValues.push(values); return Promise.resolve(undefined); }) };
      }),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([{ id: 44, operationalRole: "accountant" }]) })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
      })),
    };
    vi.spyOn(database, "getDb").mockResolvedValue(fakeDb as never);

    const caller = appRouter.createCaller(context());
    await expect(caller.employees.create({
      employeeNo: "EMP-001",
      fullName: "أحمد المحاسب",
      department: "الخزينة",
      operationalRole: "accountant",
    })).resolves.toMatchObject({ success: true, id: 44 });

    await expect(caller.employees.update({
      id: 44,
      employeeNo: "EMP-001",
      fullName: "أحمد المحاسب",
      department: "الخزينة",
      jobTitle: "محاسب أول",
      operationalRole: "cfo",
      isActive: true,
    })).resolves.toEqual({ success: true });
    expect(fakeDb.update).toHaveBeenCalled();
  });

  it("rejects non-admin access", async () => {
    const caller = appRouter.createCaller(context("user"));
    await expect(caller.employees.list()).rejects.toThrow("صلاحية المدير مطلوبة");
  });
});

export {};
