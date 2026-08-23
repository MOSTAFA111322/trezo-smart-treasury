export const REQUEST_STATUS_PRESENTATION = {
  draft: { label: "مسودة", tone: "neutral" },
  review: { label: "قيد المراجعة", tone: "warning" },
  approved: { label: "معتمد", tone: "info" },
  executed: { label: "منفذ", tone: "success" },
  rejected: { label: "مرفوض", tone: "danger" },
} as const;

export type TreasuryStatus = keyof typeof REQUEST_STATUS_PRESENTATION;

export function getRequestStatusPresentation(status: string) {
  return REQUEST_STATUS_PRESENTATION[status as TreasuryStatus] ?? { label: status || "غير محدد", tone: "neutral" as const };
}

export function getWorkflowAction(status: string) {
  const actions: Record<string, { label: string; toStatus: TreasuryStatus } | undefined> = {
    draft: { label: "إرسال للمراجعة", toStatus: "review" },
    review: { label: "اعتماد الطلب", toStatus: "approved" },
    approved: { label: "تسجيل التنفيذ", toStatus: "executed" },
    rejected: { label: "إعادة فتح المسودة", toStatus: "draft" },
  };
  return actions[status];
}

export function getNextWorkflowActor(status: string) {
  const actors: Record<string, { role: string; action: string } | undefined> = {
    draft: { role: "المحاسب", action: "إرسال الطلب للمراجعة" },
    review: { role: "المراجع", action: "مراجعة واعتماد الطلب" },
    approved: { role: "المدير العام", action: "تسجيل تنفيذ الطلب" },
    executed: { role: "المدقق", action: "إجراء التدقيق اللاحق" },
    rejected: { role: "المحاسب", action: "تصحيح الطلب وإعادة فتحه" },
  };
  return actors[status];
}

export function validateDraftRequest(input: {
  title: string;
  amount: string;
  companyId: string;
  beneficiaryId: string;
  channelId: string;
  fiscalYearId: string;
}) {
  if (input.title.trim().length < 3) return "أدخل وصفاً واضحاً للطلب لا يقل عن ثلاثة أحرف.";
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return "أدخل مبلغاً صحيحاً أكبر من صفر.";
  if (!input.companyId) return "اختر الشركة المرتبطة بطلب الصرف.";
  if (!input.beneficiaryId) return "اختر المستفيد من طلب الصرف.";
  if (!input.channelId) return "اختر قناة الصرف.";
  if (!input.fiscalYearId) return "اختر السنة المالية.";
  return undefined;
}

export const MAX_ATTACHMENT_BYTES = 8_000_000;
const ALLOWED_ATTACHMENT_EXTENSIONS = new Set(["pdf", "png", "jpg", "jpeg", "xlsx", "doc", "docx"]);

export function validateTreasuryAttachment(file: { name: string; size: number }) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_ATTACHMENT_EXTENSIONS.has(extension)) return "صيغة الملف غير مدعومة. استخدم PDF أو صورة أو مستند Office.";
  if (file.size <= 0) return "الملف المحدد فارغ.";
  if (file.size > MAX_ATTACHMENT_BYTES) return "حجم الملف يتجاوز الحد الأقصى المسموح، وهو 8 ميجابايت.";
  return undefined;
}

export function formatTreasuryAmount(amount: number | string, currency: string) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency: currency || "SAR",
    maximumFractionDigits: 2,
  }).format(value);
}

export function totalAmountsByCurrency(rows: Array<{ amount: number | string; currency: string }>) {
  return rows.reduce<Record<string, number>>((result, row) => {
    const value = Number(row.amount);
    if (Number.isFinite(value) && row.currency) result[row.currency] = (result[row.currency] ?? 0) + value;
    return result;
  }, {});
}
