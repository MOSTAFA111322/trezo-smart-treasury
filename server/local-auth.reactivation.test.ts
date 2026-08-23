import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import * as database from "./db";
import type { TrpcContext } from "./_core/context";
import { hashSecret, normalizeUsername, verifySecret } from "./localAuth";

type TestUser = NonNullable<TrpcContext["user"]>;

function context(role: TestUser["role"] = "admin"): TrpcContext {
  const now = new Date();
  return {
    user: {
      id: 1,
      openId: "local-auth-test-admin",
      email: null,
      name: "مدير الاختبار",
      loginMethod: "test",
      role,
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    },
    req: { protocol: "https", headers: {}, cookies: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("local account authentication", () => {
  it("normalizes usernames and stores only a verifiable hash", () => {
    const secret = "temporary-secret-123";
    const encoded = hashSecret(secret);
    expect(normalizeUsername("  Mostafa  ")).toBe("mostafa");
    expect(encoded).not.toContain(secret);
    expect(verifySecret(secret, encoded)).toBe(true);
    expect(verifySecret("wrong-secret-123", encoded)).toBe(false);
  });

  afterEach(() => vi.restoreAllMocks());

  it("allows an admin to reactivate and deactivate a local account", async () => {
    const updateValues: Array<Record<string, unknown>> = [];
    const auditValues: Array<Record<string, unknown>> = [];
    const fakeDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([{ id: 7, isActive: false }]),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((values: Record<string, unknown>) => {
          updateValues.push(values);
          return { where: vi.fn().mockResolvedValue(undefined) };
        }),
      })),
      insert: vi.fn(() => ({
        values: vi.fn((values: Record<string, unknown>) => {
          auditValues.push(values);
          return Promise.resolve(undefined);
        }),
      })),
    };
    vi.spyOn(database, "getDb").mockResolvedValue(fakeDb as never);

    const caller = appRouter.createCaller(context());
    await expect(caller.employees.setLocalAccountActive({ employeeId: 7, isActive: true })).resolves.toEqual({ success: true, isActive: true });
    expect(updateValues[0]).toMatchObject({ isActive: true, failedAttempts: 0, lockedUntil: null });

    await expect(caller.employees.setLocalAccountActive({ employeeId: 7, isActive: false })).resolves.toEqual({ success: true, isActive: false });
    expect(updateValues[1]).toMatchObject({ isActive: false, failedAttempts: 0, lockedUntil: null });
    expect(auditValues).toHaveLength(2);
    expect(auditValues.map((entry) => entry.action)).toEqual(["local_auth_account.activate", "local_auth_account.deactivate"]);
  });

  it("rejects local account activation for non-admin users", async () => {
    const caller = appRouter.createCaller(context("user"));
    await expect(caller.employees.setLocalAccountActive({ employeeId: 7, isActive: true })).rejects.toThrow("صلاحية المدير مطلوبة");
  });
});

export {};
