import { describe, expect, it } from "vitest";
import { financialReportCsv } from "./financialReport";

describe("financialReportCsv", () => {
  it("exports Arabic report data with CSV-safe fields and ISO dates", () => {
    const csv = financialReportCsv([{
      referenceNumber: "TRZ-2026-00001",
      companyName: "شركة, المثال",
      fiscalYear: 2026,
      beneficiaryName: "مورد الخدمات",
      title: "دفعة \"تشغيلية\"",
      amount: "1250.5000",
      currency: "YER",
      status: "approved",
      scheduledFor: new Date("2026-04-10T00:00:00Z"),
      createdAt: new Date("2026-04-01T00:00:00Z"),
    }]);

    expect(csv).toContain("المرجع,الشركة");
    expect(csv).toContain('"شركة, المثال"');
    expect(csv).toContain('"دفعة ""تشغيلية"""');
    expect(csv).toContain("2026-04-10");
  });
});
