import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn() }));

import { appRouter, operationalRoleGrantsPermission } from "./routers";
import { getDb } from "./db";

function context(role: "user" | "admin", id = 7, loginMethod = "test") {
  return {
    user: { id, openId: `user-${id}`, name: "Test", email: `user${id}@example.com`, loginMethod, role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
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
  const request = { id: 4, status, createdBy: 7, channelId: 8, beneficiaryId: 3, bankAccountId: null, currency: "YER" };
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
    select: vi.fn(() => selectChain([{ id: 8, code: "cashier", name: "صراف", isActive: true }])),
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) }) }),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) }),
  };
  return {
    select,
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
  };
}

function localTransitionChain(value: unknown[]) {
  const result = Object.assign(Promise.resolve(value), { limit: vi.fn().mockResolvedValue(value) });
  return {
    from: () => ({
      where: () => result,
      innerJoin: () => ({ where: () => result }),
    }),
  };
}

function mockLocalTransitionDb(operationalRole: "reviewer" | "cfo", reviewerConfirmed = true) {
  const request = { id: 4, status: "review" as const, createdBy: 7, channelId: 8, beneficiaryId: 3, bankAccountId: null, currency: "YER" };
  const select = vi.fn()
    .mockReturnValueOnce(localTransitionChain([request]))
    .mockReturnValueOnce(localTransitionChain([{ policyId: 3, stagesSnapshot: ["accountant", "reviewer", "cfo", "gm"], allowSkip: false }]))
    .mockReturnValueOnce(localTransitionChain([]))
    .mockReturnValueOnce(localTransitionChain([{ employeeId: 12 }]))
    .mockReturnValueOnce(localTransitionChain([{ operationalRole, isActive: true }]))
    .mockReturnValueOnce(localTransitionChain([]));
  const tx = {
    select: vi.fn()
      .mockReturnValueOnce(selectChain(reviewerConfirmed ? [{ id: 91 }] : []))
      .mockReturnValue(selectChain([{ id: 8, code: "cashier", name: "صراف", isActive: true }])),
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) }) }),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) }),
  };
  return { select, transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)) };
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

  it("allows a local reviewer to record review confirmation without advancing the stored status", async () => {
    vi.mocked(getDb).mockResolvedValue(mockLocalTransitionDb("reviewer") as never);
    const caller = appRouter.createCaller(context("admin", 22, "local") as never);

    await expect(caller.requests.transition({ requestId: 4, toStatus: "review" })).resolves.toEqual({ requestId: 4, status: "review" });
  });

  it("allows a local CFO to approve after review but rejects reviewer confirmation", async () => {
    vi.mocked(getDb).mockResolvedValue(mockLocalTransitionDb("cfo") as never);
    const cfoCaller = appRouter.createCaller(context("admin", 23, "local") as never);
    await expect(cfoCaller.requests.transition({ requestId: 4, toStatus: "review" })).rejects.toThrow("لا تملك الصلاحية المطلوبة");

    vi.mocked(getDb).mockResolvedValue(mockLocalTransitionDb("cfo") as never);
    const approvalCaller = appRouter.createCaller(context("admin", 23, "local") as never);
    await expect(approvalCaller.requests.transition({ requestId: 4, toStatus: "approved" })).resolves.toEqual({ requestId: 4, status: "approved" });
  });

  it("rejects local CFO approval until the reviewer confirmation event is recorded", async () => {
    vi.mocked(getDb).mockResolvedValue(mockLocalTransitionDb("cfo", false) as never);
    const caller = appRouter.createCaller(context("admin", 23, "local") as never);

    await expect(caller.requests.transition({ requestId: 4, toStatus: "approved" })).rejects.toThrow("يلزم تأكيد المراجع للطلب قبل اعتماد المدير المالي");
  });

  it("resolves the GM role for a local account linked through localAuthAccounts", async () => {
    const directResult = (value: unknown) => Object.assign(Promise.resolve(value), { limit: vi.fn().mockResolvedValue(value) });
    const select = vi.fn()
      .mockReturnValueOnce({ from: () => ({ innerJoin: () => ({ where: () => directResult([]) }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => directResult([]) }) })
      .mockReturnValueOnce({ from: () => ({ innerJoin: () => ({ where: () => directResult([{ operationalRole: "gm" }]) }) }) });
    vi.mocked(getDb).mockResolvedValue({ select } as never);

    const caller = appRouter.createCaller(context("user", 9240007) as never);
    await expect(caller.auth.currentProfile()).resolves.toEqual({ appRole: "user", operationalRoles: ["gm"] });
  });
});
