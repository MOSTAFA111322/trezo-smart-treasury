import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, FileText, RefreshCw } from "lucide-react";
import { jsPDF } from "jspdf";
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
  const logExport = trpc.reports.logExport.useMutation();
  const rows = report.data ?? [];
  const totalAmount = rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const statusCounts = rows.reduce<Record<string, number>>((counts, row) => { counts[row.status] = (counts[row.status] ?? 0) + 1; return counts; }, {});
  const currencyCounts = rows.reduce<Record<string, number>>((counts, row) => { counts[row.currency] = (counts[row.currency] ?? 0) + 1; return counts; }, {});
  const summaryLabel = Object.entries(currencyCounts).map(([currency, count]) => `${currency}: ${count}`).join(" · ");
  const scope = [companyId ? "company" : "all-companies", fiscalYearId ? "year" : "all-years"].join("-");
  const exportReport = async () => { await logExport.mutateAsync({ format: "csv", ...filters, recordCount: rows.length }); downloadCsv(financialReportCsv(rows), `trezo-financial-report-${scope}.csv`); };
  const exportPdf = async () => {
    await logExport.mutateAsync({ format: "pdf", ...filters, recordCount: rows.length });
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFontSize(16); doc.text("TREZO Smart Treasury", 14, 16);
    doc.setFontSize(11); doc.text("Official Financial Disbursement Report", 14, 23);
    doc.setFontSize(9); doc.text("OFFICIAL / APPROVED REPORT", 14, 30);
    doc.setFontSize(8); doc.text(`Scope: ${companyId ? `Company #${companyId}` : "All companies"} | ${fiscalYearId ? `Fiscal year #${fiscalYearId}` : "All fiscal years"}`, 14, 35);
    doc.setFontSize(8); doc.text(`Summary: ${rows.length} records | Total amount: ${totalAmount.toLocaleString("en-US")} | ${summaryLabel || "No currency data"}`, 14, 40);
    doc.setFontSize(7); doc.text(`Prepared by TREZO Smart Treasury · Generated ${new Date().toISOString()} · Approval status: System export audit recorded`, 14, 45);
    const headers = ["Reference", "Company", "Fiscal year", "Beneficiary", "Title", "Amount", "Currency", "Status", "Scheduled", "Created"];
    const x = [14, 43, 78, 101, 132, 191, 217, 235, 258, 280];
    const drawTableHeader = () => { doc.setFontSize(7); headers.forEach((header, index) => doc.text(header, x[index], 50)); doc.line(14, 52, 284, 52); };
    drawTableHeader();
    rows.forEach((row, rowIndex) => {
      const pageRow = rowIndex % 28;
      if (rowIndex > 0 && pageRow === 0) { doc.addPage(); drawTableHeader(); }
      const y = 58 + pageRow * 7;
      const values = [row.referenceNumber, row.companyName, String(row.fiscalYear), row.beneficiaryName, row.title, row.amount, row.currency, row.status, row.scheduledFor ? new Date(row.scheduledFor).toISOString().slice(0, 10) : "-", new Date(row.createdAt).toISOString().slice(0, 10)];
      values.forEach((value, index) => doc.text(String(value ?? "-").slice(0, index === 4 ? 32 : 18), x[index], y));
      doc.setDrawColor(225); doc.line(14, y + 2, 284, y + 2); doc.setDrawColor(0);
    });
    doc.setFontSize(8); doc.text(`Generated ${new Date().toISOString()} | Records: ${rows.length} | Official audit event recorded`, 14, 260);
    doc.save(`trezo-financial-report-${scope}.pdf`);
  };

  return <section className="mb-5 rounded-2xl border bg-card p-5 shadow-sm sm:p-6" aria-labelledby="financial-export-title">
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><div className="flex items-center gap-2 text-primary"><FileSpreadsheet size={20}/><h3 id="financial-export-title" className="font-display text-lg font-extrabold">تصدير التقرير المالي</h3></div><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">صدّر سجل طلبات الصرف بصيغة CSV أو PDF رسمي بعد التصفية حسب الشركة والسنة المالية. لا يشمل التصدير أي أسعار صرف تقديرية، ويُظهر PDF نطاق التقرير وتاريخ إنشائه.</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={!rows.length || report.isLoading || logExport.isPending} onClick={() => void exportReport()} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"><Download size={17}/>{report.isLoading ? "جارٍ تجهيز التقرير…" : "تنزيل CSV"}</button><button type="button" disabled={!rows.length || report.isLoading || logExport.isPending} onClick={() => void exportPdf()} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-primary/30 px-4 py-3 text-sm font-bold text-primary transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"><FileText size={17}/>تنزيل PDF رسمي</button></div></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-muted-foreground">الشركة<select value={companyId ?? ""} onChange={(event) => setCompanyId(event.target.value ? Number(event.target.value) : undefined)} className="mt-2 w-full rounded-xl border bg-background px-3 py-3 text-sm text-foreground"><option value="">كل الشركات</option>{(companies.data ?? []).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label><label className="text-xs font-bold text-muted-foreground">السنة المالية<select value={fiscalYearId ?? ""} onChange={(event) => setFiscalYearId(event.target.value ? Number(event.target.value) : undefined)} className="mt-2 w-full rounded-xl border bg-background px-3 py-3 text-sm text-foreground"><option value="">كل السنوات</option>{(fiscalYears.data ?? []).map((year) => <option key={year.id} value={year.id}>{year.label}</option>)}</select></label></div>
    {report.error ? <div className="mt-4 flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"><span>تعذر تجهيز التقرير: {report.error.message}</span><button type="button" onClick={() => void report.refetch()} className="inline-flex items-center gap-2 self-start rounded-lg border border-destructive/30 px-3 py-2 text-xs font-bold"><RefreshCw size={14}/>إعادة المحاولة</button></div> : <>{rows.length ? <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-secondary/70 p-3"><p className="text-[11px] text-muted-foreground">عدد السجلات</p><p className="mt-1 text-xl font-extrabold">{rows.length}</p></div><div className="rounded-xl bg-primary/10 p-3"><p className="text-[11px] text-muted-foreground">إجمالي القيم المسجلة</p><p className="mt-1 text-xl font-extrabold text-primary">{totalAmount.toLocaleString("en-US")}</p></div><div className="rounded-xl bg-amber-500/10 p-3"><p className="text-[11px] text-muted-foreground">منفذة · قيد المراجعة</p><p className="mt-1 text-xl font-extrabold text-amber-700 dark:text-amber-300">{statusCounts.executed ?? 0} · {statusCounts.review ?? 0}</p></div></div> : null}<p className="mt-4 text-sm text-muted-foreground">{report.isLoading ? "جارٍ تطبيق التصفية…" : rows.length ? `${rows.length} سجل جاهز للتصدير وفق التصفية الحالية.` : "لا توجد سجلات مطابقة للتصفية الحالية."}</p></>}
  </section>;
}
