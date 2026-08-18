import { describe, expect, it } from "vitest";
import { validateRequestChannelAndBank } from "./routers";

type Row = Record<string, unknown>;

function dbFor(rows: Row[]) {
  let index = 0;
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [rows[index++] ?? undefined],
        }),
      }),
    }),
  } as never;
}

describe("request channel validation", () => {
  it("requires an active linked bank account for bank channels", async () => {
    await expect(validateRequestChannelAndBank(dbFor([{ id: 8, code: "bank", name: "بنك", isActive: true }]), 8, 3, null)).rejects.toThrow("يجب اختيار الحساب البنكي");
    await expect(validateRequestChannelAndBank(dbFor([
      { id: 8, code: "bank", name: "بنك", isActive: true },
      undefined,
    ]), 8, 3, 41)).rejects.toThrow("الحساب البنكي غير مرتبط");
    await expect(validateRequestChannelAndBank(dbFor([
      { id: 8, code: "bank", name: "بنك", isActive: true },
      { id: 41, beneficiaryId: 3, isActive: true },
    ]), 8, 3, 41)).resolves.toBe(41);
  });

  it("clears bank account selection for cashier channels", async () => {
    await expect(validateRequestChannelAndBank(dbFor([{ id: 9, code: "cashier", name: "صراف", isActive: true }]), 9, 3, 41)).resolves.toBeNull();
  });

  it("rejects inactive channels before any bank lookup", async () => {
    await expect(validateRequestChannelAndBank(dbFor([{ id: 9, code: "cashier", name: "صراف", isActive: false }]), 9, 3, null)).rejects.toThrow("غير موجودة أو غير مفعلة");
  });
});
