import { describe, expect, it } from "vitest";
import { buildOverdueOwnerAlertContent, deliveryDateUtc } from "./overdueAlerts";

describe("overdue owner alerts", () => {
  it("uses a stable UTC delivery key for idempotency", () => {
    expect(deliveryDateUtc(new Date("2026-08-18T23:59:59.999Z"))).toBe("2026-08-18");
  });

  it("summarizes overdue requests without exposing more than five detail rows", () => {
    const rows = Array.from({ length: 6 }, (_, index) => ({ referenceNumber: `TRZ-${index + 1}`, title: `طلب ${index + 1}`, amount: "100", currency: "YER", scheduledFor: new Date("2026-08-10T00:00:00Z"), companyName: "شركة الاختبار" }));
    const content = buildOverdueOwnerAlertContent(rows);

    expect(content).toContain("يوجد 6 طلبات صرف متأخرة");
    expect(content).toContain("TRZ-5");
    expect(content).not.toContain("TRZ-6");
    expect(content).toContain("و1 طلبات أخرى متأخرة");
  });
});
