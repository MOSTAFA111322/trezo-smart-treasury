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

export function financialReportCsv(rows: FinancialExportRow[]): string {
  const header = ["المرجع", "الشركة", "السنة المالية", "المستفيد", "الوصف", "المبلغ", "العملة", "الحالة", "تاريخ الصرف", "تاريخ الإنشاء"];
  const records = rows.map((row) => [row.referenceNumber, row.companyName, row.fiscalYear, row.beneficiaryName, row.title, row.amount, row.currency, row.status, formatDate(row.scheduledFor), formatDate(row.createdAt)]);
  return [header, ...records].map((record) => record.map(escapeCsv).join(",")).join("\r\n");
}
