import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const invalidate = vi.fn().mockResolvedValue(undefined);
const mutate = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ requests: { list: { invalidate } } }),
    requests: {
      workflow: { useQuery: () => ({ data: [] }) },
      update: {
        useMutation: (options: { onSuccess: () => Promise<void>; onError: (error: Error) => void }) => {
          mutate.mockImplementation(async () => options.onSuccess());
          return { mutate, isPending: false };
        },
      },
    },
    entities: {
      companies: { list: { useQuery: () => ({ data: [{ id: 3, name: "جهة تجريبية", legalName: "الجهة التجريبية الرسمية" }] }) } },
      beneficiaries: { list: { useQuery: () => ({ data: [{ id: 1, name: "مستفيد تجريبي", phone: "777000000" }] }) } },
      beneficiaryBankAccounts: { list: { useQuery: () => ({ data: [] }) } },
      channels: { list: { useQuery: () => ({ data: [{ id: 1, name: "صراف" }] }) } },
    },
    settings: { fiscalYears: { useQuery: () => ({ data: [{ id: 1, label: "2026" }] }) } },
  },
}));

import { RequestDetailPanel } from "./RequestDetailPanel";

describe("RequestDetailPanel save", () => {
  afterEach(() => {
    cleanup();
    invalidate.mockClear();
    mutate.mockClear();
  });

  it("opens the request selected by the parent workspace", () => {
    render(<RequestDetailPanel rows={[{ id: 7, referenceNumber: "TRZ-00007", title: "طلب مفتوح من البطاقة", description: "وصف", amount: "100", currency: "YER", beneficiaryId: 1, companyId: 3, bankAccountId: null, channelId: 1, fiscalYearId: 1, status: "draft" }]} currencies={[{ code: "YER", nameAr: "ريال يمني", decimals: 2 }]} selectedRequestId={7} onSelectedRequestIdChange={vi.fn()} />);
    expect(screen.getByText("TRZ-00007 · الحالة: مسودة")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "تعديل الطلب" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "رسمي" })).toBeInTheDocument();
  });

  it("keeps edit unavailable for an executed request while retaining print actions", () => {
    render(<RequestDetailPanel rows={[{ id: 8, referenceNumber: "TRZ-00008", title: "طلب منفذ", description: "وصف", amount: "100", currency: "YER", beneficiaryId: 1, companyId: 3, bankAccountId: null, channelId: 1, fiscalYearId: 1, status: "executed" }]} currencies={[{ code: "YER", nameAr: "ريال يمني", decimals: 2 }]} selectedRequestId={8} onSelectedRequestIdChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "تعديل الطلب" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "رسمي" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "أرشيف داخلي" })).toBeInTheDocument();
  });

  it("writes a complete print document instead of leaving a blank popup", () => {
    const write = vi.fn();
    const popup = { opener: window, document: { open: vi.fn(), write, close: vi.fn() }, focus: vi.fn() } as unknown as Window;
    vi.stubGlobal("open", vi.fn(() => popup));
    render(<RequestDetailPanel rows={[{ id: 9, referenceNumber: "TRZ-00009", title: "طلب للطباعة", description: "وصف الطباعة", amount: "250", currency: "YER", beneficiaryId: 1, companyId: 3, bankAccountId: null, channelId: 1, fiscalYearId: 1, status: "draft" }]} currencies={[{ code: "YER", nameAr: "ريال يمني", decimals: 2 }]} selectedRequestId={9} onSelectedRequestIdChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "رسمي" }));
    expect(popup.document.open).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(String(write.mock.calls[0][0])).toContain("<!doctype html>");
    expect(String(write.mock.calls[0][0])).toContain("TRZ-00009");
    expect(popup.document.close).toHaveBeenCalledTimes(1);
    expect(popup.focus).toHaveBeenCalledTimes(1);
  });

  it("refreshes the request list after a successful edit", async () => {
    render(<RequestDetailPanel rows={[{ id: 7, referenceNumber: "TRZ-00007", title: "طلب قديم", description: "وصف", amount: "100", currency: "YER", beneficiaryId: 1, companyId: 3, bankAccountId: null, channelId: 1, fiscalYearId: 1, status: "draft" }]} currencies={[{ code: "YER", nameAr: "ريال يمني", decimals: 2 }]} />);
    fireEvent.change(screen.getByRole("combobox", { name: "اختيار طلب للتفاصيل" }), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "تعديل الطلب" }));
    fireEvent.change(screen.getByPlaceholderText("بيان الطلب"), { target: { value: "طلب معدل" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ التعديل" }));
    await vi.waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("تم حفظ تعديل الطلب وتحديث البيانات بنجاح.")).toBeInTheDocument();
  });
});
