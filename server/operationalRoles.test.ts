import { describe, expect, it } from "vitest";
import { getOperationalProfiles } from "@shared/permissions";

describe("operational role profiles", () => {
  it("exposes the five enterprise workflow roles with Arabic labels", () => {
    const profiles = getOperationalProfiles();

    expect(profiles.map((profile) => profile.key)).toEqual(["accountant", "reviewer", "cfo", "gm", "auditor"]);
    expect(profiles.every((profile) => profile.label.length > 0 && profile.description.length > 0)).toBe(true);
    expect(new Set(profiles.map((profile) => profile.key)).size).toBe(profiles.length);
  });
});
