const ones = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
const tens = ["", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const hundreds = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];
const scales = ["", "ألف", "مليون", "مليار", "تريليون"];

function underThousand(value: number): string {
  if (value === 0) return "";
  if (value < 10) return ones[value] ?? "";
  if (value < 20) return ["عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"][value - 10] ?? "";
  const h = Math.floor(value / 100);
  const rest = value % 100;
  const parts: string[] = [];
  if (h) parts.push(hundreds[h] ?? "");
  if (rest) {
    const unit = rest % 10;
    const ten = Math.floor(rest / 10);
    parts.push(unit && ten ? `${ones[unit]} و${tens[ten]}` : unit ? ones[unit] : tens[ten]);
  }
  return parts.join(" و");
}

function integerWords(value: number): string {
  if (value === 0) return "صفر";
  const groups: string[] = [];
  let remaining = value;
  let scale = 0;
  while (remaining > 0 && scale < scales.length) {
    const group = remaining % 1000;
    if (group) groups.unshift(`${underThousand(group)}${scale ? ` ${scales[scale]}` : ""}`);
    remaining = Math.floor(remaining / 1000);
    scale += 1;
  }
  return groups.join(" و");
}

const currencies: Record<string, { major: string; minor: string; precision: number }> = {
  SAR: { major: "ريال سعودي", minor: "هللة", precision: 2 },
  USD: { major: "دولار أمريكي", minor: "سنت", precision: 2 },
  EUR: { major: "يورو", minor: "سنت", precision: 2 },
  AED: { major: "درهم إماراتي", minor: "فلس", precision: 2 },
  KWD: { major: "دينار كويتي", minor: "فلس", precision: 3 },
};

export function amountInArabicWords(amount: number, currency = "SAR"): string {
  if (!Number.isFinite(amount) || amount < 0) return "";
  const definition = currencies[currency] ?? { major: currency, minor: "جزء", precision: 2 };
  const factor = 10 ** definition.precision;
  const normalized = Math.round(amount * factor) / factor;
  const integer = Math.floor(normalized);
  const fraction = Math.round((normalized - integer) * factor);
  const base = `${integerWords(integer)} ${definition.major}`;
  return fraction ? `${base} و${integerWords(fraction)} ${definition.minor}` : base;
}
