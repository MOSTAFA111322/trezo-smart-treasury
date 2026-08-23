import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const emptyQuery = () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() });
const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, error: null });
const auditRows = [{ id: 1, action: "report.export.pdf", entityType: "financial_report", entityId: "1", createdAt: new Date("2026-08-18T12:00:00Z") }];

function trpcProxy(path: string[] = []): object {
  return new Proxy({}, {
    get: (_target, property) => {
      if (property === "useQuery") {
        return () => {
          const key = path.join(".");
          if (key === "dashboard.unified") return { data: { missingRates: ["USD"] }, isLoading: false, error: null, refetch: vi.fn() };
          if (key === "audit.list") return { data: auditRows, isLoading: false, error: null, refetch: vi.fn() };
          if (key === "permissions.list") return { data: { roleId: null, keys: [] }, isLoading: false, error: null, refetch: vi.fn() };
          return emptyQuery();
        };
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

  it("shows an explicit empty state when audit search has no matching rows", () => {
    render(<Workspace active="audit" onBack={vi.fn()} onCreateRequest={vi.fn()} />);
    expect(screen.getByText(/آخر العمليات المسجلة/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("إجراء التدقيق"), { target: { value: "report.export.pdf" } });
    fireEvent.change(screen.getByLabelText("من تاريخ التدقيق"), { target: { value: "2026-08-01" } });
    fireEvent.change(screen.getByLabelText("إلى تاريخ التدقيق"), { target: { value: "2026-08-31" } });
    expect(screen.getByLabelText("إجراء التدقيق")).toHaveValue("report.export.pdf");
    expect(screen.getByLabelText("من تاريخ التدقيق")).toHaveValue("2026-08-01");
    expect(screen.getByLabelText("إلى تاريخ التدقيق")).toHaveValue("2026-08-31");
    fireEvent.change(screen.getByLabelText("البحث في سجل التدقيق"), { target: { value: "لا يوجد هذا الحدث" } });
    expect(screen.getByText("لا توجد نتائج مطابقة للبحث أو المرشحات الحالية. جرّب توسيع الفترة أو اختيار كل الإجراءات.")).toBeInTheDocument();
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

  it("does not render the employee administration panel for a non-admin user", () => {
    render(<Workspace active="users" onBack={vi.fn()} onCreateRequest={vi.fn()} isAdmin={false} />);
    expect(screen.getByText("غير مفعّلة")).toBeInTheDocument();
    expect(screen.queryByText("الموظفون والحسابات")).not.toBeInTheDocument();
  });
});
