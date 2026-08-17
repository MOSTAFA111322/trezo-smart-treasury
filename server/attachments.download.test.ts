import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn() }));

import { appRouter } from "./routers";
import { getDb } from "./db";

type Role = "user" | "admin";

function context(role: Role, id: number) {
  return {
    user: { id, openId: `user-${id}`, name: "Test", email: `user${id}@example.com`, loginMethod: "test", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as never,
    res: {} as never,
  };
}

function mockAttachmentDb(ownerId: number) {
  const limit = vi.fn().mockResolvedValue([{ attachment: { fileName: "invoice.pdf", mimeType: "application/pdf", storageKey: "requests/1/invoice.pdf" }, requestCreatedBy: ownerId }]);
  const where = vi.fn().mockReturnValue({ limit });
  const innerJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ innerJoin });
  return { select: vi.fn().mockReturnValue({ from }) };
}

describe("attachments.download route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a non-owner", async () => {
    vi.mocked(getDb).mockResolvedValue(mockAttachmentDb(9) as never);
    const caller = appRouter.createCaller(context("user", 7) as never);
    await expect(caller.attachments.download({ attachmentId: 1 })).rejects.toThrow("لا تملك صلاحية تنزيل هذا المرفق");
  });

  it("returns a protected download descriptor for the owner and admin", async () => {
    vi.mocked(getDb).mockResolvedValue(mockAttachmentDb(7) as never);
    const ownerResult = await appRouter.createCaller(context("user", 7) as never).attachments.download({ attachmentId: 1 });
    expect(ownerResult).toEqual({ fileName: "invoice.pdf", mimeType: "application/pdf", url: "/manus-storage/requests/1/invoice.pdf" });

    vi.mocked(getDb).mockResolvedValue(mockAttachmentDb(9) as never);
    const adminResult = await appRouter.createCaller(context("admin", 7) as never).attachments.download({ attachmentId: 1 });
    expect(adminResult.fileName).toBe("invoice.pdf");
  });
});
