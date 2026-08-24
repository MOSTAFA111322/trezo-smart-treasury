import { useEffect, useMemo, useState } from "react";
import { Archive, Building2, Clipboard, ClipboardList, FileText, Pencil, ReceiptText, Save, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { getNextWorkflowActor, getRequestStatusPresentation, validateDraftRequest, validatePayoutChannel } from "@shared/treasuryPresentation";

type RequestRecord = {
  id: number;
  referenceNumber: string;
  title: string;
  description?: string | null;
  amount: string | number;
  currency: string;
  beneficiaryId: number;
  bankAccountId?: number | null;
  channelId: number;
  fiscalYearId: number;
  scheduledFor?: Date | string | null;
  status: string;
};

type Props = { rows: RequestRecord[]; currencies: Array<{ code: string; nameAr: string; decimals: number }>; selectedRequestId?: number; onSelectedRequestIdChange?: (requestId: number | undefined) => void };

export function RequestDetailPanel({ rows, currencies, selectedRequestId: controlledSelectedId, onSelectedRequestIdChange }: Props) {
  const [internalSelectedId, setInternalSelectedId] = useState<number>();
  const isControlled = controlledSelectedId !== undefined || onSelectedRequestIdChange !== undefined;
  const selectedId = isControlled ? controlledSelectedId : internalSelectedId;
  const setSelectedId = (requestId: number | undefined) => {
    if (!isControlled) setInternalSelectedId(requestId);
    onSelectedRequestIdChange?.(requestId);
  };
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [copyLabel, setCopyLabel] = useState("نسخ الرقم المرجعي");
  const selected = useMemo(() => rows.find((row) => row.id === selectedId), [rows, selectedId]);
  const [form, setForm] = useState({ title: "", description: "", amount: "", currency: "YER", beneficiaryId: "", bankAccountId: "", channelId: "", fiscalYearId: "", scheduledFor: "" });
  const beneficiaries = trpc.entities.beneficiaries.list.useQuery(undefined, { enabled: Boolean(selected) });
  const bankAccounts = trpc.entities.beneficiaryBankAccounts.list.useQuery({ beneficiaryId: Number(form.beneficiaryId) }, { enabled: Boolean(selected) && editing && Boolean(form.beneficiaryId) });
  const previewBankAccounts = trpc.entities.beneficiaryBankAccounts.list.useQuery({ beneficiaryId: selected?.beneficiaryId ?? 0 }, { enabled: Boolean(selected) });
  const channels = trpc.entities.channels.list.useQuery(undefined, { enabled: Boolean(selected) });
  const fiscalYears = trpc.settings.fiscalYears.useQuery(undefined, { enabled: Boolean(selected) && editing });
  const utils = trpc.useUtils();
  const update = trpc.requests.update.useMutation({ onSuccess: async () => { await utils.requests.list.invalidate(); setMessage("تم حفظ تعديل الطلب وتحديث البيانات بنجاح."); setEditing(false); }, onError: (error) => setMessage(`تعذر تعديل الطلب: ${error.message}`) });

  useEffect(() => {
    if (!selected) return;
    setForm({ title: selected.title, description: selected.description ?? "", amount: String(selected.amount), currency: selected.currency, beneficiaryId: String(selected.beneficiaryId), bankAccountId: selected.bankAccountId ? String(selected.bankAccountId) : "", channelId: String(selected.channelId), fiscalYearId: String(selected.fiscalYearId), scheduledFor: selected.scheduledFor ? new Date(selected.scheduledFor).toISOString().slice(0, 16) : "" });
    setMessage("");
  }, [selected]);

  const canEdit = selected && (selected.status === "draft" || selected.status === "rejected");
  const statusPresentation = selected ? getRequestStatusPresentation(selected.status) : undefined;
  const nextActor = selected ? getNextWorkflowActor(selected.status) : undefined;
  const editingChannel = (channels.data ?? []).find((item) => String(item.id) === form.channelId);
  const editingIsBank = Boolean(editingChannel && (editingChannel.code?.toLowerCase().includes("bank") || editingChannel.name.includes("بنك")));
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
    const popup = window.open("", "_blank", "noopener,noreferrer,width=900,height=800");
    if (!popup) { setMessage("تعذر فتح نافذة المعاينة؛ اسمح بالنوافذ المنبثقة ثم أعد المحاولة."); return; }
    const escapeHtml = (value: string) => value.replace(/[&<>\\\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\\\"": "&quot;", "'": "&#039;" })[character] ?? character);
    const isArchive = kind === "archive";
    const isReceipt = kind === "receipt";
    const isReport = kind === "report";
    const title = isArchive ? `بطاقة أرشفة داخلية ${selected.referenceNumber}` : isReceipt ? `سند صرف ${selected.referenceNumber}` : isReport ? `تقرير اعتماد ${selected.referenceNumber}` : `أمر صرف ${selected.referenceNumber}`;
    const heading = isArchive ? "بطاقة أرشفة داخلية" : isReceipt ? "سند صرف" : isReport ? "تقرير اعتماد ومراجعة" : "أمر صرف رسمي للشركة";
    const notice = isArchive ? "نسخة داخلية للأرشفة والمتابعة، ولا تمثل اعتماداً مالياً مستقلاً عن سجل التدقيق." : isReceipt ? "سند صرف يثبت تفاصيل العملية بعد تسجيل التنفيذ وفق الصلاحيات المعتمدة." : isReport ? "تقرير موجز لمسار الاعتماد وحالة الطلب، ويُستخدم للمراجعة الإدارية والتدقيق." : "يُستخدم هذا المستند بعد استكمال دورة المراجعة والاعتماد وفق الصلاحيات المعتمدة.";
    const beneficiaryName = beneficiaries.data?.find((item) => item.id === selected.beneficiaryId)?.name ?? "—";
    const channelName = channels.data?.find((item) => item.id === selected.channelId)?.name ?? "—";
    const bankAccount = previewBankAccounts.data?.find((item) => item.id === selected.bankAccountId);
    const bankAccountLabel = bankAccount ? `${bankAccount.bankName} — ${bankAccount.accountName}${bankAccount.iban ? ` — ${bankAccount.iban}` : ""}` : "غير مرتبط";
    const stageLabels = ["المحاسب", "المراجع", "المدير المالي", "المدير العام", "المدقق"];
    const stageRank = selected.status === "draft" ? 0 : selected.status === "review" ? 1 : selected.status === "approved" ? 3 : selected.status === "executed" ? 5 : 0;
    const stageRows = stageLabels.map((label, index) => `<tr><td>${escapeHtml(label)}</td><td>${index < stageRank ? "مكتمل" : index === stageRank ? "المرحلة الحالية" : "بانتظار الإجراء"}</td></tr>`).join("");
    popup.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>@page{size:A4;margin:16mm}body{font-family:Arial,sans-serif;color:#17202a;padding:28px;line-height:1.8}.brand{text-align:center;border-bottom:3px solid #176b54;padding-bottom:12px}.brand h1{margin:0;color:#176b54;font-size:24px}.brand h2{font-size:16px;font-weight:normal;margin:4px 0 0}.stamp{text-align:right;margin-top:14px;color:#59656e;font-size:12px}table{width:100%;border-collapse:collapse;margin-top:22px}td{border:1px solid #cfd6dd;padding:11px}td:first-child{width:28%;font-weight:bold;background:#f5f7f9}.workflow-title{margin:26px 0 4px;color:#176b54;font-size:16px}.workflow td:first-child{width:50%}.notice{border-right:4px solid #d5a746;background:#fff9e9;padding:10px 14px;margin-top:22px;font-size:13px}.signatures{display:grid;grid-template-columns:repeat(2,1fr);gap:28px;margin-top:62px;text-align:center}.signature{min-height:68px;border-top:1px solid #5b6570;padding-top:10px;font-size:13px}.signature small{color:#59656e}footer{margin-top:34px;padding-top:10px;border-top:1px solid #cfd6dd;color:#59656e;font-size:10px;text-align:center}@media print{body{padding:12mm}}</style></head><body><header class="brand"><h1>${escapeHtml(heading)}</h1><h2>الخزينة الذكية TREZO</h2></header><div class="stamp">${isArchive ? "نسخة أرشيفية داخلية" : "نسخة رسمية للشركة"}<br/>تاريخ الإصدار: ${new Date().toLocaleDateString("ar-SA")}</div><table><tr><td>الرقم المرجعي</td><td>${escapeHtml(selected.referenceNumber)}</td></tr><tr><td>بيان الطلب</td><td>${escapeHtml(selected.title)}</td></tr><tr><td>الوصف</td><td>${escapeHtml(selected.description ?? "—")}</td></tr><tr><td>المبلغ</td><td>${escapeHtml(String(selected.amount))} ${escapeHtml(selected.currency)}</td></tr><tr><td>المستفيد</td><td>${escapeHtml(beneficiaryName)}</td></tr><tr><td>قناة الصرف</td><td>${escapeHtml(channelName)}</td></tr><tr><td>الحساب البنكي</td><td>${escapeHtml(bankAccountLabel)}</td></tr><tr><td>موعد الصرف</td><td>${escapeHtml(selected.scheduledFor ? new Date(selected.scheduledFor).toLocaleString("ar-SA") : "غير محدد")}</td></tr><tr><td>الحالة</td><td>${escapeHtml(statusPresentation?.label ?? selected.status)}</td></tr><tr><td>الإجراء التالي</td><td>${escapeHtml(nextActor ? `${nextActor.role} — ${nextActor.action}` : "لا يوجد إجراء تالٍ")}</td></tr></table><h3 class="workflow-title">مسار الاعتماد الخماسي</h3><table class="workflow"><tr><td>المرحلة</td><td>الحالة</td></tr>${stageRows}</table><p class="notice">${escapeHtml(notice)}</p><div class="signatures"><div class="signature">المحاسب<br/><small>الاسم والتوقيع</small></div><div class="signature">المراجع<br/><small>الاسم والتوقيع</small></div><div class="signature">المدير المالي<br/><small>الاسم والتوقيع</small></div><div class="signature">المدير العام<br/><small>الاسم والتوقيع</small></div></div><footer>المرجع: ${escapeHtml(selected.referenceNumber)} · الحالة عند الطباعة: ${escapeHtml(selected.status)} · مستند مولد من TREZO</footer><script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  };

  const save = () => {
    if (!selected) return;
    const validationMessage = validateDraftRequest(form);
    if (validationMessage) return setMessage(validationMessage);
    const channelMessage = validatePayoutChannel({ isBank: editingIsBank, bankAccountId: form.bankAccountId });
    if (channelMessage) return setMessage(channelMessage);
    update.mutate({ requestId: selected.id, title: form.title.trim(), description: form.description.trim() || undefined, amount: Number(form.amount), currency: form.currency, beneficiaryId: Number(form.beneficiaryId), bankAccountId: form.bankAccountId ? Number(form.bankAccountId) : null, channelId: Number(form.channelId), fiscalYearId: Number(form.fiscalYearId), scheduledFor: form.scheduledFor ? new Date(form.scheduledFor) : null });
  };

  return <div className="mt-5 rounded-2xl border bg-card p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-display text-lg font-extrabold">تفاصيل وتعديل الطلب</h3><p className="mt-1 text-xs text-muted-foreground">يمكن تعديل المسودة أو الطلب المعاد فقط قبل إرساله للاعتماد.</p></div><select value={selectedId ?? ""} onChange={(event) => { setSelectedId(event.target.value ? Number(event.target.value) : undefined); setEditing(false); }} className="rounded-xl border bg-background px-3 py-2.5 text-sm" aria-label="اختيار طلب للتفاصيل"><option value="">اختر طلباً</option>{rows.map((row) => <option key={row.id} value={row.id}>{row.referenceNumber} · {row.title}</option>)}</select></div>
    {selected ? <div className="mt-5 rounded-xl bg-secondary/50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-bold">{selected.referenceNumber} · الحالة: {statusPresentation?.label ?? selected.status}</p><p className="mt-1 text-xs text-muted-foreground">{nextActor ? `التالي: ${nextActor.role} — ${nextActor.action}` : "اكتملت الإجراءات المسجلة لهذا الطلب."}</p></div><button onClick={() => void copyReference()} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold" title="نسخ الرقم المرجعي"><Clipboard size={14}/> {copyLabel}</button><button onClick={() => printSelected("order")} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold"><Building2 size={14}/> أمر صرف</button><button onClick={() => printSelected("receipt")} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold"><ReceiptText size={14}/> سند صرف</button><button onClick={() => printSelected("report")} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold"><FileText size={14}/> تقرير اعتماد</button><button onClick={() => printSelected("archive")} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold"><Archive size={14}/> كليشة الأرشفة</button>{canEdit && !editing ? <button onClick={() => setEditing(true)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"><Pencil size={14}/> تعديل الطلب</button> : null}</div>
      {editing && canEdit ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className="rounded-xl border bg-background px-3 py-2.5 text-sm sm:col-span-2" placeholder="بيان الطلب"/><textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="min-h-24 rounded-xl border bg-background px-3 py-2.5 text-sm sm:col-span-2" placeholder="الوصف"/><input type="number" min="0.0001" step="any" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} className="rounded-xl border bg-background px-3 py-2.5 text-sm" placeholder="المبلغ"/><select value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value }))} className="rounded-xl border bg-background px-3 py-2.5 text-sm">{currencies.map((currency) => <option key={currency.code} value={currency.code}>{currency.code} · {currency.nameAr}</option>)}</select><select value={form.beneficiaryId} onChange={(event) => setForm((current) => ({ ...current, beneficiaryId: event.target.value, bankAccountId: "" }))} className="rounded-xl border bg-background px-3 py-2.5 text-sm"><option value="">اختر المستفيد</option>{(beneficiaries.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={form.bankAccountId} onChange={(event) => setForm((current) => ({ ...current, bankAccountId: event.target.value }))} className="rounded-xl border bg-background px-3 py-2.5 text-sm"><option value="">اختر الحساب البنكي (اختياري للصراف)</option>{(bankAccounts.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.bankName} · {item.accountName}{item.iban ? ` · ${item.iban}` : ""}</option>)}</select><select value={form.channelId} onChange={(event) => setForm((current) => ({ ...current, channelId: event.target.value }))} className="rounded-xl border bg-background px-3 py-2.5 text-sm"><option value="">اختر قناة الصرف</option>{(channels.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={form.fiscalYearId} onChange={(event) => setForm((current) => ({ ...current, fiscalYearId: event.target.value }))} className="rounded-xl border bg-background px-3 py-2.5 text-sm"><option value="">اختر السنة المالية</option>{(fiscalYears.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><input type="datetime-local" value={form.scheduledFor} onChange={(event) => setForm((current) => ({ ...current, scheduledFor: event.target.value }))} className="rounded-xl border bg-background px-3 py-2.5 text-sm"/><div className="flex flex-wrap gap-2 sm:col-span-2"><button onClick={save} disabled={update.isPending} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"><Save size={15}/> {update.isPending ? "جارٍ الحفظ…" : "حفظ التعديل"}</button><button onClick={() => setEditing(false)} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold"><X size={15}/> إلغاء</button></div></div> : <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><span className="text-xs text-muted-foreground">المبلغ</span><p className="font-bold">{selected.amount} {selected.currency}</p></div><div><span className="text-xs text-muted-foreground">المستفيد</span><p className="font-bold">{beneficiaries.data?.find((item) => item.id === selected.beneficiaryId)?.name ?? "—"}</p></div><div><span className="text-xs text-muted-foreground">قناة الصرف</span><p className="font-bold">{channels.data?.find((item) => item.id === selected.channelId)?.name ?? "—"}</p></div><div><span className="text-xs text-muted-foreground">الحساب البنكي</span><p className="font-bold">{previewBankAccounts.data?.find((item) => item.id === selected.bankAccountId)?.accountName ?? "غير مرتبط"}</p></div><div className="lg:col-span-4"><span className="text-xs text-muted-foreground">الوصف</span><p className="font-bold">{selected.description || "—"}</p></div></div>}
      {message ? <p role="status" aria-live="polite" className={`mt-3 text-xs font-semibold ${message.startsWith("تعذر") || message.startsWith("أدخل") || message.startsWith("اختر") || message.startsWith("قناة") ? "text-destructive" : "text-primary"}`}>{message}</p> : null}
    </div> : <p className="mt-5 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">اختر طلباً لعرض تفاصيله وخيارات التعديل.</p>}
  </div>;
}
