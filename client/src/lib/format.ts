export type CurrencyDefinition = {
  code: string;
  decimals?: number | null;
};

export function formatCurrencyAmount(amount: number | string | null | undefined, currency: string, currencies: CurrencyDefinition[] = []) {
  const definition = currencies.find((item) => item.code === currency);
  const decimals = Math.min(6, Math.max(0, Number(definition?.decimals ?? 2)));
  const numericAmount = Number(amount ?? 0);
  if (!Number.isFinite(numericAmount)) return "—";
  return numericAmount.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
