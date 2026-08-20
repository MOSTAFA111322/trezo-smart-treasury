import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const emptyQuery = () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() });
const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, error: null });

function trpcProxy(path: string[] = []): object {
  return new Proxy({}, {
    get: (_target, property) => {
      if (property === "useQuery") {
        return () => path.join(".") === "dashboard.unified"
          ? { data: { missingRates: ["USD"] }, isLoading: false, error: null, refetch: vi.fn() }
          : emptyQuery();
      }
      if (property === "useMutation") return mutation;
      if (property === "useUtils") return () => ({ requests: { list: { invalidate: vi.fn() } } });
      return trpcProxy([...path, String(property)]);
    },
  });
}

vi.mock("@/lib/trpc", () => ({ trpc: trpcProxy() }));

import Workspace from "./Workspace";

describe("Workspace exchange-rate readiness", () => {
  afterEach(cleanup);

  it("guides the user to the missing pair and pre-fills the exchange-rate form", () => {
    render(<Workspace active="settings" onBack={vi.fn()} onCreateRequest={vi.fn()} />);

    expect(screen.getByText("الإجمالي الموحد يحتاج أسعار صرف معتمدة")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "إعداد USD ← YER" }));

    expect(screen.getByLabelText("عملة الأساس")).toHaveValue("USD");
    expect(screen.getByLabelText("عملة التسعير")).toHaveValue("YER");
  });

  it("requires a manual attribution before enabling exchange-rate saving and shows owner alerts", () => {
    render(<Workspace active="settings" onBack={vi.fn()} onCreateRequest={vi.fn()} />);

    expect(screen.getByLabelText("مصدر سعر الصرف")).toHaveValue("إدخال يدوي");
    expect(screen.getByText("تنبيه الطلبات المتأخرة")).toBeInTheDocument();
    expect(screen.getByLabelText("ملاحظة اعتماد سعر الصرف")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("سعر الصرف"), { target: { value: "1.25" } });
    fireEvent.change(screen.getByLabelText("مصدر سعر الصرف"), { target: { value: " " } });
    expect(screen.getByRole("button", { name: "حفظ سعر الصرف واعتماده من مستخدم ثانٍ" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("مصدر سعر الصرف"), { target: { value: "اعتماد لجنة الخزينة" } });
    expect(screen.getByRole("button", { name: "حفظ سعر الصرف واعتماده من مستخدم ثانٍ" })).toBeEnabled();
  });
});
