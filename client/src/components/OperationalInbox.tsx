import { ArrowUpLeft, ClipboardCheck, FilePlus2, ShieldCheck } from "lucide-react";

type InboxRequest = {
  id: number;
  title: string;
  referenceNumber: string;
  status: string;
  amount: number | string;
  currency: string;
  createdAt: Date | string | number;
};

type OperationalInboxProps = {
  requests: InboxRequest[];
  onOpenRequests: () => void;
  onCreateRequest: () => void;
};

const statusText: Record<string, string> = {
  draft: "مسوداتك التي تحتاج إكمالاً أو إرسالاً",
  review: "طلبات تنتظر المراجعة",
  approved: "طلبات معتمدة تنتظر التنفيذ",
  rejected: "طلبات تحتاج تصحيحاً وإعادة إرسال",
  executed: "طلبات منفذة",
};

function getAction(status: string) {
  if (status === "draft") return "أكمل البيانات ثم أرسل للمراجعة";
  if (status === "review") return "افتح الطلب وراجع القرار";
  if (status === "approved") return "تابع تنفيذ الدفعة";
  if (status === "rejected") return "صحح الملاحظات وأعد الإرسال";
  return "عرض التفاصيل والسجل";
}

function getStatusLabel(status: string) {
  return status === "draft" ? "مسودة" : status === "review" ? "قيد المراجعة" : status === "approved" ? "معتمد" : status === "rejected" ? "معاد للتصحيح" : status === "executed" ? "منفذ" : status;
}

export function OperationalInbox({ requests, onOpenRequests, onCreateRequest }: OperationalInboxProps) {
  const actionable = requests.filter((request) => request.status !== "executed").slice(0, 5);
  const draftCount = requests.filter((request) => request.status === "draft" || request.status === "rejected").length;
  const reviewCount = requests.filter((request) => request.status === "review").length;
  const approvedCount = requests.filter((request) => request.status === "approved").length;

  return <section className="mt-5 rounded-2xl border bg-card p-5 sm:p-6" aria-labelledby="operational-inbox-title">
    <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div><div className="flex items-center gap-2"><ClipboardCheck size={18} className="text-primary"/><h3 id="operational-inbox-title" className="font-display text-base font-extrabold">صندوق العمل اليومي</h3></div><p className="mt-1 text-xs leading-5 text-muted-foreground">ابدأ من هنا. كل بطاقة توضح الحالة الحالية والإجراء المطلوب من الموظف.</p></div>
      <div className="flex gap-2"><button type="button" onClick={onCreateRequest} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-xs font-bold text-primary-foreground"><FilePlus2 size={15}/> طلب جديد</button><button type="button" onClick={onOpenRequests} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold"><ArrowUpLeft size={15}/> كل الطلبات</button></div>
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-amber-50 p-3 dark:bg-amber-950/25"><p className="text-xs text-muted-foreground">يحتاج إجراء منك</p><p className="mt-1 text-xl font-extrabold text-amber-800 dark:text-amber-300">{draftCount}</p></div><div className="rounded-xl bg-blue-50 p-3 dark:bg-blue-950/25"><p className="text-xs text-muted-foreground">قيد المراجعة</p><p className="mt-1 text-xl font-extrabold text-blue-800 dark:text-blue-300">{reviewCount}</p></div><div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-950/25"><p className="text-xs text-muted-foreground">جاهز للتنفيذ</p><p className="mt-1 text-xl font-extrabold text-emerald-800 dark:text-emerald-300">{approvedCount}</p></div></div>
    <div className="mt-4 grid gap-3">{actionable.length === 0 ? <div className="flex items-center gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground"><ShieldCheck size={18} className="text-primary"/><span>لا توجد مهام معلقة حالياً. يمكنك إنشاء طلب جديد عند الحاجة.</span></div> : actionable.map((request) => <button type="button" key={request.id} onClick={onOpenRequests} className="flex w-full items-center gap-3 rounded-xl border p-3 text-right transition-colors hover:border-primary/50 hover:bg-secondary/50"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary"><ClipboardCheck size={16}/></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{request.title}</span><span className="mt-1 block text-xs text-muted-foreground">{request.referenceNumber} · {getStatusLabel(request.status)} · {getAction(request.status)}</span></span><span className="shrink-0 text-left"><span className="block text-sm font-extrabold">{Number(request.amount).toLocaleString("en-US")} {request.currency}</span><span className="mt-1 block text-[11px] text-muted-foreground">{new Date(request.createdAt).toLocaleDateString("ar-SA")}</span></span><ArrowUpLeft size={15} className="shrink-0 text-muted-foreground"/></button>)}</div>
    <p className="mt-4 text-[11px] text-muted-foreground">{statusText["draft"]}، وتبقى قرارات الاعتماد حسب الصلاحيات المعتمدة في النظام.</p>
  </section>;
}
