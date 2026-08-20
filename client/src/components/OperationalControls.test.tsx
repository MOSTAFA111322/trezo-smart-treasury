import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { proxy } = vi.hoisted(() => ({ proxy: (path: string[] = []): object => new Proxy({}, { get: (_target, property) => {
  if (property === "useQuery") return () => path.join(".") === "overdueAlerts.history" ? { data: [{ id: 1, status: "failed", attempts: 2, requestCount: 2, deliveryDate: "2026-08-19", lastError: "تعذر الاتصال", lastAttemptAt: new Date("2026-08-19T09:00:00Z") }], isLoading: false, error: null, refetch: vi.fn() } : path.join(".") === "settings.exchangeRates" ? { data: [{ id: 1, approvalStatus: "pending", baseCurrency: "USD", quoteCurrency: "YER", rate: "2450", effectiveAt: new Date(), source: "يدوي" }, { id: 2, approvalStatus: "approved", baseCurrency: "EUR", quoteCurrency: "YER", rate: "2800", effectiveAt: new Date(), source: "يدوي" }, { id: 3, approvalStatus: "rejected", baseCurrency: "SAR", quoteCurrency: "YER", rate: "650", effectiveAt: new Date(), source: "يدوي" }], isLoading: false, error: null } : { data: { isEnabled: true, scheduleCronTaskUid: "schedule-1" }, isLoading: false, error: null, refetch: vi.fn() };
  if (property === "useMutation") return () => ({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({ success: true }), isPending: false });
  if (property === "useUtils") return () => ({ settings: { exchangeRates: { invalidate: vi.fn() } } });
  if (property === "invalidate") return vi.fn();
  return proxy([...path, String(property)]);
} }) }));
vi.mock("@/lib/trpc", () => ({ trpc: proxy() }));
import { OverdueAlertsCard } from "./OverdueAlertsCard";
import { ExchangeRatesPanel } from "./ExchangeRatesPanel";

describe("operational control summaries", () => {
  afterEach(() => cleanup());
  it("shows notification health counts and failure rate", () => {
    render(<OverdueAlertsCard />);
    expect(screen.getByText("إجمالي التشغيلات")).toBeInTheDocument();
    expect(screen.getByText("ناجحة")).toBeInTheDocument();
    expect(screen.getByText(/100%/)).toBeInTheDocument();
    expect(screen.getByText("يتطلب إجراءً فورياً من المسؤول")).toBeInTheDocument();
  });
  it("shows an internal intervention alert for failed overdue notification deliveries", () => {
    render(<OverdueAlertsCard />);
    expect(screen.getByText("يتطلب التنبيه اليومي تدخلاً")).toBeInTheDocument();
    expect(screen.getByText(/يوجد 1 تشغيل فاشل/)).toBeInTheDocument();
  });
  it("shows pending, approved, and rejected exchange-rate totals", () => {
    render(<ExchangeRatesPanel />);
    expect(screen.getAllByText("بانتظار اعتماد ثانٍ").length).toBeGreaterThan(0);
    expect(screen.getByText("· يتطلب إجراءً")).toBeInTheDocument();
    expect(screen.getByText("معتمدة ونشطة")).toBeInTheDocument();
    expect(screen.getByText("مرفوضة")).toBeInTheDocument();
  });
});
