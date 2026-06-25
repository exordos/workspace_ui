import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SidebarMessagePreview } from "./sidebar-message-preview.ui";

describe("SidebarMessagePreview", () => {
  it("uses muted root text so CSS ellipsis matches last-message color", () => {
    const { container } = render(
      <SidebarMessagePreview senderName="Notification Bot" message="Channel created" />,
    );

    const root = container.firstElementChild;
    expect(root).toHaveClass("truncate");
    expect(root).toHaveClass("text-text-muted");
    expect(screen.getByText("Notification Bot")).toHaveClass("text-sidebar-sender");
  });

  it("uses primary root text when typing style is applied to the message", () => {
    const { container } = render(
      <SidebarMessagePreview message="typing…" messageClassName="italic text-text-primary" />,
    );

    const root = container.firstElementChild;
    expect(root).toHaveClass("text-text-primary");
    expect(root).not.toHaveClass("text-text-muted");
  });

  it("keeps muted ellipsis color for dm-only previews without sender", () => {
    const { container } = render(
      <SidebarMessagePreview message="You chose to postpone the welcome video" />,
    );

    expect(container.firstElementChild).toHaveClass("text-text-muted");
  });
});
