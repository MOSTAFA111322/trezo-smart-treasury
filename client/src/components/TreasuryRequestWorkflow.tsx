import { useState } from "react";
import { AlertCircle, CheckCircle2, FileText, Loader2, Paperclip, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  formatTreasuryAmount,
  getRequestStatusPresentation,
  getWorkflowAction,
  type TreasuryStatus,
  validateTreasuryAttachment,
} from "@shared/treasuryPresentation";

type RequestRow = {
  id: number;
  referenceNumber: string;
  title: string;
  amount: string;
  currency: string;
  status: string;
};

type PendingTransition = {
  requestId: number;
  title: string;
  label: string;
  toStatus: TreasuryStatus;
};

const toneClasses = {
  neutral: "bg-slate-100 text-slate-700",
  warning: "bg-amber-100 text-amber-800",
  info: "bg-blue-100 text-blue-800",
  success: "bg-emerald-100 text-emerald-800",
  danger: "bg-red-100 text-red-800",
};

export default function TreasuryRequestWorkflow({ rows, onCreateRequest }: { rows: RequestRow[]; onCreateRequest?: () => void }) {
  const utils = trpc.useUtils();
  const [selectedRequestId, setSelectedRequestId] = useState<number>();
  const [file, setFile] = useState<File | null>(null);
  const [attachmentMessage, setAttachmentMessage] = useState("");
  const [pendingTransition, setPendingTransition] = useState<PendingTransition>();
  const [transitionComment, setTransitionComment] = useState("");
  const [transitionMessage, setTransitionMessage] = useState("");
  const attachments = trpc.attachments.list.useQuery({ requestId: selectedRequestId ?? 0 }, { enabled: Boolean(selectedRequestId) });
  const transition = trpc.requests.transition.useMutation({
    onSuccess: (result) => {
      const presentation = getRequestStatusPresentation(result.status);
      setTransitionMessage(`تم تحديث حالة الطلب إلى «${presentation.label}».`);
      setPendingTransition(undefined);
      setTransitionComment("");
      void utils.requests.list.invalidate();
      void utils.dashboard.summary.invalidate();
    },
    onError: (error) => setTransitionMessage(`تعذر تحديث حالة الطلب: ${error.message}`),
  });
  const upload = trpc.attachments.upload.useMutation({
    onSuccess: () => {
      setFile(null);
      setAttachmentMessage("تم رفع المرفق بنجاح.");
      void attachments.refetch();
    },
    onError: (error) => setAttachmentMessage(`تعذر رفع المرفق: ${error.message}`),
  });
  const download = trpc.attachments.download.useMutation({ onError: (error) => setAttachmentMessage(`تعذر الوصول إلى المرفق: ${error.message}`) });

  const openAttachment = async (attachmentId: number, fileName: string, shouldDownload: boolean) => {
    try {
      const result = await download.mutateAsync({ attachmentId });
      const link = document.createElement("a");
      link.href = result.url;
      link.target = shouldDownload ? "_self" : "_blank";
      if (shouldDownload) link.download = fileName;
      link.rel = "noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      // The mutation already gives the user a localized, visible error message.
    }
  };

  const uploadFile = () => {
    if (!selectedRequestId || !file) return;
    const validationMessage = validateTreasuryAttachment(file);
    if (validationMessage) {
      setAttachmentMessage(validationMessage);
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setAttachmentMessage("تعذر قراءة الملف المحدد. حاول اختيار الملف مرة أخرى.");
    reader.onload = () => {
      const base64 = typeof reader.result === "string" ? reader.result : "";
      if (!base64) {
        setAttachmentMessage("تعذر تجهيز الملف للرفع. حاول اختيار الملف مرة أخرى.");
        return;
      }
      upload.mutate({ requestId: selectedRequestId, fileName: file.name, mimeType: file.type || "application/octet-stream", sizeBytes: file.size, base64 });
    };
    reader.readAsDataURL(file);
  };

  const beginTransition = (requestId: number, title: string, label: string, toStatus: TreasuryStatus) => {
    setTransitionMessage("");
    setTransitionComment("");
    setPendingTransition({ requestId, title, label, toStatus });
  };

  const confirmTransition = () => {
    if (!pendingTransition) return;
    transition.mutate({
      requestId: pendingTransition.requestId,
      toStatus: pendingTransition.toStatus,
      comment: transitionComment.trim() || undefined,
    });
  };

  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="border-b p-5">
        <h3 className="font-display text-lg font-extrabold">دورة اعتماد طلبات الصرف</h3>
        <p className="mt-1 text-xs text-muted-foreground">تتطلب كل خطوة تأكيداً واضحاً، ويُحفظ الإجراء وملاحظته في سجل التدقيق.</p>
      </div>
      {transitionMessage && <div role="status" className={`m-5 flex items-start gap-2 rounded-xl border p-3 text-sm ${transitionMessage.startsWith("تم") ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}><CheckCircle2 size={17} className="mt-0.5 shrink-0" />{transitionMessage}</div>}
      <div className="divide-y">
        {rows.length ? rows.map((row) => {
          const action = getWorkflowAction(row.status);
          const isSelected = selectedRequestId === row.id;
          const isConfirming = pendingTransition?.requestId === row.id;
          const status = getRequestStatusPresentation(row.status);
          const canReject = ["draft", "review", "approved"].includes(row.status);
          return (
            <div key={row.id} className="p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold">{row.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{row.referenceNumber} · {formatTreasuryAmount(row.amount, row.currency)}</p>
                  <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${toneClasses[status.tone]}`}>{status.label}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {action && <button type="button" disabled={transition.isPending} onClick={() => beginTransition(row.id, row.title, action.label, action.toStatus)} className="rounded-xl bg-[#176b54] px-4 py-2.5 text-xs font-bold text-white transition active:scale-[.97] disabled:opacity-50">{action.label}</button>}
                  {canReject && <button type="button" disabled={transition.isPending} onClick={() => beginTransition(row.id, row.title, "رفض الطلب", "rejected")} className="rounded-xl border border-red-200 px-4 py-2.5 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50">رفض</button>}
                  <button type="button" onClick={() => { setSelectedRequestId(isSelected ? undefined : row.id); setAttachmentMessage(""); setFile(null); }} aria-expanded={isSelected} className="rounded-xl border px-4 py-2.5 text-xs font-bold transition hover:bg-muted">{isSelected ? "إخفاء المرفقات" : "المرفقات"}</button>
                </div>
              </div>
              {isConfirming && <div className="mt-4 rounded-xl border border-[#b8d8cc] bg-[#f2f7f4] p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">تأكيد الإجراء: {pendingTransition.label}</p><p className="mt-1 text-xs text-muted-foreground">سيُحدَّث الطلب «{pendingTransition.title}» ويضاف الإجراء إلى سجل التدقيق.</p></div><button type="button" aria-label="إلغاء الإجراء" onClick={() => setPendingTransition(undefined)} className="rounded-lg p-1 text-muted-foreground hover:bg-white"><X size={16} /></button></div><label className="mt-3 block"><span className="mb-1.5 block text-xs font-semibold">ملاحظة للإجراء <span className="font-normal text-muted-foreground">(اختيارية)</span></span><textarea value={transitionComment} onChange={(event) => setTransitionComment(event.target.value)} maxLength={2000} rows={2} className="w-full resize-none rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#176b54]/20" placeholder="أضف سبباً أو ملاحظة للمراجعة…" /></label><div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setPendingTransition(undefined)} className="rounded-xl border px-3 py-2 text-xs font-bold">إلغاء</button><button type="button" onClick={confirmTransition} disabled={transition.isPending} className="rounded-xl bg-[#176b54] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{transition.isPending ? "جارٍ التحديث…" : "تأكيد الإجراء"}</button></div></div>}
              {isSelected && <div className="mt-4 rounded-xl bg-[#f7faf8] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><label className="min-w-0 flex-1"><span className="sr-only">اختيار مرفق</span><input type="file" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setAttachmentMessage(""); }} className="min-w-0 w-full text-xs" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.doc,.docx" /></label><button type="button" disabled={!file || upload.isPending} onClick={uploadFile} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#176b54] px-4 py-2.5 text-xs font-bold text-white transition active:scale-[.97] disabled:opacity-50">{upload.isPending ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}{upload.isPending ? "جارٍ الرفع…" : "رفع المرفق"}</button></div><p className="mt-2 text-[11px] text-muted-foreground">الصيغ المدعومة: PDF، PNG، JPG، XLSX، DOC، DOCX. الحد الأقصى 8 ميجابايت.</p><div className="mt-3 space-y-2">{attachmentMessage && <p role="status" className={`flex items-center gap-2 text-xs font-semibold ${attachmentMessage.startsWith("تم") ? "text-[#176b54]" : "text-red-700"}`}><AlertCircle size={14} />{attachmentMessage}</p>}{attachments.error && <p role="alert" className="flex items-center gap-2 text-xs font-semibold text-red-700"><AlertCircle size={14} />تعذر تحميل المرفقات: {attachments.error.message}</p>}{(attachments.data ?? []).map((item) => <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-white px-3 py-2 text-xs"><FileText size={14} className="text-[#176b54]" /><span className="font-semibold">{item.fileName} · {Math.ceil(item.sizeBytes / 1024)} كيلوبايت</span><div className="mr-auto flex gap-3"><button type="button" onClick={() => void openAttachment(item.id, item.fileName, false)} disabled={download.isPending} className="font-bold text-[#176b54] disabled:opacity-50">فتح</button><button type="button" onClick={() => void openAttachment(item.id, item.fileName, true)} disabled={download.isPending} className="font-bold text-[#176b54] disabled:opacity-50">تنزيل</button></div></div>)}{attachments.isLoading && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin" />جارٍ تحميل المرفقات…</p>}{!attachments.isLoading && !attachments.error && !(attachments.data ?? []).length && <p className="text-xs text-muted-foreground">لا توجد مرفقات لهذا الطلب.</p>}</div></div>}
            </div>
          );
        }) : <div className="p-10 text-center"><p className="text-sm text-muted-foreground">لا توجد طلبات صرف بعد. يمكنك البدء الآن بإنشاء أول طلب.</p>{onCreateRequest && <button type="button" onClick={onCreateRequest} className="mt-4 rounded-xl bg-[#176b54] px-4 py-2.5 text-sm font-bold text-white transition active:scale-[.97]">إنشاء طلب صرف</button>}</div>}
      </div>
    </div>
  );
}
