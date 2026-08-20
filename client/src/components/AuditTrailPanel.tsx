import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, RefreshCw, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";

type AuditRow = {
  id: number;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: Date | string;
};

type AuditTrailPanelProps = {
  rows: AuditRow[];
  isLoading: boolean;
  error?: { message: string } | null;
  onRetry: () => void;
  action: string;
  from: string;
  to: string;
  onActionChange: (value: string) => void;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
};

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export function AuditTrailPanel({ rows, isLoading, error, onRetry, action, from, to, onActionChange, onFromChange, onToChange }: AuditTrailPanelProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const logExport = trpc.audit.logExport.useMutation();
  const filteredRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return rows.filter((row) => !query || [row.action, row.entityType, row.entityId ?? ""].some((value) => value.toLocaleLowerCase().includes(query)));
  }, [rows, search]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const exportCsv = async () => {
    const header = ["الإجراء", "نوع الكيان", "معرّف الكيان", "التاريخ"];
    const body = filteredRows.map((row) => [row.action, row.entityType, row.entityId ?? "", new Date(row.createdAt).toLocaleString("ar-SA")]);
    const csv = [header, ...body].map((line) => line.map(csvCell).join(",")).join("\n");
    await logExport.mutateAsync({ recordCount: filteredRows.length, filters: { search: search.trim() || undefined } });
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `trezo-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">جارٍ تحميل سجل التدقيق…</div>;
  if (error) return <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-8 text-center"><p className="text-sm font-bold text-destructive">تعذر تحميل سجل التدقيق</p><p className="mt-2 text-sm text-destructive/90">{error.message}</p><button onClick={onRetry} className="mt-5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">إعادة المحاولة</button></div>;

  return <div className="space-y-3">
    <div className="rounded-2xl border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="flex min-w-0 items-center gap-2 rounded-xl border bg-background px-3 py-2 text-sm lg:col-span-2"><Search size={16} className="text-primary"/><span className="sr-only">البحث في سجل التدقيق</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="بحث نصي…" className="min-w-0 flex-1 bg-transparent outline-none"/></label>
        <select value={action} onChange={(event) => onActionChange(event.target.value)} aria-label="إجراء التدقيق" className="rounded-xl border bg-background px-3 py-2 text-sm"><option value="">كل الإجراءات</option><option value="exchange_rate.approve">اعتماد سعر صرف</option><option value="overdue_alert.retry">إعادة إرسال تنبيه</option><option value="report.export.pdf">تصدير PDF</option><option value="report.export.csv">تصدير CSV</option></select>
        <input type="date" value={from} onChange={(event) => onFromChange(event.target.value)} aria-label="من تاريخ التدقيق" className="rounded-xl border bg-background px-3 py-2 text-sm"/>
        <input type="date" value={to} onChange={(event) => onToChange(event.target.value)} aria-label="إلى تاريخ التدقيق" className="rounded-xl border bg-background px-3 py-2 text-sm"/>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">يعرض المركز آخر السجلات المتاحة، مع تقسيمها إلى صفحات وتسجيل كل تصدير في سجل التدقيق.</p><button type="button" onClick={() => void exportCsv()} disabled={!filteredRows.length || logExport.isPending} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"><Download size={15}/>{logExport.isPending ? "جارٍ تجهيز التصدير…" : "تصدير سجل التدقيق CSV"}</button></div>
      {logExport.error ? <p role="alert" className="mt-3 text-xs font-semibold text-destructive">تعذر تسجيل التصدير: {logExport.error.message}</p> : null}
    </div>
    {!rows.length ? <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">لا توجد أحداث تدقيق مسجلة بعد.</div> : !filteredRows.length ? <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-10 text-center text-sm text-amber-800 dark:text-amber-200">لا توجد نتائج مطابقة للبحث أو المرشحات الحالية. جرّب توسيع الفترة أو اختيار كل الإجراءات.</div> : <>
      <div className="overflow-hidden rounded-2xl border bg-card"><div className="border-b p-5"><h3 className="font-display text-lg font-extrabold">آخر العمليات المسجلة · {filteredRows.length} نتيجة</h3></div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-right text-sm"><tbody>{pageRows.map((row) => <tr key={row.id} className="border-b last:border-0"><td className="px-5 py-4 font-semibold">{row.action}</td><td className="px-5 py-4 text-muted-foreground">{row.entityType}</td><td className="px-5 py-4 text-muted-foreground">{row.entityId ?? "—"}</td><td className="px-5 py-4 text-muted-foreground">{new Date(row.createdAt).toLocaleString("ar-SA")}</td></tr>)}</tbody></table></div></div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4"><span className="text-xs font-semibold text-muted-foreground">صفحة {currentPage} من {totalPages}</span><div className="flex items-center gap-2"><button type="button" aria-label="الصفحة السابقة" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1} className="rounded-lg border p-2 disabled:opacity-40"><ChevronRight size={16}/></button><button type="button" aria-label="الصفحة التالية" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={currentPage === totalPages} className="rounded-lg border p-2 disabled:opacity-40"><ChevronLeft size={16}/></button><button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold"><RefreshCw size={14}/> تحديث</button></div></div>
    </>}
  </div>;
}
