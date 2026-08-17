import { describe, expect, it } from "vitest";
import { hasPermission } from "@shared/permissions";

describe("role permissions", () => {
  it("keeps approval and user management restricted to admins", () => {
    expect(hasPermission("user", "requests.approve")).toBe(false);
    expect(hasPermission("user", "users.manage")).toBe(false);
    expect(hasPermission("admin", "requests.approve")).toBe(true);
    expect(hasPermission("admin", "users.manage")).toBe(true);
  });
});
