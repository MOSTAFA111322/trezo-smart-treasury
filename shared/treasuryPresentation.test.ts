import { describe, expect, it } from "vitest";
import {
  getRequestStatusPresentation,
  getNextWorkflowActor,
  getWorkflowAction,
  MAX_ATTACHMENT_BYTES,
  totalAmountsByCurrency,
  validateDraftRequest,
  validateTreasuryAttachment,
} from "./treasuryPresentation";

describe("treasury presentation helpers", () => {
  it("maps request statuses and only exposes valid next workflow actions", () => {
    expect(getRequestStatusPresentation("review")).toMatchObject({ label: "قيد المراجعة", tone: "warning" });
    expect(getRequestStatusPresentation("unknown")).toMatchObject({ label: "unknown", tone: "neutral" });
    expect(getWorkflowAction("draft")).toEqual({ label: "إرسال للمراجعة", toStatus: "review" });
    expect(getWorkflowAction("executed")).toBeUndefined();
    expect(getNextWorkflowActor("review")).toEqual({ role: "المراجع", action: "مراجعة واعتماد الطلب" });
    expect(getNextWorkflowActor("approved")).toEqual({ role: "المدير العام", action: "تسجيل تنفيذ الطلب" });
    expect(getNextWorkflowActor("executed")).toEqual({ role: "المدقق", action: "إجراء التدقيق اللاحق" });
  });

  it("rejects incomplete draft requests before they reach the server", () => {
    const base = { title: "دفعة خدمات", amount: "1250", companyId: "1", beneficiaryId: "2", channelId: "3", fiscalYearId: "4" };
    expect(validateDraftRequest(base)).toBeUndefined();
    expect(validateDraftRequest({ ...base, title: "أ" })).toContain("ثلاثة");
    expect(validateDraftRequest({ ...base, amount: "0" })).toContain("أكبر من صفر");
    expect(validateDraftRequest({ ...base, beneficiaryId: "" })).toContain("المستفيد");
  });

  it("applies predictable attachment safety checks on the client", () => {
    expect(validateTreasuryAttachment({ name: "invoice.pdf", size: 1200 })).toBeUndefined();
    expect(validateTreasuryAttachment({ name: "archive.zip", size: 1200 })).toContain("غير مدعومة");
    expect(validateTreasuryAttachment({ name: "invoice.pdf", size: 0 })).toContain("فارغ");
    expect(validateTreasuryAttachment({ name: "invoice.pdf", size: MAX_ATTACHMENT_BYTES + 1 })).toContain("8 ميجابايت");
  });

  it("keeps multi-currency totals separate instead of assigning them a false base currency", () => {
    expect(totalAmountsByCurrency([
      { amount: "150", currency: "SAR" },
      { amount: "25", currency: "USD" },
      { amount: "50", currency: "SAR" },
    ])).toEqual({ SAR: 200, USD: 25 });
  });
});
