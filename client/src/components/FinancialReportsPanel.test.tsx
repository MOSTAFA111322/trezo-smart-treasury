import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const reportQuery = vi.fn(() => ({ data: [{ referenceNumber: "TRZ-001", companyName: "شركة الاختبار", fiscalYear: 2026, beneficiaryName: "المستفيد", title: "مصاريف", amount: "100", currency: "YER", status: "approved", scheduledFor: null, createdAt: new Date("2026-08-18T00:00:00Z") }], isLoading: false, error: null, refetch: vi.fn() }));
function trpcProxy(path: string[] = []): object {
  return new Proxy({}, { get: (_target, property) => {
    if (property === "useMutation") return () => ({ mutateAsync: vi.fn().mockResolvedValue({ success: true }), isPending: false });
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
const { pdfSave, pdfText } = vi.hoisted(() => ({ pdfSave: vi.fn(), pdfText: vi.fn() }));
vi.mock("jspdf", () => ({ jsPDF: class { setFontSize() {} text(...args: unknown[]) { pdfText(...args); } line() {} setDrawColor() {} addPage() {} save(...args: unknown[]) { pdfSave(...args); } } }));
import { FinancialReportsPanel } from "./FinancialReportsPanel";

describe("FinancialReportsPanel", () => {
  afterEach(() => { cleanup(); reportQuery.mockClear(); pdfSave.mockClear(); pdfText.mockClear(); });
  it("applies company and fiscal-year filters to the export query", async () => {
    render(<FinancialReportsPanel />);
    fireEvent.change(screen.getByLabelText("الشركة"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("السنة المالية"), { target: { value: "9" } });
    expect(reportQuery).toHaveBeenLastCalledWith({ companyId: 1, fiscalYearId: 9 });
    expect(screen.getByRole("button", { name: "تنزيل CSV" })).toBeEnabled();
    const pdfButton = screen.getByRole("button", { name: "تنزيل PDF رسمي" });
    expect(pdfButton).toBeEnabled();
    fireEvent.click(pdfButton);
    await waitFor(() => expect(pdfSave).toHaveBeenCalledWith("trezo-financial-report-company-year.pdf"));
    expect(pdfText).toHaveBeenCalledWith("OFFICIAL / APPROVED REPORT", 14, 30);
    expect(pdfText).toHaveBeenCalledWith(expect.stringContaining("Scope: Company #1 | Fiscal year #9"), 14, 35);
    expect(pdfText).toHaveBeenCalledWith(expect.stringContaining("Approval status: System export audit recorded"), 14, 45);
    expect(screen.getByText("1 سجل جاهز للتصدير وفق التصفية الحالية.")).toBeInTheDocument();
  });
});
