import { jsPDF } from "jspdf";
import { financialReportCsv, financialReportExcelHtml, type FinancialExportRow } from "@shared/financialReport";

export type RequestExportSourceRow = {
  referenceNumber: string;
  title: string;
  amount: string | number;
  currency: string;
  status: string;
  companyId?: number;
  beneficiaryId?: number;
  scheduledFor?: Date | null;
  createdAt?: Date;
};

export type RequestExportLookups = {
  companyName: (id?: number) => string;
  beneficiaryName: (id?: number) => string;
  fiscalYear?: number;
};

export function toFinancialExportRows(rows: RequestExportSourceRow[], lookups: RequestExportLookups): FinancialExportRow[] {
  return rows.map((row) => ({
    referenceNumber: row.referenceNumber,
    companyName: lookups.companyName(row.companyId),
    fiscalYear: lookups.fiscalYear ?? row.createdAt?.getFullYear() ?? new Date().getFullYear(),
    beneficiaryName: lookups.beneficiaryName(row.beneficiaryId),
    title: row.title,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    scheduledFor: row.scheduledFor ?? null,
    createdAt: row.createdAt ?? new Date(0),
  }));
}

export function currencySummary(rows: FinancialExportRow[]): string {
  const totals = new Map<string, number>();
  rows.forEach((row) => totals.set(row.currency, (totals.get(row.currency) ?? 0) + Number(row.amount ?? 0)));
  return Array.from(totals.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([currency, total]) => `${currency}: ${total.toLocaleString("en-US", { maximumFractionDigits: 4 })}`).join(" · ");
}

export function downloadTextFile(contents: string, filename: string, mimeType: string): void {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadExcel(rows: FinancialExportRow[], filename: string, title = "TREZO Smart Treasury"): void {
  downloadTextFile(`\ufeff${financialReportExcelHtml(rows, title)}`, filename, "application/vnd.ms-excel;charset=utf-8");
}

export function downloadCsv(rows: FinancialExportRow[], filename: string): void {
  downloadTextFile(`\ufeff${financialReportCsv(rows)}`, filename, "text/csv;charset=utf-8");
}

export function downloadPdf(rows: FinancialExportRow[], filename: string, scopeLabel = "All current filters"): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFontSize(16);
  doc.text("TREZO Smart Treasury", 14, 16);
  doc.setFontSize(11);
  doc.text("Official Financial Disbursement Report", 14, 23);
  doc.setFontSize(9);
  doc.text("OFFICIAL / APPROVED REPORT", 14, 30);
  doc.setFontSize(8);
  doc.text(`Scope: ${scopeLabel}`, 14, 35);
  doc.text(`Summary: ${rows.length} records | ${currencySummary(rows) || "No currency data"}`, 14, 40);
  doc.setFontSize(7);
  doc.text(`Prepared by TREZO Smart Treasury · Generated ${new Date().toISOString()} · Approval status: System export audit recorded`, 14, 45);
  const headers = ["Reference", "Company", "Fiscal year", "Beneficiary", "Title", "Amount", "Currency", "Status", "Scheduled", "Created"];
  const x = [14, 43, 78, 101, 132, 191, 217, 235, 258, 280];
  const drawTableHeader = () => {
    doc.setFontSize(7);
    headers.forEach((header, index) => doc.text(header, x[index], 50));
    doc.line(14, 52, 284, 52);
  };
  drawTableHeader();
  rows.forEach((row, rowIndex) => {
    const pageRow = rowIndex % 28;
    if (rowIndex > 0 && pageRow === 0) {
      doc.addPage();
      drawTableHeader();
    }
    const y = 58 + pageRow * 7;
    const values = [row.referenceNumber, row.companyName, String(row.fiscalYear), row.beneficiaryName, row.title, row.amount, row.currency, row.status, row.scheduledFor ? row.scheduledFor.toISOString().slice(0, 10) : "-", row.createdAt.toISOString().slice(0, 10)];
    values.forEach((value, index) => doc.text(String(value ?? "-").slice(0, index === 4 ? 32 : 18), x[index], y));
    doc.setDrawColor(225);
    doc.line(14, y + 2, 284, y + 2);
    doc.setDrawColor(0);
  });
  doc.setFontSize(8);
  doc.text(`Generated ${new Date().toISOString()} | Records: ${rows.length} | Official audit event recorded`, 14, 260);
  doc.save(filename);
}
