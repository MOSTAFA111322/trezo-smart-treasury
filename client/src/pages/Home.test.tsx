import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  logout: vi.fn(),
  toggleTheme: vi.fn(),
  auth: { user: { name: "سارة أحمد" } as { name: string } | null, loading: false, isAuthenticated: true },
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ ...mocks.auth, logout: mocks.logout }),
}));

vi.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: mocks.toggleTheme }),
}));

vi.mock("@/components/OperationalInbox", () => ({ OperationalInbox: () => <div data-testid="operational-inbox" /> }));
vi.mock("@/components/OperationalRequestModal", () => ({ OperationalRequestModal: () => <div data-testid="request-modal" /> }));
vi.mock("@/pages/Workspace", () => ({ default: () => <div data-testid="workspace" /> }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    dashboard: {
      summary: { useQuery: () => ({ data: { total: 250, pending: 1, byCurrency: [{ currency: "SAR", total: 200 }, { currency: "USD", total: 50 }] } }) },
      unified: { useQuery: () => ({ data: { total: null, missingRates: ["USD"] } }) },
    },
    requests: {
      list: { useQuery: () => ({ data: [{ id: 1, title: "طلب متعدد العملات", referenceNumber: "TRZ-001", amount: 200, currency: "SAR", status: "review", updatedAt: new Date(), scheduledFor: null }], isLoading: false, isError: false }) },
    },
    settings: { currencies: { useQuery: () => ({ data: [] }) } },
    audit: { list: { useQuery: () => ({ data: [] }) } },
  },
}));

import Home from "./Home";

describe("Home dashboard", () => {
  afterEach(() => { cleanup(); mocks.auth.user = { name: "سارة أحمد" }; mocks.auth.isAuthenticated = true; window.history.replaceState({}, "", "/"); });

  it("does not show a false unified total when a currency conversion rate is missing", () => {
    render(<Home />);

    expect(screen.getByText("غير مكتمل")).toBeInTheDocument();
    expect(screen.getByText(/أسعار مفقودة: USD/)).toBeInTheDocument();
    expect(screen.getByText("طلب متعدد العملات")).toBeInTheDocument();
  });

  it("shows a login gate and does not render protected workspace when unauthenticated", () => {
    mocks.auth.user = null;
    mocks.auth.isAuthenticated = false;

    render(<Home />);

    expect(screen.getByRole("button", { name: "تسجيل الدخول" })).toBeInTheDocument();
    expect(screen.queryByTestId("workspace")).not.toBeInTheDocument();
  });

  it("opens exchange-rate settings directly from an incomplete unified total", () => {
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: "إعداد أسعار الصرف الناقصة" }));

    expect(screen.getByTestId("workspace")).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get("missingCurrency")).toBe("USD");
  });

});
