export type OatCompany = { id: number; name: string; prefix: string };
export type OatSequence = { fiscalYearId: number; companyId: number; prefix: string; nextValue: number; padding: number };
export type OatRequest = { companyId: number; currency: string; amount: number; status: "draft" | "review" | "approved" | "executed" };

export const oatCompanies: OatCompany[] = [
  { id: 101, name: "شركة ألف التجريبية", prefix: "ALPHA" },
  { id: 202, name: "شركة باء التجريبية", prefix: "BETA" },
];

export const oatSequences: OatSequence[] = oatCompanies.map((company) => ({
  fiscalYearId: 7,
  companyId: company.id,
  prefix: company.prefix,
  nextValue: 1,
  padding: 4,
}));

export const oatRequests: OatRequest[] = [
  { companyId: 101, currency: "YER", amount: 100000, status: "executed" },
  { companyId: 202, currency: "SAR", amount: 2500, status: "approved" },
  { companyId: 101, currency: "YER", amount: 75000, status: "review" },
];

export function totalsByCurrency(requests: readonly OatRequest[]) {
  return requests.reduce<Record<string, number>>((totals, request) => {
    totals[request.currency] = (totals[request.currency] ?? 0) + request.amount;
    return totals;
  }, {});
}

export function formatOatReference(sequence: OatSequence, fiscalYear: number) {
  return `${sequence.prefix}-${fiscalYear}-${String(sequence.nextValue).padStart(sequence.padding, "0")}`;
}
