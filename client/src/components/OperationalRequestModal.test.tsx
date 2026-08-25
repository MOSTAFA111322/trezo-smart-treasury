import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  createDraft: vi.fn(),
  invalidateRequests: vi.fn(),
  invalidateSummary: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    entities: {
      companies: { list: { useQuery: () => ({ data: [{ id: 1, name: "شركة تجريبية" }] }) } },
      beneficiaries: { list: { useQuery: () => ({ data: [{ id: 2, name: "مستفيد تجريبي" }] }) } },
      channels: { list: { useQuery: () => ({ data: [{ id: 2, name: "صراف تجريبي", code: "CASHIER" }, { id: 3, name: "قناة بنك", code: "BANK" }] }) } },
      banks: { list: { useQuery: () => ({ data: [{ id: 7, name: "بنك تجريبي" }, { id: 8, name: "بنك ثانٍ" }] }) } },
      beneficiaryBankAccounts: { list: { useQuery: () => ({ data: [{ id: 4, bankId: 7, bankName: "بنك تجريبي", accountName: "الحساب التشغيلي", iban: "SA001" }] }) } },
    },
    settings: {
      fiscalYears: { useQuery: () => ({ data: [{ id: 5, year: 2026 }] }) },
      currencies: { useQuery: () => ({ data: [{ code: "SAR", nameAr: "ريال سعودي" }] }) },
    },
    requests: {
      createDraft: { useMutation: () => ({ mutate: mocks.createDraft, isPending: false }) },
    },
    useUtils: () => ({
      requests: { list: { invalidate: mocks.invalidateRequests } },
      dashboard: { summary: { invalidate: mocks.invalidateSummary } },
    }),
  },
}));

import { OperationalRequestModal } from "./OperationalRequestModal";

describe("OperationalRequestModal", () => {
  beforeEach(() => {
    mocks.createDraft.mockReset();
    mocks.invalidateRequests.mockReset();
    mocks.invalidateSummary.mockReset();
  });

  afterEach(cleanup);

  it("displays the amount-in-words preview and validates the bank-account requirement", async () => {
    const user = userEvent.setup();
    render(<OperationalRequestModal onClose={vi.fn()} onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText(/وصف الطلب/), "مستحقات مورد");
    await user.type(screen.getByLabelText(/المبلغ/), "200");
    await user.selectOptions(screen.getByLabelText(/العملة/), "SAR");
    await user.selectOptions(screen.getByLabelText(/الشركة/), "1");
    await user.selectOptions(screen.getByLabelText(/المستفيد/), "2");
    await user.selectOptions(screen.getByLabelText(/نوع جهة الصرف/), "bank");
    await user.selectOptions(screen.getByLabelText(/قناة الصرف/), "3");
    await user.selectOptions(screen.getByLabelText(/السنة المالية/), "5");

    expect(screen.getByText(/مائتان ريال سعودي/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /إنشاء المسودة/ }));

    expect(screen.getByRole("alert")).toHaveTextContent("قناة البنك تتطلب حساباً بنكياً مرتبطاً بالمستفيد");
    expect(mocks.createDraft).not.toHaveBeenCalled();
  });

  it("shows both payout types and switches the channel list to bank", async () => {
    const user = userEvent.setup();
    render(<OperationalRequestModal onClose={vi.fn()} onCreated={vi.fn()} />);

    expect(screen.getByRole("option", { name: "صراف" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "بنك" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/نوع جهة الصرف/), "bank");
    expect(screen.getByRole("option", { name: "قناة بنك" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "صراف تجريبي" })).not.toBeInTheDocument();
  });

  it("shows the selected bank separately and filters the beneficiary account list", async () => {
    const user = userEvent.setup();
    render(<OperationalRequestModal onClose={vi.fn()} onCreated={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText(/نوع جهة الصرف/), "bank");
    await user.selectOptions(screen.getByLabelText(/^البنك/), "7");

    expect(screen.getByRole("option", { name: "بنك تجريبي" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "بنك تجريبي — الحساب التشغيلي — SA001" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /بنك ثانٍ —/ })).not.toBeInTheDocument();
  });

  it("keeps a cashier request independent from bank and bank-account fields", async () => {
    const user = userEvent.setup();
    render(<OperationalRequestModal onClose={vi.fn()} onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText(/وصف الطلب/), "صرف نقدي");
    await user.type(screen.getByLabelText(/المبلغ/), "125");
    await user.selectOptions(screen.getByLabelText(/الشركة/), "1");
    await user.selectOptions(screen.getByLabelText(/المستفيد/), "2");
    await user.selectOptions(screen.getByLabelText(/نوع جهة الصرف/), "cashier");
    await user.selectOptions(screen.getByLabelText(/قناة الصرف/), "2");
    await user.selectOptions(screen.getByLabelText(/السنة المالية/), "5");
    await user.click(screen.getByRole("button", { name: /إنشاء المسودة/ }));

    expect(mocks.createDraft).toHaveBeenCalledWith(expect.objectContaining({ channelId: 2, bankAccountId: undefined }));
  });

  it("submits a complete bank-channel request only after an account is selected", async () => {
    const user = userEvent.setup();
    render(<OperationalRequestModal onClose={vi.fn()} onCreated={vi.fn()} />);

    await user.type(screen.getByLabelText(/وصف الطلب/), "مستحقات مورد");
    await user.type(screen.getByLabelText(/المبلغ/), "125");
    await user.selectOptions(screen.getByLabelText(/الشركة/), "1");
    await user.selectOptions(screen.getByLabelText(/المستفيد/), "2");
    await user.selectOptions(screen.getByLabelText(/نوع جهة الصرف/), "bank");
    await user.selectOptions(screen.getByLabelText(/قناة الصرف/), "3");
    await user.selectOptions(screen.getByLabelText(/السنة المالية/), "5");
    await user.selectOptions(screen.getByLabelText(/^البنك/), "7");
    await user.selectOptions(screen.getByLabelText(/الحساب البنكي/), "4");
    await user.click(screen.getByRole("button", { name: /إنشاء المسودة/ }));

    expect(mocks.createDraft).toHaveBeenCalledWith({
      title: "مستحقات مورد",
      amount: 125,
      currency: "YER",
      companyId: 1,
      beneficiaryId: 2,
      bankAccountId: 4,
      channelId: 3,
      fiscalYearId: 5,
    });
  });
});
