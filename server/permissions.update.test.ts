import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import * as database from "./db";
import type { TrpcContext } from "./_core/context";

type TestUser = NonNullable<TrpcContext["user"]>;

function contextFor(role: "admin" | "user"): TrpcContext {
  const user: TestUser = {
    id: role === "admin" ? 1 : 2,
    openId: `${role}-permissions-test`,
    email: `${role}@example.com`,
    name: role === "admin" ? "مدير الاختبار" : "مستخدم الاختبار",
    loginMethod: "test",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("permissions.update route", () => {
  afterEach(() => vi.restoreAllMocks());

  it("rejects a non-admin before touching the database", async () => {
    const getDb = vi.spyOn(database, "getDb");
    const caller = appRouter.createCaller(contextFor("user"));

    await expect(caller.permissions.update({ roleId: 2, permissionId: 3, enabled: true })).rejects.toThrow("صلاحية المدير مطلوبة");
    expect(getDb).not.toHaveBeenCalled();
  });

  it("allows an admin to update a role permission", async () => {
    const permissionMutation = {
      onDuplicateKeyUpdate: vi.fn().mockResolvedValue(undefined),
    };
    const fakeDb = {
      insert: vi.fn(() => ({ values: vi.fn(() => permissionMutation) })),
      delete: vi.fn(),
    };
    vi.spyOn(database, "getDb").mockResolvedValue(fakeDb as never);
    const caller = appRouter.createCaller(contextFor("admin"));

    await expect(caller.permissions.update({ roleId: 2, permissionId: 3, enabled: true })).resolves.toEqual({ success: true });
    expect(fakeDb.insert).toHaveBeenCalledTimes(1);
    expect(permissionMutation.onDuplicateKeyUpdate).toHaveBeenCalledTimes(1);
  });
});
