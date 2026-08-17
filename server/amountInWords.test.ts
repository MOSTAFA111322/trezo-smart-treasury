import { describe, expect, it } from "vitest";
import { amountInArabicWords } from "../shared/amountInWords";

describe("amountInArabicWords", () => {
  it("writes whole amounts with currency", () => {
    expect(amountInArabicWords(1250, "SAR")).toContain("ألف");
    expect(amountInArabicWords(1250, "SAR")).toContain("ريال سعودي");
  });

  it("writes fractional amounts", () => {
    expect(amountInArabicWords(100.5, "SAR")).toContain("هللة");
  });

  it("handles zero and supported currencies", () => {
    expect(amountInArabicWords(0, "USD")).toContain("صفر");
    expect(amountInArabicWords(24, "EUR")).toContain("يورو");
  });
});
