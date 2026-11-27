import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "~/i18n/i18n";
import { ChatPageDeleteConfirmBar } from "./chat-page-delete-confirm-bar.ui";
import { ChatPageSelectionBar } from "./chat-page-selection-bar.ui";
import type { ComponentProps } from "react";

const DELETE_MARKER_LAYOUT_CLASS_NAMES = [
  "absolute",
  "bottom-2.5",
  "left-0",
  "top-2.5",
  "w-1",
  "rounded-r-full",
] as const;

const createProps = (overrides: Partial<ComponentProps<typeof ChatPageSelectionBar>> = {}) => ({
  selectedCount: 1,
  replyDisabled: false,
  forwardDisabled: false,
  deleteDisabled: false,
  onReply: vi.fn(),
  onForward: vi.fn(),
  onDelete: vi.fn(),
  onCancel: vi.fn(),
  ...overrides,
});

describe("ChatPageSelectionBar", () => {
  beforeEach(() => {
    setLocale("en");
  });

  it("keeps the shared notice geometry while matching the selection toolbar layout", () => {
    render(<ChatPageSelectionBar {...createProps()} />);

    const toolbar = screen.getByRole("toolbar", { name: "Selected: 1" });
    expect(toolbar).toHaveClass(
      "rounded-xl",
      "border",
      "border-border-subtle",
      "bg-composer-outer",
      "gap-3",
      "px-6",
      "py-1.5",
      "min-h-10",
      "justify-between",
    );
    for (const suppressedSharedClass of ["!bg-transparent", "!px-0", "!py-0", "!border-0"]) {
      expect(toolbar).not.toHaveClass(suppressedSharedClass);
    }
    const count = within(toolbar).getByText("1 message");
    const marker = toolbar.querySelector('[data-notice-marker="danger"]');
    render(<ChatPageDeleteConfirmBar mode="single" onCancel={vi.fn()} onConfirm={vi.fn()} />);
    const deleteMarker = screen
      .getByRole("alertdialog")
      .querySelector('[data-notice-marker="danger"]');
    expect(marker).toHaveClass(...DELETE_MARKER_LAYOUT_CLASS_NAMES, "bg-danger");
    expect(deleteMarker).toHaveClass(...DELETE_MARKER_LAYOUT_CLASS_NAMES, "bg-danger");
    expect(marker).not.toHaveClass("-left-px", "top-1/2", "h-10", "w-[3px]", "-translate-y-1/2");
    expect(marker?.parentElement).toBe(toolbar);
    expect(marker?.nextElementSibling).toBe(count);
    expect(count).toHaveClass("text-sm", "font-medium", "leading-5", "text-text-primary");
  });

  it("uses joined corners and a divider between neighboring surfaces", () => {
    render(
      <ChatPageSelectionBar
        {...createProps({ selectedCount: 2, joinedAbove: true, joinedBelow: true })}
      />,
    );

    const toolbar = screen.getByRole("toolbar");
    expect(toolbar).toHaveClass("rounded-none", "border-b", "border-border-subtle");
    expect(toolbar).not.toHaveClass("border", "border-t");
    const marker = toolbar.querySelector('[data-notice-marker="danger"]');
    expect(marker).toHaveClass(...DELETE_MARKER_LAYOUT_CLASS_NAMES);
  });

  it("keeps the direct Composer boundary seamless without removing shared surface chrome", () => {
    render(
      <ChatPageSelectionBar
        {...createProps({ selectedCount: 2, joinedBelow: true, omitBottomBorder: true })}
      />,
    );

    const toolbar = screen.getByRole("toolbar");
    expect(toolbar).toHaveClass(
      "rounded-t-xl",
      "rounded-b-none",
      "border",
      "border-border-subtle",
      "border-b-0",
      "bg-composer-outer",
    );
    expect(toolbar).not.toHaveClass("border-b");
    const marker = toolbar.querySelector('[data-notice-marker="danger"]');
    expect(marker).toHaveClass(...DELETE_MARKER_LAYOUT_CLASS_NAMES);
  });

  it("renders actions in Cancel, Reply, then Forward order with their icons", () => {
    render(<ChatPageSelectionBar {...createProps({ selectedCount: 2 })} />);

    const buttons = within(screen.getByRole("toolbar")).getAllByRole("button");
    expect(buttons).toHaveLength(3);
    const cancelButton = buttons[0];
    const replyButton = buttons[1];
    const forwardButton = buttons[2];
    if (!cancelButton || !replyButton || !forwardButton)
      throw new Error("Selection actions are missing");
    expect(cancelButton).toHaveAccessibleName("Cancel");
    expect(replyButton).toHaveAccessibleName("Reply");
    expect(forwardButton).toHaveAccessibleName("Forward");
    const replyIcon = replyButton.querySelector("svg");
    expect(replyIcon).toBeInTheDocument();
    expect(replyIcon).toHaveAttribute("width", "28");
    expect(replyIcon).toHaveAttribute("height", "28");
    expect(replyIcon).toHaveAttribute("viewBox", "3 5 22 18");
    const forwardIcon = forwardButton.querySelector("svg");
    expect(forwardIcon).toBeInTheDocument();
    expect(forwardIcon).toHaveAttribute("width", "28");
    expect(forwardIcon).toHaveAttribute("height", "28");
    expect(forwardIcon).toHaveAttribute("viewBox", "3 5 22 18");
    expect(forwardIcon?.querySelector("path")).toHaveAttribute(
      "d",
      expect.stringContaining("24.4796 12.94"),
    );
    expect(cancelButton.parentElement).toHaveClass("gap-2.5");
    for (const button of [cancelButton, replyButton, forwardButton]) {
      expect(button).toHaveClass(
        "h-9",
        "shrink-0",
        "rounded-lg",
        "border",
        "border-transparent",
        "bg-card-bg-active",
        "px-4",
        "text-sm",
        "font-medium",
        "leading-5",
        "transition-colors",
        "hover:border-border-subtle",
        "hover:bg-bg-elevated",
        "hover:ring-1",
        "active:border-accent-soft",
        "active:bg-card-bg",
        "active:ring-2",
        "focus-visible:ring-2",
      );
      expect(button).not.toHaveClass("h-10");
      expect(button).not.toHaveClass("hover:bg-card-bg-active/80", "active:bg-card-bg-active/70");
      expect(button).toHaveAttribute("type", "button");
    }
    expect(forwardButton).toHaveClass("gap-1.5");
    expect(forwardButton).toHaveAttribute("data-icon-hover", "custom");
  });

  it("invokes the visible Cancel, Reply, and Forward handlers", async () => {
    const user = userEvent.setup();
    const onForward = vi.fn();
    const onReply = vi.fn();
    const onCancel = vi.fn();
    render(<ChatPageSelectionBar {...createProps({ onForward, onReply, onCancel })} />);

    const toolbar = screen.getByRole("toolbar");
    await user.click(within(toolbar).getByRole("button", { name: "Cancel" }));
    await user.click(within(toolbar).getByRole("button", { name: "Reply" }));
    await user.click(within(toolbar).getByRole("button", { name: "Forward" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onReply).toHaveBeenCalledTimes(1);
    expect(onForward).toHaveBeenCalledTimes(1);
  });

  it("keeps the forward disabled state and only invokes visible handlers", async () => {
    const user = userEvent.setup();
    const onForward = vi.fn();
    const onReply = vi.fn();
    const onDelete = vi.fn();
    const onCancel = vi.fn();
    render(
      <ChatPageSelectionBar
        {...createProps({
          selectedCount: 2,
          replyDisabled: true,
          forwardDisabled: true,
          onReply,
          onForward,
          onDelete,
          onCancel,
        })}
      />,
    );

    const toolbar = screen.getByRole("toolbar");
    const reply = within(toolbar).getByRole("button", { name: "Reply" });
    const forward = within(toolbar).getByRole("button", { name: "Forward" });
    expect(reply).toBeDisabled();
    const cancel = within(toolbar).getByRole("button", { name: "Cancel" });
    expect(forward).toBeDisabled();
    expect(forward).toHaveClass(
      "disabled:pointer-events-none",
      "disabled:cursor-not-allowed",
      "disabled:border-transparent",
      "disabled:bg-card-bg-active",
      "disabled:opacity-50",
      "disabled:hover:border-transparent",
      "disabled:hover:bg-card-bg-active",
      "disabled:hover:ring-0",
      "disabled:active:border-transparent",
      "disabled:active:bg-card-bg-active",
      "disabled:active:ring-0",
    );

    await user.click(cancel);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onReply).not.toHaveBeenCalled();
    expect(onForward).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("keeps Delete out of the DOM while unavailable", () => {
    render(<ChatPageSelectionBar {...createProps({ selectedCount: 3 })} />);

    const toolbar = screen.getByRole("toolbar", { name: "Selected: 3" });
    expect(within(toolbar).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: "Reply" })).toBeInTheDocument();
    expect(within(toolbar).queryByText("Delete")).not.toBeInTheDocument();
  });

  it("uses the existing pluralized selection labels", () => {
    const cases = [
      [1, "1 message"],
      [2, "2 messages"],
      [5, "5 messages"],
    ] as const;

    for (const [selectedCount, label] of cases) {
      const view = render(<ChatPageSelectionBar {...createProps({ selectedCount })} />);
      expect(within(screen.getByRole("toolbar")).getByText(label)).toBeInTheDocument();
      view.unmount();
    }
  });

  it("renders nothing without selected messages", () => {
    render(<ChatPageSelectionBar {...createProps({ selectedCount: 0, forwardDisabled: true })} />);

    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });
});
