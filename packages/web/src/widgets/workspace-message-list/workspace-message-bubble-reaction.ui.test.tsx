import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceMessageBubbleReaction } from "./workspace-message-bubble-reaction.ui";
import type { WorkspaceMessageBubbleQuickAction } from "./workspace-message-bubble-quick-actions.ui";

function createReaction(): WorkspaceMessageBubbleQuickAction {
  return {
    key: "reaction",
    glyph: "❤️",
    label: "Unused parent label",
    onSelect: vi.fn(),
    reactions: [
      { key: "thumbs-up", glyph: "👍", label: "React with thumbs up", onSelect: vi.fn() },
      { key: "heart", glyph: "❤️", label: "React with heart", onSelect: vi.fn() },
      { key: "laugh", glyph: "😂", label: "React with laugh", onSelect: vi.fn() },
    ],
  };
}

function getCapsule(container: HTMLElement): HTMLElement {
  const capsule = container.querySelector('[data-workspace-message-quick-reactions="true"]');
  if (!(capsule instanceof HTMLElement)) throw new Error("Missing reaction capsule");
  return capsule;
}

function getReactionScroll(container: HTMLElement): HTMLElement {
  const scroll = container.querySelector('[data-workspace-message-quick-reaction-scroll="true"]');
  if (!(scroll instanceof HTMLElement)) throw new Error("Missing reaction scroll");
  return scroll;
}

async function hoverReactions(container: HTMLElement): Promise<void> {
  fireEvent.mouseEnter(screen.getByRole("group"));
  await waitFor(() => expect(getCapsule(container)).toHaveAttribute("data-expanded", "true"));
}

describe("WorkspaceMessageBubbleReaction", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 200, 24, 24),
    );
  });

  afterEach(() => vi.restoreAllMocks());

  it("uses the first configured reaction as its only collapsed preview", () => {
    render(<WorkspaceMessageBubbleReaction action={createReaction()} isOwn />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "React with thumbs up" })).toHaveTextContent("👍");
    expect(screen.queryByRole("button", { name: "React with heart" })).not.toBeInTheDocument();
  });

  it("expands every reaction into the same scroll area in configured order without duplicates", async () => {
    const { container } = render(
      <WorkspaceMessageBubbleReaction action={createReaction()} isOwn />,
    );
    const preview = screen.getByRole("button", { name: "React with thumbs up" });
    await hoverReactions(container);

    const scroll = getReactionScroll(container);
    expect(
      within(scroll)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["👍", "❤️", "😂"]);
    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "React with thumbs up" })).toBe(preview);
    expect(getCapsule(container)).toHaveAttribute("data-expanded", "true");

    scroll.scrollTop = 64;
    fireEvent.mouseLeave(screen.getByRole("group"));
    expect(getCapsule(container)).toHaveAttribute("data-expanded", "false");
    expect(scroll.scrollTop).toBe(0);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("dispatches a cold mouse click before hover expansion can move the first button", async () => {
    const user = userEvent.setup();
    const action = createReaction();
    const { container } = render(<WorkspaceMessageBubbleReaction action={action} isOwn />);
    await user.click(screen.getByRole("button", { name: "React with thumbs up" }));
    expect(action.reactions?.[0]?.onSelect).toHaveBeenCalledExactlyOnceWith();
    expect(getCapsule(container)).toHaveAttribute("data-expanded", "false");
    await new Promise((resolve) => {
      setTimeout(resolve, 175);
    });
    expect(getCapsule(container)).toHaveAttribute("data-expanded", "false");
  });

  it("dispatches the configured first reaction and alternatives without bubbling", async () => {
    const action = createReaction();
    const bubbleClick = vi.fn();
    const { container } = render(<WorkspaceMessageBubbleReaction action={action} isOwn={false} />);
    document.body.addEventListener("click", bubbleClick);
    fireEvent.click(screen.getByRole("button", { name: "React with thumbs up" }));
    expect(action.reactions?.[0]?.onSelect).toHaveBeenCalledExactlyOnceWith();
    expect(action.onSelect).not.toHaveBeenCalled();

    await hoverReactions(container);
    fireEvent.click(screen.getByRole("button", { name: "React with heart" }));
    document.body.removeEventListener("click", bubbleClick);
    expect(action.reactions?.[1]?.onSelect).toHaveBeenCalledExactlyOnceWith();
    expect(bubbleClick).not.toHaveBeenCalled();
    expect(getCapsule(container)).toHaveAttribute("data-expanded", "false");
    expect(screen.getByRole("button", { name: "React with thumbs up" })).toHaveFocus();
  });

  it("closes with Escape, restores the persistent first button and stays closed", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <WorkspaceMessageBubbleReaction action={createReaction()} isOwn />,
    );
    const trigger = screen.getByRole("button", { name: "React with thumbs up" });

    await user.tab();
    expect(trigger).toHaveFocus();
    expect(getCapsule(container)).toHaveAttribute("data-expanded", "true");
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("button", { name: "React with laugh" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(getCapsule(container)).toHaveAttribute("data-expanded", "false");

    fireEvent.mouseLeave(screen.getByRole("group"));
    await hoverReactions(container);
    expect(getCapsule(container)).toHaveAttribute("data-expanded", "true");
  });

  it("allows keyboard navigation and selection in the shared order", async () => {
    const user = userEvent.setup();
    const action = createReaction();
    const { container } = render(<WorkspaceMessageBubbleReaction action={action} isOwn />);

    await user.tab();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(action.reactions?.[1]?.onSelect).toHaveBeenCalledExactlyOnceWith();
    expect(action.reactions?.[0]?.onSelect).not.toHaveBeenCalled();
    expect(getCapsule(container)).toHaveAttribute("data-expanded", "false");
  });

  it("prevents pending or disabled selections and exposes pending state", async () => {
    const pending = {
      key: "pending",
      glyph: "👍",
      label: "Pending",
      onSelect: vi.fn(),
      pending: true,
    };
    const disabled = {
      key: "disabled",
      label: "Disabled",
      glyph: "❤️",
      onSelect: vi.fn(),
      disabled: true,
    };
    const { container } = render(
      <WorkspaceMessageBubbleReaction
        action={{ ...createReaction(), reactions: [pending, disabled] }}
        isOwn
      />,
    );
    const preview = screen.getByRole("button", { name: "Pending" });
    expect(preview).toBeDisabled();
    expect(preview).toHaveAttribute("aria-busy", "true");
    fireEvent.click(preview);
    expect(pending.onSelect).not.toHaveBeenCalled();

    await hoverReactions(container);
    fireEvent.click(screen.getByRole("button", { name: "Disabled" }));
    expect(disabled.onSelect).not.toHaveBeenCalled();
  });

  it("limits expansion using the stable anchor within its scroll viewport", async () => {
    const { container } = render(
      <div style={{ overflowY: "auto" }}>
        <WorkspaceMessageBubbleReaction action={createReaction()} isOwn />
      </div>,
    );
    const viewport = container.firstElementChild;
    if (!(viewport instanceof HTMLElement)) throw new Error("Missing scroll viewport");
    Object.defineProperty(viewport, "getBoundingClientRect", {
      value: () => new DOMRect(0, 150, 400, 300),
    });

    await hoverReactions(container);
    expect(getCapsule(container)).toHaveStyle({ maxHeight: "70px" });
  });
});
