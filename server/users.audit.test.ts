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
