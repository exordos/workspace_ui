import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SidebarChatRowMeta } from "./sidebar-chat-row-meta.ui";

describe("SidebarChatRowMeta action slot", () => {
  it("renders unread badge by default when expand chevron is configured", () => {
    render(
      <div className="group/stream">
        <SidebarChatRowMeta
          unreadCount={5}
          expandChevron={{
            expanded: false,
            onToggle: vi.fn(),
            ariaLabel: "Expand topics",
          }}
        />
      </div>,
    );

    const badgeLayer = screen.getByTestId("sidebar-chat-row-unread-badge");
    const expandButton = screen.getByRole("button", { name: "Expand topics" });

    expect(screen.getByText("5")).toBeInTheDocument();
    expect(badgeLayer).toHaveClass("group-hover/stream:hidden");
    expect(expandButton).toHaveClass("hidden");
    expect(expandButton).toHaveClass("group-hover/stream:flex");
    expect(expandButton).toHaveClass("hover:bg-sidebar-hover/80");
    expect(expandButton).not.toHaveClass("bg-bg/60");
  });

  it("calls onToggle without bubbling when chevron is clicked", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();

    render(
      <div className="group/stream">
        <SidebarChatRowMeta
          unreadCount={2}
          expandChevron={{
            expanded: false,
            onToggle,
            ariaLabel: "Expand topics",
          }}
        />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Expand topics" }));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("renders only unread badge when expand chevron is absent", () => {
    render(<SidebarChatRowMeta unreadCount={3} />);

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("reserves slot for expand chevron when unread count is zero", () => {
    render(
      <div className="group/stream">
        <SidebarChatRowMeta
          expandChevron={{
            expanded: false,
            onToggle: vi.fn(),
            ariaLabel: "Expand topics",
          }}
        />
      </div>,
    );

    expect(screen.getByTestId("sidebar-chat-row-action-slot")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
