import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  Building2,
  Clipboard,
  ClipboardList,
  FileText,
  Pencil,
  ReceiptText,
  Save,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { CurrencyDefinition } from "@/lib/format";
import {
  getRequestStatusPresentation,
  validateDraftRequest,
  validatePayoutChannel,
} from "@shared/treasuryPresentation";

export type RequestRecord = {
  id: number;
  referenceNumber: string;
  title: string;
  description?: string | null;
  amount: string | number;
  currency: string;
  beneficiaryId: number;
  companyId: number;
  bankAccountId?: number | null;
  channelId: number;
  fiscalYearId: number;
  scheduledFor?: Date | null;
  createdAt?: Date;
  status: string;
  approvalStages?: string[];
  reviewerConfirmed?: boolean;
};

function getRequestWorkflowSummary(request: RequestRecord) {
  const stages = new Set(
    request.approvalStages ?? ["accountant", "reviewer", "cfo", "gm", "auditor"]
  );
  if (request.status === "draft") {
    return {
      completed: "السند محفوظ كمسودة ولم يُرسل بعد إلى مسار الاعتماد.",
      next: "المحاسب — إرسال للمراجعة",
    };
  }
  if (request.status === "review") {
    if (stages.has("reviewer") && !request.reviewerConfirmed) {
      return {
        completed: "تم إرسال السند إلى مرحلة المراجعة.",
        next: "المراجع — تأكيد المراجعة",
      };
    }
    return {
      completed: stages.has("reviewer")
        ? "اكتملت مراجعة المراجع وسُجلت في مسار السند."
        : "لا تتضمن سياسة السند مرحلة مراجع منفصلة.",
      next: stages.has("cfo")
        ? "المدير المالي — اعتماد المدير المالي"
        : "تستلزم السياسة المعتمدة معالجة المرحلة التالية.",
    };
  }
  if (request.status === "approved") {
    return {
      completed: "اكتمل اعتماد المدير المالي للسند.",
      next: stages.has("gm")
        ? "المدير العام — تسجيل التنفيذ"
        : "المدير المالي — تسجيل التنفيذ المفوض",
    };
  }
  if (request.status === "rejected") {
    return {
      completed: "تم إرجاع السند من مسار الاعتماد ويحتاج معالجة قبل إعادة إرساله.",
      next: "المحاسب أو المراجع — إعادة فتح المسودة",
    };
  }
  return {
    completed: "اكتملت الإجراءات المسجلة لهذا الطلب.",
    next: undefined,
  };
}

type Props = {
  rows: RequestRecord[];
  currencies: Array<CurrencyDefinition & { nameAr?: string }>;
  selectedRequestId?: number;
  onSelectedRequestIdChange?: (requestId: number | undefined) => void;
};

