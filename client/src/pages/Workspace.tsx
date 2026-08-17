import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Plus, Printer, Search, ShieldCheck } from "lucide-react";

type WorkspaceProps = { active: string; onBack: () => void };

const titles: Record<string, string> = { requests: "طلبات الصرف", calendar: "تقويم المدفوعات", entities: "الجهات والبيانات", reports: "التقارير والطباعة", audit: "سجل التدقيق", settings: "الإعدادات", users: "المستخدمون والصلاحيات" };

export default function Workspace({ active, onBack }: WorkspaceProps) {
  const title = titles[active] ?? "مساحة العمل";
  const [name, setName] = useState("");
  const companies = trpc.entities.companies.list.useQuery(undefined, { enabled: active === "entities" });
  const beneficiaries = trpc.entities.beneficiaries.list.useQuery(undefined, { enabled: active === "entities" });
  const banks = trpc.entities.banks.list.useQuery(undefined, { enabled: active === "entities" });
  const channels = trpc.entities.channels.list.useQuery(undefined, { enabled: active === "entities" });
  const requests = trpc.requests.list.useQuery(undefined, { enabled: active === "requests" });
  const calendar = trpc.calendar.list.useQuery(undefined, { enabled: active === "calendar" });
  const audit = trpc.audit.list.useQuery(undefined, { enabled: active === "audit" });
  const createCompany = trpc.entities.companies.create.useMutation({ onSuccess: () => { setName(""); void companies.refetch(); } });
  const createBank = trpc.entities.banks.create.useMutation({ onSuccess: () => { setName(""); void banks.refetch(); } });
  const createChannel = trpc.entities.channels.create.useMutation({ onSuccess: () => { setName(""); void channels.refetch(); } });
  const submitEntity = () => { if (!name.trim()) return; if (active === "entities") void createCompany.mutate({ name, defaultCurrency: "SAR" }); };

  return <section className="mx-auto max-w-[1500px] p-5 sm:p-8">
    <button onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-[#176b54]"><ArrowRight size={16}/> العودة للوحة الرئيسية</button>
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-semibold text-[#176b54]">مساحة العمل</p><h2 className="mt-1 font-display text-3xl font-extrabold">{title}</h2><p className="mt-2 text-sm text-muted-foreground">إدارة منظمة ومراجعة واضحة لكل عناصر الخزينة.</p></div>{active === "reports" && <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-[#176b54] px-4 py-3 text-sm font-bold text-white"><Printer size={17}/> معاينة الطباعة</button>}</div>
    {active === "entities" && <div className="grid gap-5 lg:grid-cols-2"><EntityList title="الشركات" items={companies.data ?? []} onAdd={() => createCompany.mutate({ name: name || "شركة جديدة", defaultCurrency: "SAR" })}/><EntityList title="المستفيدون" items={beneficiaries.data ?? []}/><EntityList title="البنوك" items={banks.data ?? []} onAdd={() => createBank.mutate({ name: name || "بنك جديد" })}/><EntityList title="قنوات الصرف" items={channels.data ?? []} onAdd={() => createChannel.mutate({ name: name || "قناة جديدة", code: `CH-${Date.now()}` })}/><div className="lg:col-span-2 rounded-2xl border bg-card p-5"><label className="text-sm font-semibold">اسم الكيان الجديد</label><div className="mt-2 flex gap-2"><input value={name} onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1 rounded-xl border bg-background px-3 py-3" placeholder="أدخل الاسم ثم اختر نوع الإنشاء من البطاقات"/><Search size={18} className="mt-3 -mr-9 text-muted-foreground"/></div><p className="mt-2 text-xs text-muted-foreground">سيتم تفعيل نماذج الحقول المتخصصة والربط البنكي في المرحلة التالية.</p></div></div>}
    {active === "requests" && <DataTable title="آخر طلبات الصرف" rows={(requests.data ?? []).map((r) => [r.referenceNumber, r.title, `${r.amount} ${r.currency}`, r.status])}/>} 
    {active === "calendar" && <DataTable title="الاستحقاقات القادمة" rows={(calendar.data ?? []).map((r) => [r.title, `${r.amount} ${r.currency}`, new Date(r.dueDate).toLocaleDateString("ar-SA"), r.convertedRequestId ? "تم التحويل" : "مجدول"])} />}
    {active === "audit" && <DataTable title="آخر العمليات المسجلة" rows={(audit.data ?? []).map((r) => [r.action, r.entityType, r.entityId ?? "—", new Date(r.createdAt).toLocaleString("ar-SA")])}/>} 
    {active === "reports" && <div className="rounded-2xl border bg-card p-8 print:border-0"><h3 className="font-display text-xl font-extrabold">مركز التقارير والطباعة</h3><p className="mt-2 text-sm text-muted-foreground">اختر معاينة الطباعة لإنشاء نسخة ورقية من التقرير الحالي. القوالب التفصيلية ستتوسع في المرحلة التالية.</p><div className="mt-8 grid gap-4 sm:grid-cols-2"><ReportTile title="أمر صرف"/><ReportTile title="إيصال استلام"/><ReportTile title="تقرير المدفوعات"/><ReportTile title="ملخص الخزينة"/></div></div>}
    {(active === "users" || active === "settings") && <div className="rounded-2xl border bg-card p-8"><ShieldCheck className="text-[#176b54]" size={28}/><h3 className="mt-4 font-display text-xl font-extrabold">أساس أمني جاهز للتوسع</h3><p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">تستخدم هذه المساحة المصادقة المركزية والصلاحيات المحمية في الخادم. ستتم إضافة إدارة الأدوار الدقيقة وإعدادات السنوات والعملات في المرحلة التالية دون كشف أي مفاتيح أو بيانات حساسة للمتصفح.</p></div>}
  </section>;
}

function EntityList({ title, items, onAdd }: { title: string; items: Array<{ id: number; name?: string; code?: string }>; onAdd?: () => void }) { return <div className="rounded-2xl border bg-card p-5"><div className="flex items-center justify-between"><h3 className="font-display text-lg font-extrabold">{title}</h3>{onAdd && <button onClick={onAdd} className="inline-flex items-center gap-1 rounded-lg bg-[#e2f1eb] px-3 py-2 text-xs font-bold text-[#176b54]"><Plus size={14}/> إضافة</button>}</div><div className="mt-4 space-y-2">{items.length ? items.map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl bg-[#f7faf8] px-3 py-3 text-sm"><span>{item.name ?? item.code ?? `#${item.id}`}</span><span className="font-display text-xs text-muted-foreground">#{item.id}</span></div>) : <p className="py-5 text-sm text-muted-foreground">لا توجد بيانات مسجلة بعد.</p>}</div></div>; }
function DataTable({ title, rows }: { title: string; rows: string[][] }) { return <div className="overflow-hidden rounded-2xl border bg-card"><div className="border-b p-5"><h3 className="font-display text-lg font-extrabold">{title}</h3></div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-right text-sm"><tbody>{rows.length ? rows.map((row, index) => <tr key={`${row[0]}-${index}`} className="border-b last:border-0">{row.map((cell, cellIndex) => <td key={cellIndex} className={`px-5 py-4 ${cellIndex === 0 ? "font-semibold" : "text-muted-foreground"}`}>{cell}</td>)}</tr>) : <tr><td className="px-5 py-12 text-center text-muted-foreground">لا توجد سجلات متاحة.</td></tr>}</tbody></table></div></div>; }
function ReportTile({ title }: { title: string }) { return <button onClick={() => window.print()} className="rounded-xl border p-5 text-right transition hover:border-[#176b54] hover:bg-[#f4faf7]"><p className="font-bold">{title}</p><p className="mt-1 text-xs text-muted-foreground">معاينة ثم طباعة</p></button>; }
