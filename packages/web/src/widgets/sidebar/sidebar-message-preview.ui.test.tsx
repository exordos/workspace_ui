import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SidebarMessagePreview } from "./sidebar-message-preview.ui";

describe("SidebarMessagePreview", () => {
  it("uses secondary root text so CSS ellipsis matches last-message color", () => {
    const { container } = render(
      <SidebarMessagePreview senderName="Notification Bot" message="Channel created" />,
    );

    const root = container.firstElementChild;
    expect(root).toHaveClass("truncate");
    expect(root).toHaveClass("text-xs");
    expect(root).toHaveClass("font-normal");
    expect(root).toHaveClass("leading-5");
    expect(root).toHaveClass("text-text-secondary");
    expect(screen.getByText("Notification Bot")).toHaveClass("text-sidebar-sender");
  });

  it("uses primary root text when typing style is applied to the message", () => {
    const { container } = render(
      <SidebarMessagePreview message="typing…" messageClassName="italic text-text-primary" />,
    );

    const root = container.firstElementChild;
    expect(root).toHaveClass("text-text-primary");
    expect(root).not.toHaveClass("text-text-secondary");
  });

  it("keeps secondary ellipsis color for dm-only previews without sender", () => {
    const { container } = render(
      <SidebarMessagePreview message="You chose to postpone the welcome video" />,
    );

    expect(container.firstElementChild).toHaveClass("text-text-secondary");
  });

  it("reserves the preview line height when sender and message are missing", () => {
    // Empty divs ignore leading-5 — min-h-5 keeps topic rows equal to filled two-line rows.
    const { container } = render(<SidebarMessagePreview />);

    const root = container.firstElementChild;
    expect(root).not.toBeNull();
    expect(root).toHaveClass("min-h-5");
    expect(root).toHaveClass("leading-5");
    expect(root).toHaveClass("text-xs");
    expect(root?.textContent).toBe("");
  });
});
