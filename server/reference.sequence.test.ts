import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import * as database from "./db";
import type { TrpcContext } from "./_core/context";

type TestUser = NonNullable<TrpcContext["user"]>;
type Transaction = { select: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn> };

function context(id: number): TrpcContext {
  const user: TestUser = { id, openId: `sequence-test-${id}`, email: `sequence-${id}@example.com`, name: "اختبار التسلسل", loginMethod: "test", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
  return { user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("reference sequence atomic reservation", () => {
  afterEach(() => vi.restoreAllMocks());

  it("allows only one of six concurrent accountants to reserve the same sequence value", async () => {
    let sequenceReads = 0;
    let releaseSequenceReads: (() => void) | undefined;
    const allReadSequence = new Promise<void>((resolve) => { releaseSequenceReads = resolve; });
    let reserved = false;
    const makeTransaction = (): Transaction => {
      let selectCalls = 0;
      const transaction: Transaction = {
        select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => { selectCalls += 1; if (selectCalls === 1) return [{ id: 1, isActive: true, code: "cashier", name: "صراف" }]; if (selectCalls === 2) return [{ id: 7, year: 2026 }]; if (selectCalls === 3) { sequenceReads += 1; if (sequenceReads === 6) releaseSequenceReads?.(); await allReadSequence; return [{ id: 7, fiscalYearId: 7, prefix: "TR", nextValue: 12, padding: 4 }]; } return [{ id: 7, fiscalYearId: 7, prefix: "TR", nextValue: 12, padding: 4 }]; }) })) })) })),
        update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => { if (reserved) return [{ affectedRows: 0 }]; reserved = true; return [{ affectedRows: 1 }]; }) })) })),
        insert: vi.fn(() => ({ values: vi.fn(() => ({ $returningId: vi.fn().mockResolvedValue([{ id: 99 }]) })) })),
      };
      return transaction;
    };
    const fakeDb = { transaction: vi.fn(async (callback: (transaction: Transaction) => Promise<unknown>) => callback(makeTransaction())) };
    vi.spyOn(database, "getDb").mockResolvedValue(fakeDb as never);
    const callers = Array.from({ length: 6 }, (_, index) => appRouter.createCaller(context(index + 1)));
    const input = { companyId: 1, beneficiaryId: 1, channelId: 1, fiscalYearId: 7, title: "طلب متنافس", amount: 100, currency: "SAR" };

    const results = await Promise.allSettled(callers.map((caller) => caller.requests.createDraft(input)));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(5);
    const fulfilled = results.find((result): result is PromiseFulfilledResult<{ id: number; referenceNumber: string }> => result.status === "fulfilled");
    expect(fulfilled?.value.referenceNumber).toBe("TR-2026-0012");
    expect(reserved).toBe(true);
  });
});
