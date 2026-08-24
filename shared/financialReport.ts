export type FinancialExportRow = {
  referenceNumber: string;
  companyName: string;
  fiscalYear: number;
  beneficiaryName: string;
  title: string;
  amount: number | string;
  currency: string;
  status: string;
  scheduledFor: Date | null;
  createdAt: Date;
};

function escapeCsv(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function formatDate(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

const financialReportHeaders = ["المرجع", "الشركة", "السنة المالية", "المستفيد", "الوصف", "المبلغ", "العملة", "الحالة", "تاريخ الصرف", "تاريخ الإنشاء"];

function financialReportRecords(rows: FinancialExportRow[]): Array<Array<string | number>> {
  return rows.map((row) => [row.referenceNumber, row.companyName, row.fiscalYear, row.beneficiaryName, row.title, row.amount, row.currency, row.status, formatDate(row.scheduledFor), formatDate(row.createdAt)]);
}

export function financialReportCsv(rows: FinancialExportRow[]): string {
  return [financialReportHeaders, ...financialReportRecords(rows)].map((record) => record.map(escapeCsv).join(",")).join("\r\n");
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/** Excel-compatible workbook HTML; opens in Excel while preserving Arabic RTL and column labels. */
export function financialReportExcelHtml(rows: FinancialExportRow[], title = "TREZO Smart Treasury"): string {
  const header = financialReportHeaders.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("");
  const body = financialReportRecords(rows).map((record) => `<tr>${record.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif;direction:rtl}table{border-collapse:collapse;width:100%}th,td{border:1px solid #b7c7c1;padding:6px;text-align:right}th{background:#0b241c;color:#fff;font-weight:700}td{mso-number-format:"\\@"}</style></head><body><h2>${escapeHtml(title)}</h2><table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}
