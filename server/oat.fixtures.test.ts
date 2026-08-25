import { describe, expect, it } from "vitest";
import { formatOatReference, oatCompanies, oatRequests, oatSequences, totalsByCurrency } from "./oat.fixtures";

describe("automatable OAT fixtures", () => {
  it("keeps company reference sequences isolated", () => {
    const alpha = oatSequences.find((sequence) => sequence.companyId === oatCompanies[0].id);
    const beta = oatSequences.find((sequence) => sequence.companyId === oatCompanies[1].id);
    expect(alpha).toBeDefined();
    expect(beta).toBeDefined();
    expect(formatOatReference(alpha!, 2026)).toBe("ALPHA-2026-0001");
    expect(formatOatReference(beta!, 2026)).toBe("BETA-2026-0001");
  });

  it("reports each currency independently without exchange conversion", () => {
    expect(totalsByCurrency(oatRequests)).toEqual({ YER: 175000, SAR: 2500 });
  });
});
