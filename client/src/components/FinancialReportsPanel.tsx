import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { financialReportCsv } from "@shared/financialReport";

function downloadCsv(contents: string, filename: string) {
  const blob = new Blob(["\ufeff", contents], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function FinancialReportsPanel() {
  const [companyId, setCompanyId] = useState<number | undefined>();
  const [fiscalYearId, setFiscalYearId] = useState<number | undefined>();
  const filters = useMemo(() => ({ ...(companyId ? { companyId } : {}), ...(fiscalYearId ? { fiscalYearId } : {}) }), [companyId, fiscalYearId]);
  const companies = trpc.entities.companies.list.useQuery();
  const fiscalYears = trpc.settings.fiscalYears.useQuery();
  const report = trpc.reports.financial.useQuery(filters);
  const rows = report.data ?? [];
  const exportReport = () => {
    const scope = [companyId ? "company" : "all-companies", fiscalYearId ? "year" : "all-years"].join("-");
    downloadCsv(financialReportCsv(rows), `trezo-financial-report-${scope}.csv`);
  };

  return <section className="mb-5 rounded-2xl border bg-card p-5 shadow-sm sm:p-6" aria-labelledby="financial-export-title">
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><div className="flex items-center gap-2 text-primary"><FileSpreadsheet size={20}/><h3 id="financial-export-title" className="font-display text-lg font-extrabold">تصدير التقرير المالي</h3></div><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">صدّر سجل طلبات الصرف بصيغة CSV بعد التصفية حسب الشركة والسنة المالية. لا يشمل التصدير أي أسعار صرف تقديرية.</p></div><button type="button" disabled={!rows.length || report.isLoading} onClick={exportReport} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"><Download size={17}/>{report.isLoading ? "جارٍ تجهيز التقرير…" : "تنزيل CSV"}</button></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-muted-foreground">الشركة<select value={companyId ?? ""} onChange={(event) => setCompanyId(event.target.value ? Number(event.target.value) : undefined)} className="mt-2 w-full rounded-xl border bg-background px-3 py-3 text-sm text-foreground"><option value="">كل الشركات</option>{(companies.data ?? []).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label><label className="text-xs font-bold text-muted-foreground">السنة المالية<select value={fiscalYearId ?? ""} onChange={(event) => setFiscalYearId(event.target.value ? Number(event.target.value) : undefined)} className="mt-2 w-full rounded-xl border bg-background px-3 py-3 text-sm text-foreground"><option value="">كل السنوات</option>{(fiscalYears.data ?? []).map((year) => <option key={year.id} value={year.id}>{year.label}</option>)}</select></label></div>
    {report.error ? <div className="mt-4 flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"><span>تعذر تجهيز التقرير: {report.error.message}</span><button type="button" onClick={() => void report.refetch()} className="inline-flex items-center gap-2 self-start rounded-lg border border-destructive/30 px-3 py-2 text-xs font-bold"><RefreshCw size={14}/>إعادة المحاولة</button></div> : <p className="mt-4 text-sm text-muted-foreground">{report.isLoading ? "جارٍ تطبيق التصفية…" : rows.length ? `${rows.length} سجل جاهز للتصدير وفق التصفية الحالية.` : "لا توجد سجلات مطابقة للتصفية الحالية."}</p>}
  </section>;
}
