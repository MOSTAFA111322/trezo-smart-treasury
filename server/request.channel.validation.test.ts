import { describe, expect, it } from "vitest";
import { validateRequestChannelAndBank } from "./routers";

type Row = Record<string, unknown>;

function dbFor(rows: Row[]) {
  let index = 0;
  return {
    select: () => ({
      from: () => {
        const chain = {
          innerJoin: () => chain,
          where: () => ({
            limit: async () => [rows[index++] ?? undefined],
          }),
        };
        return chain;
      },
    }),
  } as never;
}

describe("request channel validation", () => {
  it("requires an active linked bank account for bank channels", async () => {
    await expect(validateRequestChannelAndBank(dbFor([{ id: 8, code: "bank", name: "بنك", isActive: true }]), 8, 3, null, "YER")).rejects.toThrow("يجب اختيار الحساب البنكي");
    await expect(validateRequestChannelAndBank(dbFor([
      { id: 8, code: "bank", name: "بنك", isActive: true },
      undefined,
    ]), 8, 3, 41, "YER")).rejects.toThrow("الحساب البنكي غير مرتبط");
    await expect(validateRequestChannelAndBank(dbFor([
      { id: 8, code: "bank", name: "بنك", isActive: true },
      { id: 41, beneficiaryId: 3, bankId: 8, currency: "YER", accountActive: true, bankActive: true },
    ]), 8, 3, 41, "YER", 8)).resolves.toBe(41);
  });

  it("rejects bank-account selection for cashier channels", async () => {
    await expect(validateRequestChannelAndBank(dbFor([{ id: 9, code: "cashier", name: "صراف", isActive: true }]), 9, 3, 41, "YER")).rejects.toThrow("لا تستخدم حساباً بنكياً");
  });

  it("rejects a bank account with a different currency", async () => {
    await expect(validateRequestChannelAndBank(dbFor([
      { id: 8, code: "bank", name: "بنك", isActive: true },
      { id: 41, beneficiaryId: 3, bankId: 8, currency: "SAR", accountActive: true, bankActive: true },
    ]), 8, 3, 41, "YER", 8)).rejects.toThrow("لا تطابق عملة الطلب");
  });

  it("rejects a selected bank that differs from the account bank", async () => {
    await expect(validateRequestChannelAndBank(dbFor([
      { id: 8, code: "bank", name: "بنك", isActive: true },
      { id: 41, beneficiaryId: 3, bankId: 8, currency: "YER", accountActive: true, bankActive: true },
    ]), 8, 3, 41, "YER", 7)).rejects.toThrow("لا يتبع البنك المختار");
  });

  it("rejects inactive channels before any bank lookup", async () => {
    await expect(validateRequestChannelAndBank(dbFor([{ id: 9, code: "cashier", name: "صراف", isActive: false }]), 9, 3, null, "YER")).rejects.toThrow("غير موجودة أو غير مفعلة");
  });
});
