import React from "react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { OperationalInbox } from "./OperationalInbox";

describe("OperationalInbox", () => {
  it("does not present a generic queue as an action assigned to the current user", () => {
    render(
      <OperationalInbox
        requests={[{ id: 1, title: "مسودة محاسب", referenceNumber: "TRZ-001", status: "draft", amount: 1250, currency: "YER", createdAt: new Date("2026-08-28T00:00:00.000Z") }]}
        onOpenRequests={vi.fn()}
        onCreateRequest={vi.fn()}
      />
    );

    expect(screen.getByText("مسودات وإعادات")).toBeInTheDocument();
    expect(screen.queryByText("يحتاج إجراء منك")).not.toBeInTheDocument();
    expect(screen.getByText(/فلتر «بانتظار إجراءي»/)).toBeInTheDocument();
  });
});
