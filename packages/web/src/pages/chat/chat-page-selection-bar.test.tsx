import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "~/i18n/i18n";
import { ChatPageSelectionBar } from "./chat-page-selection-bar.ui";

describe("ChatPageSelectionBar", () => {
  beforeEach(() => {
    setLocale("en");
  });

  it("keeps a complete neutral surface when rendered standalone", () => {
    render(
      <ChatPageSelectionBar
        selectedCount={1}
        forwardDisabled={false}
        deleteDisabled={false}
        onForward={vi.fn()}
        onDelete={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const toolbar = screen.getByRole("toolbar", { name: "Selected: 1" });
    expect(toolbar).toHaveClass(
      "rounded-xl",
      "border",
      "border-border-subtle",
      "bg-composer-outer",
      "px-6",
      "py-2.5",
    );
    expect(toolbar.querySelector('[data-notice-marker="info"]')).toHaveClass("bg-accent");
    expect(within(toolbar).getByText("1 message")).toHaveClass(
      "pl-1",
      "text-base",
      "font-semibold",
      "text-text-primary",
    );
  });

  it("uses joined corners and a divider between neighboring surfaces", () => {
    render(
      <ChatPageSelectionBar
        selectedCount={2}
        forwardDisabled={false}
        deleteDisabled={false}
        onForward={vi.fn()}
        onDelete={vi.fn()}
        onCancel={vi.fn()}
        joinedAbove
        joinedBelow
      />,
    );

    expect(screen.getByRole("toolbar")).toHaveClass(
      "rounded-none",
      "border-b",
      "border-border-subtle",
    );
    expect(screen.getByRole("toolbar")).not.toHaveClass("border", "border-t");
  });

  it("keeps semantic button tones and handlers", async () => {
    const user = userEvent.setup();
    const onForward = vi.fn();
    const onDelete = vi.fn();
    const onCancel = vi.fn();
    render(
      <ChatPageSelectionBar
        selectedCount={2}
        forwardDisabled={false}
        deleteDisabled={false}
        onForward={onForward}
        onDelete={onDelete}
        onCancel={onCancel}
      />,
    );

    const toolbar = screen.getByRole("toolbar");
    const forward = within(toolbar).getByRole("button", { name: "Forward" });
    const remove = within(toolbar).getByRole("button", { name: "Delete" });
    const cancel = within(toolbar).getByRole("button", { name: "Cancel" });
    expect(forward).toHaveClass("border-accent", "bg-accent/10");
    expect(remove).toHaveClass("border-danger", "text-danger");
    expect(cancel).toHaveClass("border-border-subtle", "text-text-primary");

    await user.click(forward);
    await user.click(remove);
    await user.click(cancel);
    expect(onForward).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("hides delete while bulk delete remains unavailable", () => {
    render(
      <ChatPageSelectionBar
        selectedCount={3}
        forwardDisabled={false}
        deleteDisabled
        onForward={vi.fn()}
        onDelete={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const toolbar = screen.getByRole("toolbar", { name: "Selected: 3" });
    expect(within(toolbar).getByRole("button", { name: "Forward" })).toBeInTheDocument();
    expect(within(toolbar).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("renders nothing without selected messages", () => {
    render(
      <ChatPageSelectionBar
        selectedCount={0}
        forwardDisabled
        deleteDisabled
        onForward={vi.fn()}
        onDelete={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });
});
