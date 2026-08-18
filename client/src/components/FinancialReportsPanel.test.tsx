import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const reportQuery = vi.fn(() => ({ data: [{ referenceNumber: "TRZ-001", companyName: "شركة الاختبار", fiscalYear: 2026, beneficiaryName: "المستفيد", title: "مصاريف", amount: "100", currency: "YER", status: "approved", scheduledFor: null, createdAt: new Date("2026-08-18T00:00:00Z") }], isLoading: false, error: null, refetch: vi.fn() }));
function trpcProxy(path: string[] = []): object {
  return new Proxy({}, { get: (_target, property) => {
    if (property === "useQuery") {
      const key = path.join(".");
      if (key === "reports.financial") return reportQuery;
      if (key === "entities.companies.list") return () => ({ data: [{ id: 1, name: "شركة الاختبار" }], isLoading: false, error: null });
      if (key === "settings.fiscalYears") return () => ({ data: [{ id: 9, label: "السنة المالية 2026" }], isLoading: false, error: null });
    }
    return trpcProxy([...path, String(property)]);
  }});
}
vi.mock("@/lib/trpc", () => ({ trpc: trpcProxy() }));
import { FinancialReportsPanel } from "./FinancialReportsPanel";

describe("FinancialReportsPanel", () => {
  afterEach(() => { cleanup(); reportQuery.mockClear(); });
  it("applies company and fiscal-year filters to the export query", () => {
    render(<FinancialReportsPanel />);
    fireEvent.change(screen.getByLabelText("الشركة"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("السنة المالية"), { target: { value: "9" } });
    expect(reportQuery).toHaveBeenLastCalledWith({ companyId: 1, fiscalYearId: 9 });
    expect(screen.getByRole("button", { name: "تنزيل CSV" })).toBeEnabled();
    expect(screen.getByText("1 سجل جاهز للتصدير وفق التصفية الحالية.")).toBeInTheDocument();
  });
});
