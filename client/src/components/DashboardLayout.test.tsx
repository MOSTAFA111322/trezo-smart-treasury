import React from "react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  logout: vi.fn(),
  setLocation: vi.fn(),
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    loading: false,
    user: { name: "System Admin", email: "admin@example.com" },
    logout: mocks.logout,
  }),
}));

vi.mock("@/hooks/useMobile", () => ({ useIsMobile: () => false }));
vi.mock("wouter", () => ({ useLocation: () => ["/", mocks.setLocation] }));
vi.mock("@/components/ui/sidebar", () => ({
  Sidebar: ({ children }: React.PropsWithChildren) => <aside>{children}</aside>,
  SidebarContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  SidebarFooter: ({ children }: React.PropsWithChildren) => <footer>{children}</footer>,
  SidebarHeader: ({ children }: React.PropsWithChildren) => <header>{children}</header>,
  SidebarInset: ({ children }: React.PropsWithChildren) => <section>{children}</section>,
  SidebarMenu: ({ children }: React.PropsWithChildren) => <nav>{children}</nav>,
  SidebarMenuButton: ({ children, onClick }: React.PropsWithChildren<{ onClick?: () => void }>) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
  SidebarMenuItem: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  SidebarProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  SidebarTrigger: () => <button type="button">Toggle sidebar</button>,
  useSidebar: () => ({ state: "expanded", toggleSidebar: vi.fn() }),
}));

import DashboardLayout from "./DashboardLayout";

describe("DashboardLayout account actions", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opens the account menu and invokes logout from the visible menu item", async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole("button", { name: "فتح قائمة الحساب" }));
    expect(screen.getByTestId("logout-menu-item")).toBeInTheDocument();

    await user.click(screen.getByTestId("logout-menu-item"));
    expect(mocks.logout).toHaveBeenCalledTimes(1);
  });
});

function renderLayout() {
  return render(<DashboardLayout><div>content</div></DashboardLayout>);
}

