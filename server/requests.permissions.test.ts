import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn() }));

import { appRouter } from "./routers";
import { getDb } from "./db";

function context(role: "user" | "admin", id = 7) {
  return {
    user: { id, openId: `user-${id}`, name: "Test", email: `user${id}@example.com`, loginMethod: "test", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as never,
    res: {} as never,
  };
}

function mockTransitionDb(permissionAssigned: boolean) {
  const request = { id: 4, status: "review", createdBy: 7 };
  const selectResults = [
    [request],
    [{ id: 2, name: "user" }],
    [{ id: 9, code: "requests.approve" }],
    permissionAssigned ? [{ roleId: 2 }] : [],
  ];
  const select = vi.fn();
  for (const result of selectResults) {
    select.mockReturnValueOnce({ from: () => ({ where: () => ({ limit: vi.fn().mockResolvedValue(result) }) }) });
  }
  const tx = {
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) }),
  };
  return {
    select,
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
  };
}

describe("requests.transition permission route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects approval when the database role has no approval permission", async () => {
    vi.mocked(getDb).mockResolvedValue(mockTransitionDb(false) as never);
    const caller = appRouter.createCaller(context("user") as never);
    await expect(caller.requests.transition({ requestId: 4, toStatus: "approved" })).rejects.toThrow("لا تملك الصلاحية المطلوبة");
  });

  it("allows approval when the database role is assigned requests.approve", async () => {
    vi.mocked(getDb).mockResolvedValue(mockTransitionDb(true) as never);
    const caller = appRouter.createCaller(context("user") as never);
    await expect(caller.requests.transition({ requestId: 4, toStatus: "approved" })).resolves.toEqual({ requestId: 4, status: "approved" });
  });
});
