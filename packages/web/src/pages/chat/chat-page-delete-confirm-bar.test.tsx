import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "~/i18n/i18n";
import { ChatPageDeleteConfirmBar } from "./chat-page-delete-confirm-bar.ui";

describe("ChatPageDeleteConfirmBar", () => {
  beforeEach(() => {
    setLocale("en");
  });

  it("shows the warning and keeps delete before cancel with a neutral cancel style", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(<ChatPageDeleteConfirmBar mode="single" onCancel={onCancel} onConfirm={onConfirm} />);

    const dialog = screen.getByRole("alertdialog", { name: "Delete message?" });
    expect(dialog).toHaveTextContent("This action cannot be undone");
    expect(dialog).toHaveClass("bg-composer-outer");
    expect(dialog).toHaveClass("py-2.5");
    expect(dialog).not.toHaveClass("py-3");
    expect(dialog.querySelector('[data-notice-marker="danger"]')).toHaveClass("bg-danger");
    expect(dialog.querySelector('[data-notice-marker="danger"]')).toHaveClass(
      "top-2.5",
      "bottom-2.5",
    );
    const buttons = within(dialog).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(["Delete", "Cancel"]);
    expect(buttons[0]).toHaveClass("rounded-lg", "px-3", "py-1.5", "text-danger");
    expect(buttons[1]).toHaveClass(
      "rounded-lg",
      "px-3",
      "py-1.5",
      "bg-transparent",
      "border-border-subtle",
      "text-text-primary",
    );

    await user.click(buttons[0]!);
    await user.click(buttons[1]!);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("removes inner corners when joined on both sides", () => {
    render(
      <ChatPageDeleteConfirmBar
        mode="single"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        joinedAbove
        joinedBelow
      />,
    );

    expect(screen.getByRole("alertdialog")).toHaveClass(
      "rounded-none",
      "border-b",
      "border-border-subtle",
    );
    expect(screen.getByRole("alertdialog")).not.toHaveClass("border", "border-t");
  });
});
