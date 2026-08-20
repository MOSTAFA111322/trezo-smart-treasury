import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { logExport } = vi.hoisted(() => ({ logExport: vi.fn().mockResolvedValue({ success: true }) }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    audit: { logExport: { useMutation: () => ({ mutateAsync: logExport, isPending: false, error: null }) } },
  },
}));

import { AuditTrailPanel } from "./AuditTrailPanel";

const rows = Array.from({ length: 21 }, (_, index) => ({
  id: index + 1,
  action: index === 20 ? "report.export.csv" : "request.create",
  entityType: "request",
  entityId: String(index + 1),
  createdAt: new Date("2026-08-20T09:00:00Z"),
}));

describe("AuditTrailPanel", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("paginates rows and exposes the next page", () => {
    render(<AuditTrailPanel rows={rows} isLoading={false} error={null} onRetry={vi.fn()} action="" from="" to="" onActionChange={vi.fn()} onFromChange={vi.fn()} onToChange={vi.fn()} />);
    expect(screen.getByText("صفحة 1 من 2")).toBeInTheDocument();
    expect(screen.getAllByText("request.create").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByLabelText("الصفحة التالية"));
    expect(screen.getByText("صفحة 2 من 2")).toBeInTheDocument();
    expect(screen.getByText("report.export.csv")).toBeInTheDocument();
  });

  it("logs an audit export before downloading CSV", async () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: vi.fn(() => "blob:test") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: vi.fn() });
    const createObjectURL = URL.createObjectURL as unknown as ReturnType<typeof vi.fn>;
    const revokeObjectURL = URL.revokeObjectURL as unknown as ReturnType<typeof vi.fn>;
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    render(<AuditTrailPanel rows={rows.slice(0, 1)} isLoading={false} error={null} onRetry={vi.fn()} action="" from="" to="" onActionChange={vi.fn()} onFromChange={vi.fn()} onToChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "تصدير سجل التدقيق CSV" }));
    await waitFor(() => expect(logExport).toHaveBeenCalledWith({ recordCount: 1, filters: { search: undefined } }));
    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: originalCreateObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: originalRevokeObjectURL });
    click.mockRestore();
  });
});
