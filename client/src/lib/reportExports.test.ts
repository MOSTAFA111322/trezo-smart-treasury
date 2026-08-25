import { describe, expect, it } from "vitest";
import { currencySummary, toFinancialExportRows } from "./reportExports";

describe("request report exports", () => {
  it("maps filtered request rows to the financial export contract", () => {
    const rows = toFinancialExportRows([
      {
        referenceNumber: "TRZ-C1-2026-00001",
        title: "شراء مستلزمات",
        amount: "125.5000",
        currency: "YER",
        status: "review",
        companyId: 1,
        beneficiaryId: 9,
        scheduledFor: null,
        createdAt: new Date("2026-08-25T00:00:00Z"),
      },
    ], {
      companyName: (id) => id === 1 ? "شركة الاختبار" : "غير محدد",
      beneficiaryName: (id) => id === 9 ? "المستفيد" : "غير محدد",
    });

    expect(rows).toEqual([expect.objectContaining({
      referenceNumber: "TRZ-C1-2026-00001",
      companyName: "شركة الاختبار",
      beneficiaryName: "المستفيد",
      fiscalYear: 2026,
      amount: "125.5000",
      currency: "YER",
    })]);
  });

  it("summarizes each currency independently without conversion", () => {
    expect(currencySummary([
      { referenceNumber: "A", companyName: "A", fiscalYear: 2026, beneficiaryName: "X", title: "A", amount: "100.25", currency: "YER", status: "draft", scheduledFor: null, createdAt: new Date("2026-01-01") },
      { referenceNumber: "B", companyName: "A", fiscalYear: 2026, beneficiaryName: "X", title: "B", amount: "50", currency: "YER", status: "review", scheduledFor: null, createdAt: new Date("2026-01-02") },
      { referenceNumber: "C", companyName: "A", fiscalYear: 2026, beneficiaryName: "X", title: "C", amount: "10", currency: "USD", status: "approved", scheduledFor: null, createdAt: new Date("2026-01-03") },
    ])).toBe("USD: 10 · YER: 150.25");
  });
});
