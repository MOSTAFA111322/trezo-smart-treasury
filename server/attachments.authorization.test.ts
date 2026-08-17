import { describe, expect, it } from "vitest";
import { canAccessOwnedRequest } from "./routers";

describe("attachment request authorization", () => {
  it("denies a non-owner from accessing an attachment", () => {
    expect(canAccessOwnedRequest("user", 7, 9)).toBe(false);
  });

  it("allows the request owner and administrators", () => {
    expect(canAccessOwnedRequest("user", 7, 7)).toBe(true);
    expect(canAccessOwnedRequest("admin", 7, 9)).toBe(true);
  });
});
