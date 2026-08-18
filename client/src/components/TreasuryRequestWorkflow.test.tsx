import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  transition: vi.fn(),
  upload: vi.fn(),
  invalidateRequests: vi.fn(),
  invalidateSummary: vi.fn(),
  refetchAttachments: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    attachments: {
      list: { useQuery: () => ({ data: [], isLoading: false, error: null, refetch: mocks.refetchAttachments }) },
      upload: { useMutation: () => ({ mutate: mocks.upload, isPending: false }) },
      download: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
    },
    requests: {
      transition: { useMutation: () => ({ mutate: mocks.transition, isPending: false }) },
    },
    useUtils: () => ({
      requests: { list: { invalidate: mocks.invalidateRequests } },
      dashboard: { summary: { invalidate: mocks.invalidateSummary } },
    }),
  },
}));

import TreasuryRequestWorkflow from "./TreasuryRequestWorkflow";

const draftRequest = {
  id: 7,
  referenceNumber: "TRZ-00007",
  title: "استحقاق مورد",
  amount: "500",
  currency: "SAR",
  status: "draft",
};

describe("TreasuryRequestWorkflow", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  afterEach(cleanup);

  it("offers an actionable create-request call to action when no requests exist", async () => {
    const user = userEvent.setup();
    const onCreateRequest = vi.fn();
    render(<TreasuryRequestWorkflow rows={[]} onCreateRequest={onCreateRequest} />);

    expect(screen.getByText(/لا توجد طلبات صرف بعد/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "إنشاء طلب صرف" }));

    expect(onCreateRequest).toHaveBeenCalledOnce();
  });

  it("requires an explicit confirmation before sending a draft to review", async () => {
    const user = userEvent.setup();
    render(<TreasuryRequestWorkflow rows={[draftRequest]} />);

    await user.click(screen.getByRole("button", { name: "إرسال للمراجعة" }));
    expect(screen.getByText(/تأكيد الإجراء: إرسال للمراجعة/)).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/أضف سبباً أو ملاحظة/), "مستندات المورد مكتملة");
    await user.click(screen.getByRole("button", { name: "تأكيد الإجراء" }));

    expect(mocks.transition).toHaveBeenCalledWith({
      requestId: 7,
      toStatus: "review",
      comment: "مستندات المورد مكتملة",
    });
  });

  it("shows a clear attachment validation message and blocks an unsupported upload", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<TreasuryRequestWorkflow rows={[draftRequest]} />);

    await user.click(screen.getByRole("button", { name: "المرفقات" }));
    const file = new File(["payload"], "payload.exe", { type: "application/octet-stream" });
    await user.upload(screen.getByLabelText("اختيار مرفق"), file);
    await user.click(screen.getByRole("button", { name: "رفع المرفق" }));

    expect(screen.getByRole("status")).toHaveTextContent("صيغة الملف غير مدعومة");
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
