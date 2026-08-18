import { useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import Workspace from "@/pages/Workspace";
import {
  formatTreasuryAmount,
  getRequestStatusPresentation,
  totalAmountsByCurrency,
  validateDraftRequest,
} from "@shared/treasuryPresentation";
import { amountInArabicWords } from "@shared/amountInWords";
import {
  ArrowUpLeft, BarChart3, Bell, Building2, CalendarDays, CheckCircle2,
  ChevronDown, CircleDollarSign, ClipboardList, LayoutDashboard, LogOut,
  Menu, Plus, Search, Settings2, ShieldCheck, Sparkles, Users, WalletCards,
  X, ReceiptText, Paperclip, AlertCircle, Loader2,
} from "lucide-react";

const nav = [
  { id: "dashboard", label: "نظرة عامة", icon: LayoutDashboard },
  { id: "requests", label: "طلبات الصرف", icon: ClipboardList },
  { id: "calendar", label: "تقويم المدفوعات", icon: CalendarDays },
  { id: "entities", label: "الجهات والبيانات", icon: Building2 },
  { id: "reports", label: "التقارير والطباعة", icon: BarChart3 },
  { id: "audit", label: "سجل التدقيق", icon: ShieldCheck },
];

type RequestLike = {
  amount: string;
  currency: string;
  status: string;
  createdAt: Date | string;
  scheduledFor?: Date | string | null;
};

function StatCard({ label, value, meta, icon: Icon, color, loading }: { label: string; value: string; meta: string; icon: typeof WalletCards; color: string; loading?: boolean }) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-[0_10px_30px_rgba(18,70,55,.04)] transition-transform duration-200 hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${color}`}><Icon size={21} /></div>
        <span className="text-xs font-semibold text-emerald-700">{meta}</span>
      </div>
      <p className="mt-5 text-sm text-muted-foreground">{label}</p>
      {loading ? <div className="mt-2 h-8 w-28 animate-pulse rounded-md bg-muted" /> : <p className="mt-1 break-words font-display text-xl font-extrabold tracking-tight">{value}</p>}
    </div>
  );
}

function Donut({ segments }: { segments: Array<{ label: string; percent: number; color: string }> }) {
  const gradient = segments.length
    ? segments.map((segment, index) => {
      const start = segments.slice(0, index).reduce((sum, item) => sum + item.percent, 0);
      return `${segment.color} ${start}% ${start + segment.percent}%`;
    }).join(", ")
    : "#dbe9e3 0 100%";
  const top = segments[0];
  return (
    <div className="relative h-40 w-40 shrink-0">
      <div className="h-full w-full rounded-full" style={{ background: `conic-gradient(${gradient})` }} />
      <div className="absolute inset-[18px] flex flex-col items-center justify-center rounded-full bg-card">
        <span className="font-display text-2xl font-extrabold">{top?.percent ?? 0}%</span>
        <span className="text-xs text-muted-foreground">{top?.label ?? "لا توجد بيانات"}</span>
      </div>
    </div>
  );
}

function RequestModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const companies = trpc.entities.companies.list.useQuery();
  const beneficiaries = trpc.entities.beneficiaries.list.useQuery();
  const channels = trpc.entities.channels.list.useQuery();
  const years = trpc.settings.fiscalYears.useQuery();
  const utils = trpc.useUtils();
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({ title: "", amount: "", currency: "SAR", companyId: "", beneficiaryId: "", channelId: "", fiscalYearId: "" });
  const createDraft = trpc.requests.createDraft.useMutation({
    onSuccess: () => {
      void utils.requests.list.invalidate();
      void utils.dashboard.summary.invalidate();
      onCreated();
    },
    onError: (error) => setFormError(`تعذر حفظ الطلب: ${error.message}`),
  });
  const update = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (formError) setFormError("");
  };
  const submit = () => {
    const validationMessage = validateDraftRequest(form);
    if (validationMessage) {
      setFormError(validationMessage);
      return;
    }
    createDraft.mutate({
      title: form.title.trim(), amount: Number(form.amount), currency: form.currency,
      companyId: Number(form.companyId), beneficiaryId: Number(form.beneficiaryId),
      channelId: Number(form.channelId), fiscalYearId: Number(form.fiscalYearId),
    });
  };
  const selectClass = "w-full rounded-xl border bg-background px-3 py-3 outline-none transition focus:ring-2 focus:ring-[#176b54]/20";
  const dataLoading = companies.isLoading || beneficiaries.isLoading || channels.isLoading || years.isLoading;
  const dataError = companies.error ?? beneficiaries.error ?? channels.error ?? years.error;
  const setupMissing = !dataLoading && !dataError && (!(companies.data ?? []).length || !(beneficiaries.data ?? []).length || !(channels.data ?? []).length || !(years.data ?? []).length);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d3329]/35 p-4 backdrop-blur-sm" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="new-request-title" className="w-full max-w-xl rounded-2xl bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 id="new-request-title" className="font-display text-xl font-extrabold">إنشاء طلب صرف جديد</h2>
            <p className="mt-1 text-sm text-muted-foreground">يُنشأ الرقم المرجعي والمبلغ كتابةً تلقائياً عند الحفظ.</p>
          </div>
          <button type="button" aria-label="إغلاق نافذة إنشاء الطلب" onClick={onClose} className="rounded-lg p-2 transition hover:bg-muted"><X size={18} /></button>
        </div>
        {dataLoading ? <div className="mt-8 flex items-center justify-center gap-2 rounded-xl bg-muted/60 p-6 text-sm text-muted-foreground"><Loader2 className="animate-spin" size={17} /> جارٍ تجهيز حقول الطلب…</div> : dataError ? <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">تعذر تحميل بيانات الإعداد اللازمة: {dataError.message}</div> : setupMissing ? <div role="alert" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">أضف شركةً ومستفيداً وقناة صرف وسنةً ماليةً أولاً من قسم «الجهات والبيانات» و«الإعدادات».</div> : <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="mb-2 block text-sm font-semibold">وصف الطلب</span><input value={form.title} onChange={(event) => update("title", event.target.value)} className={selectClass} placeholder="مثال: دفعة خدمات استشارية" autoFocus /></label>
            <label><span className="mb-2 block text-sm font-semibold">المبلغ</span><input type="number" min="0" step="0.01" inputMode="decimal" value={form.amount} onChange={(event) => update("amount", event.target.value)} className={`${selectClass} font-display`} placeholder="0.00" /></label>
            <label><span className="mb-2 block text-sm font-semibold">العملة</span><select value={form.currency} onChange={(event) => update("currency", event.target.value)} className={selectClass}><option value="SAR">ريال سعودي (SAR)</option><option value="USD">دولار أمريكي (USD)</option><option value="EUR">يورو (EUR)</option></select></label>
            <div className="sm:col-span-2 rounded-xl bg-[#f2f7f4] px-3 py-3 text-sm text-[#176b54]"><span className="font-semibold">المبلغ كتابةً: </span>{form.amount && Number(form.amount) > 0 ? amountInArabicWords(Number(form.amount), form.currency) : "سيظهر تلقائياً بعد إدخال مبلغ صحيح"}</div>
            <label><span className="mb-2 block text-sm font-semibold">الشركة</span><select value={form.companyId} onChange={(event) => update("companyId", event.target.value)} className={selectClass}><option value="">اختر الشركة</option>{(companies.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label><span className="mb-2 block text-sm font-semibold">المستفيد</span><select value={form.beneficiaryId} onChange={(event) => update("beneficiaryId", event.target.value)} className={selectClass}><option value="">اختر المستفيد</option>{(beneficiaries.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label><span className="mb-2 block text-sm font-semibold">قناة الصرف</span><select value={form.channelId} onChange={(event) => update("channelId", event.target.value)} className={selectClass}><option value="">اختر القناة</option>{(channels.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label><span className="mb-2 block text-sm font-semibold">السنة المالية</span><select value={form.fiscalYearId} onChange={(event) => update("fiscalYearId", event.target.value)} className={selectClass}><option value="">اختر السنة</option>{(years.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.year}</option>)}</select></label>
          </div>
          <div className="mt-5 flex items-center gap-2 rounded-xl bg-[#f2f7f4] p-3 text-xs text-muted-foreground"><Paperclip size={15} /> يمكنك إضافة المرفقات بعد إنشاء الطلب.</div>
          {formError && <p role="alert" className="mt-3 flex items-center gap-2 text-sm font-semibold text-red-700"><AlertCircle size={16} />{formError}</p>}
          <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-xl border px-4 py-2.5 text-sm font-semibold">إلغاء</button><button type="button" disabled={createDraft.isPending} onClick={submit} className="rounded-xl bg-[#176b54] px-5 py-2.5 text-sm font-bold text-white transition active:scale-[.97] disabled:opacity-50">{createDraft.isPending ? "جارٍ الحفظ…" : "حفظ كمسودة"}</button></div>
        </>}
      </div>
    </div>
  );
}

function formatCurrencyTotals(rows: RequestLike[]) {
  const totals = totalAmountsByCurrency(rows);
  const entries = Object.entries(totals);
  if (!entries.length) return "—";
  return entries.map(([currency, total]) => formatTreasuryAmount(total, currency)).join(" · ");
}

function buildActivity(rows: RequestLike[], currency?: string) {
  const now = new Date();
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const current = { label: "هذا الشهر", executed: 0, inProgress: 0 };
  const previous = { label: "الشهر السابق", executed: 0, inProgress: 0 };
  rows.forEach((row) => {
    const date = new Date(row.createdAt);
    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || Number.isNaN(date.getTime()) || (currency && row.currency !== currency)) return;
    const bucket = date >= currentMonth ? current : date >= previousMonth ? previous : undefined;
    if (!bucket) return;
    if (row.status === "executed") bucket.executed += amount;
    else if (row.status !== "rejected") bucket.inProgress += amount;
  });
  return [current, previous];
}

function getUpcomingRequests(rows: RequestLike[]) {
  const now = new Date();
  const endOfWeek = new Date(now);
  endOfWeek.setDate(now.getDate() + 7);
  return rows.filter((row) => {
    const scheduledFor = row.scheduledFor ? new Date(row.scheduledFor) : undefined;
    return Boolean(scheduledFor && !Number.isNaN(scheduledFor.getTime()) && scheduledFor >= now && scheduledFor < endOfWeek && row.status !== "rejected" && row.status !== "executed");
  });
}

export default function Home() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [active, setActive] = useState("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const summaryQuery = trpc.dashboard.summary.useQuery(undefined, { enabled: isAuthenticated });
  const requestsQuery = trpc.requests.list.useQuery(undefined, { enabled: isAuthenticated });
  const visibleRequests = requestsQuery.data ?? [];
  const recentRequests = visibleRequests.slice(0, 5);
  const currencySegments = useMemo(() => {
    const values = summaryQuery.data?.byCurrency ?? [];
    const total = values.reduce((sum, item) => sum + Number(item.total), 0);
    const colors = ["#176b54", "#d5a746", "#86b8a8", "#9e5d3c"];
    return values.map((item, index) => ({ label: item.currency, percent: total ? Math.round((Number(item.total) / total) * 100) : 0, color: colors[index % colors.length] }));
  }, [summaryQuery.data]);
  const activityCurrency = currencySegments[0]?.label;
  const activity = useMemo(() => buildActivity(visibleRequests, activityCurrency), [visibleRequests, activityCurrency]);
  const activityMax = Math.max(...activity.map((item) => item.executed + item.inProgress), 1);
  const pendingRequests = visibleRequests.filter((request) => ["draft", "review", "approved"].includes(request.status));
  const upcomingRequests = useMemo(() => getUpcomingRequests(visibleRequests), [visibleRequests]);
  const activeLabel = nav.find((item) => item.id === active)?.label ?? ({ settings: "الإعدادات", users: "المستخدمون والصلاحيات" }[active] ?? "مساحة العمل");
  const navigationClass = (id: string) => `flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${active === id ? "bg-white/12 text-white" : "text-emerald-50/65 hover:bg-white/7 hover:text-white"}`;

  if (loading) return <div className="flex min-h-screen items-center justify-center gap-2 text-muted-foreground"><Loader2 className="animate-spin" size={18} />جارٍ تجهيز مساحة العمل…</div>;

  return (
    <div className="min-h-screen bg-[#f5f8f6] text-[#17352d]">
      {mobileOpen && <button type="button" aria-label="إغلاق القائمة" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-[#0d3329]/35 lg:hidden" />}
      <aside className={`fixed inset-y-0 right-0 z-40 w-[272px] border-l bg-[#0d3329] px-5 py-6 text-white transition-transform duration-200 lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between px-2"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#d5a746] text-[#17352d]"><WalletCards size={22} /></div><div><div className="font-display text-lg font-extrabold tracking-wide">TREZO</div><div className="text-[10px] text-emerald-100/60">SMART TREASURY</div></div></div><button type="button" aria-label="إغلاق القائمة" className="rounded-lg p-1 lg:hidden" onClick={() => setMobileOpen(false)}><X size={20} /></button></div>
        <div className="mt-10 px-2 text-[10px] font-bold tracking-[.18em] text-emerald-100/45">مساحة العمل</div>
        <nav className="mt-3 space-y-1">{nav.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} onClick={() => { setActive(item.id); setMobileOpen(false); }} className={navigationClass(item.id)}><Icon size={18} />{item.label}</button>; })}</nav>
        <div className="mt-10 px-2 text-[10px] font-bold tracking-[.18em] text-emerald-100/45">الإدارة</div>
        <nav className="mt-3 space-y-1"><button type="button" onClick={() => { setActive("settings"); setMobileOpen(false); }} className={navigationClass("settings")}><Settings2 size={18} /> الإعدادات</button><button type="button" onClick={() => { setActive("users"); setMobileOpen(false); }} className={navigationClass("users")}><Users size={18} /> المستخدمون والصلاحيات</button></nav>
        <div className="absolute bottom-6 left-5 right-5 rounded-2xl border border-white/10 bg-white/7 p-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#d5a746] font-bold text-[#17352d]">{user?.name?.slice(0, 1) ?? "م"}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{user?.name ?? "مدير الخزينة"}</p><p className="truncate text-[11px] text-emerald-100/55">{user?.role === "admin" ? "مسؤول النظام" : "مستخدم النظام"}</p></div><button type="button" onClick={() => void logout()} title="تسجيل الخروج" aria-label="تسجيل الخروج"><LogOut size={16} className="text-emerald-100/55" /></button></div></div>
      </aside>
      <main className="min-h-screen lg:mr-[272px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b bg-[#f5f8f6]/90 px-5 backdrop-blur-xl sm:px-8"><div className="flex items-center gap-3"><button type="button" aria-label="فتح القائمة" className="rounded-lg p-2 hover:bg-white lg:hidden" onClick={() => setMobileOpen(true)}><Menu size={21} /></button><div><div className="flex items-center gap-2 text-xs text-muted-foreground"><span>الرئيسية</span><span>/</span><span className="font-medium text-[#176b54]">{activeLabel}</span></div><h1 className="mt-1 font-display text-xl font-extrabold">{activeLabel}</h1></div></div><div className="flex items-center gap-2 sm:gap-4"><button type="button" onClick={() => setActive("requests")} className="hidden items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:text-[#176b54] md:flex"><Search size={16} />عرض الطلبات</button><button type="button" aria-label="عرض الطلبات قيد المتابعة" onClick={() => setActive("requests")} className="relative rounded-xl border bg-white p-2.5"><Bell size={18} />{pendingRequests.length > 0 && <span className="absolute -left-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#d05c42] px-1 text-[9px] font-bold text-white">{pendingRequests.length}</span>}</button></div></header>
        <section className="mx-auto max-w-[1500px] p-5 sm:p-8">
          {active !== "dashboard" ? <Workspace active={active} onBack={() => setActive("dashboard")} onCreateRequest={() => setShowRequest(true)} /> : <>
            <div className="mb-7 flex flex-col justify-between gap-5 md:flex-row md:items-end rise-in"><div><div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#e3f0eb] px-3 py-1 text-xs font-semibold text-[#176b54]"><Sparkles size={13} /> ملخصك المالي اليوم</div><h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">صباح الخير، {user?.name?.split(" ")[0] ?? "مدير الخزينة"}</h2><p className="mt-2 text-sm text-muted-foreground">هذه لمحة مركزة عن حركة الخزينة والالتزامات القادمة.</p></div><button type="button" onClick={() => setShowRequest(true)} className="flex w-fit items-center gap-2 rounded-xl bg-[#176b54] px-4 py-3 text-sm font-bold text-white transition active:scale-[.97]"><Plus size={18} /> إنشاء طلب صرف</button></div>
            {requestsQuery.error && <div role="alert" className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><span className="flex items-center gap-2"><AlertCircle size={17} />تعذر تحديث بيانات لوحة التحكم: {requestsQuery.error.message}</span><button type="button" onClick={() => void requestsQuery.refetch()} className="font-bold underline">إعادة المحاولة</button></div>}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="إجمالي طلبات الصرف" value={formatCurrencyTotals(visibleRequests)} meta="من الطلبات المسجلة" icon={CircleDollarSign} color="bg-[#e2f1eb] text-[#176b54]" loading={requestsQuery.isLoading} />
              <StatCard label="المدفوعات المعلقة" value={formatCurrencyTotals(pendingRequests)} meta={`${pendingRequests.length} طلب قيد المتابعة`} icon={ClipboardList} color="bg-[#fff3d9] text-[#9a6b0c]" loading={requestsQuery.isLoading} />
              <StatCard label="المدفوعات المنفذة" value={formatCurrencyTotals(visibleRequests.filter((request) => request.status === "executed"))} meta="طلبات مكتملة" icon={CheckCircle2} color="bg-[#e6eef8] text-[#28679b]" loading={requestsQuery.isLoading} />
              <StatCard label="المستحق هذا الأسبوع" value={formatCurrencyTotals(upcomingRequests)} meta="7 أيام قادمة" icon={CalendarDays} color="bg-[#f3e9e3] text-[#9e5d3c]" loading={requestsQuery.isLoading} />
            </div>
            <div className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
              <div className="rounded-2xl border bg-card p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><h3 className="font-display text-base font-extrabold">حركة الطلبات</h3><p className="mt-1 text-xs text-muted-foreground">{activityCurrency ? `يعرض مبالغ ${activityCurrency} فقط خلال الشهرين الأخيرين.` : "أضف طلبات صرف لعرض حركة المبالغ حسب العملة."}</p></div><ChevronDown size={18} className="mt-1 text-muted-foreground" /></div><div className="mt-7 flex h-48 items-end gap-5 sm:gap-8">{activity.map((item) => { const total = item.executed + item.inProgress; const executedHeight = `${Math.round((item.executed / activityMax) * 100)}%`; const inProgressHeight = `${Math.round((item.inProgress / activityMax) * 100)}%`; return <div key={item.label} className="flex h-full flex-1 flex-col justify-end"><div className="flex min-h-0 flex-1 flex-col justify-end"><div className="rounded-t-md bg-[#b8d8cc] transition-all" style={{ height: inProgressHeight }} /><div className="rounded-t-md bg-[#176b54] transition-all" style={{ height: executedHeight }} /></div><span className="mt-2 text-center text-[10px] text-muted-foreground">{item.label}</span><span className="mt-1 text-center text-[10px] font-semibold text-[#176b54]">{total && activityCurrency ? formatTreasuryAmount(total, activityCurrency) : "لا حركة"}</span></div>; })}</div><div className="mt-4 flex gap-5 text-xs text-muted-foreground"><span><i className="ml-1 inline-block h-2 w-2 rounded-full bg-[#176b54]" /> منفذ</span><span><i className="ml-1 inline-block h-2 w-2 rounded-full bg-[#b8d8cc]" /> قيد المعالجة</span></div></div>
              <div className="rounded-2xl border bg-card p-5 sm:p-6"><h3 className="font-display text-base font-extrabold">توزيع العملات</h3><p className="mt-1 text-xs text-muted-foreground">من إجمالي الالتزامات الحالية بحسب العملة.</p><div className="mt-6 flex items-center justify-center gap-7"><Donut segments={currencySegments} /><div className="space-y-4 text-xs">{currencySegments.length ? currencySegments.map((segment) => <div key={segment.label}><span className="ml-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />{segment.label} <b className="mr-2">{segment.percent}%</b></div>) : <p className="text-muted-foreground">لا توجد بيانات عملات بعد.</p>}</div></div></div>
            </div>
            <div className="mt-5 rounded-2xl border bg-card p-5 sm:p-6"><div className="flex items-center justify-between gap-4"><div><h3 className="font-display text-base font-extrabold">أحدث طلبات الصرف</h3><p className="mt-1 text-xs text-muted-foreground">تابع آخر الطلبات والتغييرات في دورة الاعتماد.</p></div><button type="button" onClick={() => setActive("requests")} className="shrink-0 text-sm font-bold text-[#176b54]">عرض كل الطلبات <ArrowUpLeft className="mr-1 inline" size={15} /></button></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[680px] text-right text-sm"><thead className="sr-only"><tr><th>الطلب</th><th>المبلغ</th><th>الحالة</th><th>التاريخ</th><th>تفاصيل</th></tr></thead><tbody>{requestsQuery.isLoading ? <tr><td className="py-10 text-center text-muted-foreground" colSpan={5}>جارٍ تحميل الطلبات…</td></tr> : recentRequests.length === 0 ? <tr><td className="py-10 text-center text-muted-foreground" colSpan={5}>لا توجد طلبات صرف بعد. ابدأ بإنشاء أول طلب.</td></tr> : recentRequests.map((request) => { const status = getRequestStatusPresentation(request.status); const tone = { neutral: "bg-slate-100 text-slate-700", warning: "bg-amber-100 text-amber-800", info: "bg-blue-100 text-blue-800", success: "bg-emerald-100 text-emerald-800", danger: "bg-red-100 text-red-800" }[status.tone]; return <tr key={request.id} className="border-b last:border-0"><td className="py-4 font-semibold">{request.title}<span className="mr-2 text-xs font-normal text-muted-foreground">{request.referenceNumber}</span></td><td className="py-4 font-display font-bold">{formatTreasuryAmount(request.amount, request.currency)}</td><td className="py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>{status.label}</span></td><td className="py-4 text-xs text-muted-foreground">{new Date(request.createdAt).toLocaleDateString("ar-SA")}</td><td className="py-4"><button type="button" onClick={() => setActive("requests")} aria-label={`فتح طلب ${request.referenceNumber}`} className="rounded-lg p-1 text-[#176b54] hover:bg-[#e3f0eb]"><ReceiptText size={16} /></button></td></tr>; })}</tbody></table></div></div>
          </>}
        </section>
      </main>
      {showRequest && <RequestModal onClose={() => setShowRequest(false)} onCreated={() => setShowRequest(false)} />}
    </div>
  );
}