export function RequestDetailPanel({
  rows,
  currencies,
  selectedRequestId: controlledSelectedId,
  onSelectedRequestIdChange,
}: Props) {
  const [internalSelectedId, setInternalSelectedId] = useState<number>();
  const isControlled =
    controlledSelectedId !== undefined ||
    onSelectedRequestIdChange !== undefined;
  const selectedId = isControlled ? controlledSelectedId : internalSelectedId;
  const setSelectedId = (requestId: number | undefined) => {
    if (!isControlled) setInternalSelectedId(requestId);
    onSelectedRequestIdChange?.(requestId);
  };
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [copyLabel, setCopyLabel] = useState("نسخ الرقم المرجعي");
  const selected = useMemo(
    () => rows.find(row => row.id === selectedId),
    [rows, selectedId]
  );
  const [form, setForm] = useState({
    title: "",
    description: "",
    amount: "",
    currency: "YER",
    beneficiaryId: "",
    bankAccountId: "",
    channelId: "",
    fiscalYearId: "",
    scheduledFor: "",
  });
  const companies = trpc.entities.companies.list.useQuery(undefined, {
    enabled: Boolean(selected),
  });
  const beneficiaries = trpc.entities.beneficiaries.list.useQuery(undefined, {
    enabled: Boolean(selected),
  });
  const bankAccounts = trpc.entities.beneficiaryBankAccounts.list.useQuery(
    { beneficiaryId: Number(form.beneficiaryId) },
    { enabled: Boolean(selected) && editing && Boolean(form.beneficiaryId) }
  );
  const previewBankAccounts =
    trpc.entities.beneficiaryBankAccounts.list.useQuery(
      { beneficiaryId: selected?.beneficiaryId ?? 0 },
      { enabled: Boolean(selected) }
    );
  const workflow = trpc.requests.workflow.useQuery(
    { requestId: selected?.id ?? 0 },
    { enabled: Boolean(selected) }
  );
  const channels = trpc.entities.channels.list.useQuery(undefined, {
    enabled: Boolean(selected),
  });
  const fiscalYears = trpc.settings.fiscalYears.useQuery(undefined, {
    enabled: Boolean(selected) && editing,
  });
  const utils = trpc.useUtils();
  const update = trpc.requests.update.useMutation({
    onSuccess: async () => {
      await utils.requests.list.invalidate();
      setMessage("تم حفظ تعديل الطلب وتحديث البيانات بنجاح.");
      setEditing(false);
    },
    onError: error => setMessage(`تعذر تعديل الطلب: ${error.message}`),
  });

  useEffect(() => {
    if (!selected) return;
    setForm({
      title: selected.title,
      description: selected.description ?? "",
      amount: String(selected.amount),
      currency: selected.currency,
      beneficiaryId: String(selected.beneficiaryId),
      bankAccountId: selected.bankAccountId
        ? String(selected.bankAccountId)
        : "",
      channelId: String(selected.channelId),
      fiscalYearId: String(selected.fiscalYearId),
      scheduledFor: selected.scheduledFor
        ? new Date(selected.scheduledFor).toISOString().slice(0, 16)
        : "",
    });
    setMessage("");
  }, [selected]);

  const canEdit =
    selected && (selected.status === "draft" || selected.status === "rejected");
  const statusPresentation = selected
    ? getRequestStatusPresentation(selected.status)
    : undefined;
  const workflowSummary = selected
    ? getRequestWorkflowSummary(selected)
    : undefined;
  const editingChannel = (channels.data ?? []).find(
    item => String(item.id) === form.channelId
  );
  const editingIsBank = Boolean(
    editingChannel &&
      (editingChannel.code?.toLowerCase().includes("bank") ||
        editingChannel.name.includes("بنك"))
  );
  const copyReference = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.referenceNumber);
      setCopyLabel("تم نسخ الرقم");
      window.setTimeout(() => setCopyLabel("نسخ الرقم المرجعي"), 1800);
    } catch {
      setMessage("تعذر نسخ الرقم المرجعي؛ انسخه يدوياً من تفاصيل الطلب.");
    }
  };
  const printSelected = (kind: "order" | "receipt" | "report" | "archive") => {
    if (!selected) return;
    const popup = window.open("about:blank", "_blank", "width=900,height=800");
    if (!popup) {
      setMessage(
        "تعذر فتح نافذة المعاينة؛ اسمح بالنوافذ المنبثقة ثم أعد المحاولة."
      );
      return;
    }
    popup.document.open();
    const escapeHtml = (value: string) =>
      value.replace(
        /[&<>\\\"']/g,
        character =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '\\"': "&quot;",
            "'": "&#039;",
          })[character] ?? character
      );
    const beneficiary = beneficiaries.data?.find(
      item => item.id === selected.beneficiaryId
    );
    const company = companies.data?.find(
      item => item.id === selected.companyId
    );
    const companyName = company?.name ?? "—";
    const companyLegalName = company?.legalName ?? companyName;
    const companyTaxNumber = company?.taxNumber ?? "غير مسجل";
    const companyPhone = company?.phone ?? "غير مسجل";
    const companyAddress = company?.address ?? "غير مسجل";
    const companyLogoUrl = company?.logoUrl;
    const beneficiaryName = beneficiary?.name ?? "—";
    const beneficiaryPhone = beneficiary?.phone ?? "غير مسجل";
    const channelName =
      channels.data?.find(item => item.id === selected.channelId)?.name ?? "—";
    const bankAccount = previewBankAccounts.data?.find(
      item => item.id === selected.bankAccountId
    );
    const bankAccountLabel = bankAccount
      ? `${bankAccount.bankName} — ${bankAccount.accountName}${bankAccount.iban ? ` — ${bankAccount.iban}` : ""}`
      : "غير مرتبط";
    const date = selected.scheduledFor
      ? new Date(selected.scheduledFor).toLocaleString("ar-SA")
      : "غير محدد";
    const amount = `${escapeHtml(String(selected.amount))} ${escapeHtml(selected.currency)}`;
    const status = escapeHtml(statusPresentation?.label ?? selected.status);
    const fields = {
      reference: escapeHtml(selected.referenceNumber),
      title: escapeHtml(selected.title),
      description: escapeHtml(selected.description ?? "—"),
      company: escapeHtml(companyName),
      legalName: escapeHtml(companyLegalName),
      tax: escapeHtml(companyTaxNumber),
      phone: escapeHtml(companyPhone),
      address: escapeHtml(companyAddress),
      beneficiary: escapeHtml(beneficiaryName),
      beneficiaryPhone: escapeHtml(beneficiaryPhone),
      channel: escapeHtml(channelName),
      bank: escapeHtml(bankAccountLabel),
      date,
      amount,
      status,
    };
    const isArchive = kind === "archive";
    const heading =
      kind === "order"
        ? "أمر صرف رسمي"
        : kind === "receipt"
          ? "سند صرف حديث"
          : kind === "report"
            ? "سند صرف مختصر"
            : "بطاقة أرشفة داخلية";
    const title = `${heading} ${selected.referenceNumber}`;
    const base = `<div class="sheet"><header class="brand">${companyLogoUrl ? `<img class="logo" src="${escapeHtml(companyLogoUrl)}" alt="شعار ${fields.company}"/>` : ""}<h1>${heading}</h1><h2>${fields.legalName}</h2><p>${fields.address} · ${fields.phone} · الرقم الضريبي: ${fields.tax}</p><small>الخزينة الذكية TREZO</small></header>`;
    const dataTable = `<table class="data"><tr><th>الرقم المرجعي</th><td>${fields.reference}</td></tr><tr><th>بيان الطلب</th><td>${fields.title}</td></tr><tr><th>الوصف</th><td>${fields.description}</td></tr><tr><th>المبلغ</th><td>${fields.amount}</td></tr><tr><th>المستفيد</th><td>${fields.beneficiary} · ${fields.beneficiaryPhone}</td></tr><tr><th>الجهة</th><td>${fields.company}</td></tr><tr><th>قناة الصرف</th><td>${fields.channel}</td></tr><tr><th>الحساب البنكي</th><td>${fields.bank}</td></tr><tr><th>موعد الصرف</th><td>${fields.date}</td></tr><tr><th>الحالة</th><td>${fields.status}</td></tr></table>`;
    const official = `<section class="official-copy"><p>تشهد شركة ${fields.legalName} بأن أمر الصرف رقم ${fields.reference} صادر لصرف مبلغ قدره <strong>${fields.amount}</strong> إلى المستفيد ${fields.beneficiary}، وذلك عن ${fields.title}.</p><p>تتم العملية لصالح الجهة ${fields.company} عبر قناة ${fields.channel}. بيانات التواصل: هاتف المستفيد ${fields.beneficiaryPhone}، والهاتف الرسمي للشركة ${fields.phone}، والعنوان ${fields.address}، والرقم الضريبي ${fields.tax}.</p><p>الوصف التفصيلي للعملية: ${fields.description}. الحساب البنكي المرتبط: ${fields.bank}. موعد الصرف المحدد: ${fields.date}.</p><p class="declaration">صدر هذا المستند للاستخدام الرسمي وفق بيانات الطلب المسجلة في نظام TREZO.</p></section>`;
    const modern = `<section class="modern-grid"><div class="amount">${fields.amount}<small>إجمالي مبلغ الصرف</small></div><div><label>المستفيد</label><strong>${fields.beneficiary}</strong></div><div><label>الجهة</label><strong>${fields.company}</strong></div><div><label>الغرض</label><strong>${fields.title}</strong></div><div><label>القناة</label><strong>${fields.channel}</strong></div><div><label>الموعد</label><strong>${fields.date}</strong></div><p>${fields.description}</p></section>`;
    const archiveRows = [
      "المحاسب",
      "المراجع",
      "المدير المالي",
      "المدير العام",
      "المدقق",
    ]
      .map(
        (label, index) =>
          `<tr><td>${label}</td><td>${index < (selected.status === "executed" ? 5 : selected.status === "approved" ? 3 : selected.status === "review" ? 1 : 0) ? "مكتمل" : "بانتظار الإجراء"}</td></tr>`
      )
      .join("");
    const approvalEvents = (workflow.data ?? []).filter(
      event => event.toStatus !== "draft"
    );
    const signatures = approvalEvents.length
      ? approvalEvents
          .map(
            event =>
              `<div class="signature"><strong>اعتماد إلكتروني مسجل</strong><br/>${escapeHtml(event.actorName ?? `المستخدم رقم ${event.actorId}`)}<br/><small>${escapeHtml(event.toStatus)} · ${escapeHtml(new Date(event.createdAt).toLocaleString("ar-SA"))}</small></div>`
          )
          .join("")
      : `<div class="signature">لا توجد اعتمادات مسجلة بعد</div>`;
    const archive = `${dataTable}<h3>مسار الاعتماد الداخلي</h3><table class="workflow"><tr><th>المرحلة</th><th>الحالة</th></tr>${archiveRows}</table><div class="signatures">${signatures}</div>${selected.status === "executed" ? `<div class="system-stamp">ختم TREZO الإلكتروني<br/><small>مكتمل الاعتماد · ${fields.reference}</small></div>` : ""}`;
    const content = isArchive
      ? archive
      : kind === "order"
        ? official
        : kind === "receipt"
          ? modern
          : dataTable;
    popup.document.write(
      `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>@page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0;background:#fff;color:#17202a;font-family:Arial,sans-serif;line-height:1.65}.sheet{height:273mm;overflow:hidden;padding:8mm;border:1px solid #d7dde2}.brand{text-align:center;border-bottom:3px solid #176b54;padding-bottom:10px;margin-bottom:12px}.logo{max-width:110px;max-height:55px;object-fit:contain;display:block;margin:0 auto 5px}.brand h1{margin:0;color:#176b54;font-size:23px}.brand h2{margin:2px 0;font-size:16px;font-weight:normal}.brand p{margin:4px 0;color:#59656e;font-size:10px}.brand small{color:#176b54;font-weight:bold}.data{width:100%;border-collapse:collapse;font-size:12px;margin-top:12px}.data th,.data td,.workflow th,.workflow td{border:1px solid #cfd6dd;padding:7px;text-align:right}.data th{width:27%;background:#f4f7f8}.official-copy{font-size:16px;line-height:2.15;text-align:justify;padding:12px 6px}.official-copy p{margin:0 0 15px}.declaration{border-top:1px solid #cfd6dd;padding-top:14px;font-size:13px}.modern-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:16px}.modern-grid>div,.modern-grid>p{border:1px solid #d7dde2;padding:12px;background:#f7fbf9}.modern-grid .amount{grid-column:1/-1;background:#176b54;color:#fff;font-size:28px;font-weight:bold}.modern-grid small,.modern-grid label{display:block;font-size:11px;font-weight:normal;color:inherit}.modern-grid p{grid-column:1/-1;min-height:70px}.workflow{width:100%;border-collapse:collapse;font-size:12px}.sheet h3{color:#176b54;margin:16px 0 5px}.signatures{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-top:18px;text-align:center}.signature{border-top:1px solid #59656e;padding-top:7px;font-size:11px;min-height:48px}.system-stamp{display:inline-block;margin-top:16px;border:2px solid #176b54;color:#176b54;padding:6px 15px;text-align:center;font-weight:bold;transform:rotate(-2deg)}footer{position:fixed;bottom:7mm;width:calc(100% - 16mm);border-top:1px solid #cfd6dd;padding-top:5px;text-align:center;color:#59656e;font-size:9px}@media print{.sheet{border:0}}</style></head><body>${base}${content}<footer>المرجع: ${fields.reference} · مستند مولد من TREZO${isArchive ? " · نسخة أرشيفية داخلية" : ""}</footer></div><script>window.onload=()=>window.print()</script></body></html>`
    );
    popup.document.close();
    popup.focus();
  };

  const save = () => {
    if (!selected) return;
    const validationMessage = validateDraftRequest(form);
    if (validationMessage) return setMessage(validationMessage);
    const channelMessage = validatePayoutChannel({
      isBank: editingIsBank,
      bankAccountId: form.bankAccountId,
    });
    if (channelMessage) return setMessage(channelMessage);
    update.mutate({
      requestId: selected.id,
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      amount: Number(form.amount),
      currency: form.currency,
      beneficiaryId: Number(form.beneficiaryId),
      bankAccountId: form.bankAccountId ? Number(form.bankAccountId) : null,
      channelId: Number(form.channelId),
      fiscalYearId: Number(form.fiscalYearId),
      scheduledFor: form.scheduledFor ? new Date(form.scheduledFor) : null,
    });
  };

  return (
    <div className="mt-5 rounded-2xl border bg-card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-display text-lg font-extrabold">
            تفاصيل وتعديل الطلب
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            يمكن تعديل المسودة أو الطلب المعاد فقط قبل إرساله للاعتماد.
          </p>
        </div>
        <select
          value={selectedId ?? ""}
          onChange={event => {
            setSelectedId(
              event.target.value ? Number(event.target.value) : undefined
            );
            setEditing(false);
          }}
          className="rounded-xl border bg-background px-3 py-2.5 text-sm"
          aria-label="اختيار طلب للتفاصيل"
        >
          <option value="">اختر طلباً</option>
          {rows.map(row => (
            <option key={row.id} value={row.id}>
              {row.referenceNumber} · {row.title}
            </option>
          ))}
        </select>
      </div>
      {selected ? (
        <div className="mt-5 rounded-xl bg-secondary/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold">
                {selected.referenceNumber} · الحالة:{" "}
                {statusPresentation?.label ?? selected.status}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {workflowSummary?.completed}
              </p>
              {workflowSummary?.next && (
                <p className="mt-1 text-xs font-semibold text-primary">
                  التالي: {workflowSummary.next}
                </p>
              )}
            </div>
            <button
              onClick={() => void copyReference()}
              className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold"
              title="نسخ الرقم المرجعي"
            >
              <Clipboard size={14} /> {copyLabel}
            </button>
            <button
              onClick={() => printSelected("order")}
              className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold"
            >
              <Building2 size={14} /> رسمي
            </button>
            <button
              onClick={() => printSelected("receipt")}
              className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold"
            >
              <ReceiptText size={14} /> حديث
            </button>
            <button
              onClick={() => printSelected("report")}
              className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold"
            >
              <FileText size={14} /> مختصر
            </button>
            <button
              onClick={() => printSelected("archive")}
              className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold"
            >
              <Archive size={14} /> أرشيف داخلي
            </button>
            {canEdit && !editing ? (
              <button
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
              >
                <Pencil size={14} /> تعديل الطلب
              </button>
            ) : null}
          </div>
          {editing && canEdit ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                value={form.title}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                className="rounded-xl border bg-background px-3 py-2.5 text-sm sm:col-span-2"
                placeholder="بيان الطلب"
              />
              <textarea
                value={form.description}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                className="min-h-24 rounded-xl border bg-background px-3 py-2.5 text-sm sm:col-span-2"
                placeholder="الوصف"
              />
              <input
                type="number"
                min="0.0001"
                step="any"
                value={form.amount}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    amount: event.target.value,
                  }))
                }
                className="rounded-xl border bg-background px-3 py-2.5 text-sm"
                placeholder="المبلغ"
              />
              <select
                value={form.currency}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    currency: event.target.value,
                  }))
                }
                className="rounded-xl border bg-background px-3 py-2.5 text-sm"
              >
                {currencies.map(currency => (
                  <option key={currency.code} value={currency.code}>
                    {currency.code}
                    {currency.nameAr ? ` · ${currency.nameAr}` : ""}
                  </option>
                ))}
              </select>
              <select
                value={form.beneficiaryId}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    beneficiaryId: event.target.value,
                    bankAccountId: "",
                  }))
                }
                className="rounded-xl border bg-background px-3 py-2.5 text-sm"
              >
                <option value="">اختر المستفيد</option>
                {(beneficiaries.data ?? []).map(item => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <select
                value={form.bankAccountId}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    bankAccountId: event.target.value,
                  }))
                }
                className="rounded-xl border bg-background px-3 py-2.5 text-sm"
              >
                <option value="">اختر الحساب البنكي (اختياري للصراف)</option>
                {(bankAccounts.data ?? []).map(item => (
                  <option key={item.id} value={item.id}>
                    {item.bankName} · {item.accountName}
                    {item.iban ? ` · ${item.iban}` : ""}
                  </option>
                ))}
              </select>
              <select
                value={form.channelId}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    channelId: event.target.value,
                  }))
                }
                className="rounded-xl border bg-background px-3 py-2.5 text-sm"
              >
                <option value="">اختر قناة الصرف</option>
                {(channels.data ?? []).map(item => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <select
                value={form.fiscalYearId}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    fiscalYearId: event.target.value,
                  }))
                }
                className="rounded-xl border bg-background px-3 py-2.5 text-sm"
              >
                <option value="">اختر السنة المالية</option>
                {(fiscalYears.data ?? []).map(item => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              <input
                type="datetime-local"
                value={form.scheduledFor}
                onChange={event =>
                  setForm(current => ({
                    ...current,
                    scheduledFor: event.target.value,
                  }))
                }
                className="rounded-xl border bg-background px-3 py-2.5 text-sm"
              />
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <button
                  onClick={save}
                  disabled={update.isPending}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
                >
                  <Save size={15} />{" "}
                  {update.isPending ? "جارٍ الحفظ…" : "حفظ التعديل"}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold"
                >
                  <X size={15} /> إلغاء
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <span className="text-xs text-muted-foreground">المبلغ</span>
                <p className="font-bold">
                  {selected.amount} {selected.currency}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">المستفيد</span>
                <p className="font-bold">
                  {beneficiaries.data?.find(
                    item => item.id === selected.beneficiaryId
                  )?.name ?? "—"}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">
                  قناة الصرف
                </span>
                <p className="font-bold">
                  {channels.data?.find(item => item.id === selected.channelId)
                    ?.name ?? "—"}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">
                  الحساب البنكي
                </span>
                <p className="font-bold">
                  {previewBankAccounts.data?.find(
                    item => item.id === selected.bankAccountId
                  )?.accountName ?? "غير مرتبط"}
                </p>
              </div>
              <div className="lg:col-span-4">
                <span className="text-xs text-muted-foreground">الوصف</span>
                <p className="font-bold">{selected.description || "—"}</p>
              </div>
            </div>
          )}
          {message ? (
            <p
              role="status"
              aria-live="polite"
              className={`mt-3 text-xs font-semibold ${message.startsWith("تعذر") || message.startsWith("أدخل") || message.startsWith("اختر") || message.startsWith("قناة") ? "text-destructive" : "text-primary"}`}
            >
              {message}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-5 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          اختر طلباً لعرض تفاصيله وخيارات التعديل.
        </p>
      )}
    </div>
  );
}
