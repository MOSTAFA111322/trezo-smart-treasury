import { describe, expect, it } from "vitest";

describe("owner notification configuration", () => {
  it("exposes the built-in notification feature flag", () => {
    expect(process.env.TREZO_NOTIFICATIONS_CONFIGURED).toBe("true");
  });
});

