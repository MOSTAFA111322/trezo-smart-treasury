const ones = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
const tens = ["", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const hundreds = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];

function underThousand(value: number): string {
  if (value === 0) return "";
  if (value < 10) return ones[value] ?? "";
  if (value < 20) {
    const special = ["عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
    return special[value - 10] ?? "";
  }
  const h = Math.floor(value / 100);
  const rest = value % 100;
  const parts: string[] = [];
  if (h) parts.push(hundreds[h] ?? "");
  if (rest) {
    const unit = rest % 10;
    const ten = Math.floor(rest / 10);
    if (unit && ten) parts.push(`${ones[unit]} و${tens[ten]}`);
    else parts.push(unit ? ones[unit] : tens[ten]);
  }
  return parts.join(" و");
}

export function amountInArabicWords(amount: number, currency = "SAR"): string {
  if (!Number.isFinite(amount) || amount < 0) return "";
  const integer = Math.floor(amount);
  const fraction = Math.round((amount - integer) * 100);
  const groups = [integer % 1000, Math.floor(integer / 1000) % 1000, Math.floor(integer / 1_000_000) % 1000];
  const parts: string[] = [];
  if (groups[2]) parts.push(`${underThousand(groups[2])} مليون`);
  if (groups[1]) parts.push(`${underThousand(groups[1])} ألف`);
  if (groups[0]) parts.push(underThousand(groups[0]));
  const currencyName = currency === "USD" ? "دولار أمريكي" : currency === "EUR" ? "يورو" : "ريال سعودي";
  const base = parts.length ? `${parts.join(" و")} ${currencyName}` : `صفر ${currencyName}`;
  return fraction ? `${base} و${underThousand(fraction)} هللة` : base;
}
