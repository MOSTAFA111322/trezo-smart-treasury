import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn() }));

import { appRouter, operationalRoleGrantsPermission } from "./routers";
import { getDb } from "./db";

function context(role: "user" | "admin", id = 7) {
  return {
    user: { id, openId: `user-${id}`, name: "Test", email: `user${id}@example.com`, loginMethod: "test", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as never,
    res: {} as never,
  };
}

function selectChain(value: unknown) {
  return {
    from: () => ({
      where: () => ({ limit: vi.fn().mockResolvedValue(value) }),
      innerJoin: () => ({ where: vi.fn().mockResolvedValue(value) }),
    }),
  };
}

function mockTransitionDb(permissionAssigned: boolean, route: unknown[] = [], status: "review" | "draft" = "review") {
  const request = { id: 4, status, createdBy: 7 };
  const select = vi.fn();
  // transition order: request, saved route, user roles, active delegations, role, permission.
  const selectResults = [
    [request],
    route,
    permissionAssigned ? [{ name: "cfo" }] : [],
    [],
    [{ id: 2, name: "user" }],
    [{ id: 9, code: "requests.approve" }],
    permissionAssigned ? [{ roleId: 2 }] : [],
  ];
  for (const result of selectResults) select.mockReturnValueOnce(selectChain(result));

  const tx = {
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) }) }),
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

  it("requires a reason when a policy skips an approval stage", async () => {
    vi.mocked(getDb).mockResolvedValue(mockTransitionDb(true, [{ policyId: 3, stagesSnapshot: ["accountant", "cfo", "gm", "auditor"], allowSkip: true }], "draft") as never);
    const caller = appRouter.createCaller(context("user") as never);
    await expect(caller.requests.transition({ requestId: 4, toStatus: "approved" })).rejects.toThrow("سبب تجاوز مرحلة الاعتماد مطلوب");
  });

  it("allows a policy skip when an auditable reason is provided", async () => {
    vi.mocked(getDb).mockResolvedValue(mockTransitionDb(true, [{ policyId: 3, stagesSnapshot: ["accountant", "cfo", "gm", "auditor"], allowSkip: true }], "draft") as never);
    const caller = appRouter.createCaller(context("user") as never);
    await expect(caller.requests.transition({ requestId: 4, toStatus: "approved", comment: "لا يوجد مراجع متاح خلال فترة السفر" })).resolves.toEqual({ requestId: 4, status: "approved" });
  });

  it("maps local operational roles to only their workflow permission", () => {
    expect(operationalRoleGrantsPermission("accountant", "requests.review")).toBe(true);
    expect(operationalRoleGrantsPermission("cfo", "requests.approve")).toBe(true);
    expect(operationalRoleGrantsPermission("accountant", "requests.approve")).toBe(false);
    expect(operationalRoleGrantsPermission("auditor", "requests.execute")).toBe(false);
  });
});
