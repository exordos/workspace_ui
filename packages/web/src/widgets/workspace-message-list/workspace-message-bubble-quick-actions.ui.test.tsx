import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceMessageBubbleQuickActions } from "./workspace-message-bubble-quick-actions.ui";
import type { WorkspaceMessageBubbleQuickAction } from "./workspace-message-bubble-quick-actions.ui";

function createReplyAction(): WorkspaceMessageBubbleQuickAction {
  return { key: "reply", label: "Reply", icon: "reply", onSelect: vi.fn() };
}

describe("WorkspaceMessageBubbleQuickActions", () => {
  it("does not render actions when disabled or their condition is false", () => {
    const action = createReplyAction();
    const { rerender } = render(
      <WorkspaceMessageBubbleQuickActions actions={[action]} visibility="disabled" />,
    );
    expect(screen.queryByRole("button", { name: "Reply" })).not.toBeInTheDocument();

    rerender(
      <WorkspaceMessageBubbleQuickActions
        actions={[action]}
        visibility="always"
        condition={false}
      />,
    );
    expect(screen.queryByRole("button", { name: "Reply" })).not.toBeInTheDocument();

    rerender(<WorkspaceMessageBubbleQuickActions actions={[action]} visibility="always" />);
    expect(screen.getByRole("button", { name: "Reply" })).toBeEnabled();
  });

  it("does not leave an empty overlay when no actions are available", () => {
    const { container } = render(<WorkspaceMessageBubbleQuickActions actions={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("dispatches only the selected action without activating its parent", () => {
    const reply = createReplyAction();
    const react = vi.fn();
    const parentClick = vi.fn();
    render(
      <WorkspaceMessageBubbleQuickActions
        visibility="always"
        actions={[reply, { key: "react", label: "React with heart", glyph: "❤️", onSelect: react }]}
      />,
    );
    document.body.addEventListener("click", parentClick);

    fireEvent.click(screen.getByRole("button", { name: "React with heart" }));
    document.body.removeEventListener("click", parentClick);
    expect(react).toHaveBeenCalledExactlyOnceWith();
    expect(reply.onSelect).not.toHaveBeenCalled();
    expect(parentClick).not.toHaveBeenCalled();
  });

  it("exposes toggled reaction state with an accessible label", () => {
    render(
      <WorkspaceMessageBubbleQuickActions
        visibility="always"
        actions={[
          {
            key: "heart",
            label: "React with heart",
            glyph: "❤️",
            pressed: true,
            showLabel: false,
            onSelect: vi.fn(),
          },
        ]}
      />,
    );

    const button = screen.getByRole("button", { name: "React with heart", pressed: true });
    expect(button).not.toHaveTextContent("React with heart");
    expect(button).toHaveAttribute("title", "React with heart");
  });

  it("prevents disabled and pending actions from dispatching", () => {
    const action = createReplyAction();
    const { rerender } = render(
      <WorkspaceMessageBubbleQuickActions actions={[{ ...action, disabled: true }]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    expect(action.onSelect).not.toHaveBeenCalled();

    rerender(<WorkspaceMessageBubbleQuickActions actions={[{ ...action, pending: true }]} />);
    const pendingButton = screen.getByRole("button", { name: "Reply" });
    expect(pendingButton).toBeDisabled();
    expect(pendingButton).toHaveAttribute("aria-busy", "true");
    fireEvent.click(pendingButton);
    expect(action.onSelect).not.toHaveBeenCalled();

    rerender(<WorkspaceMessageBubbleQuickActions actions={[action]} />);
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    expect(action.onSelect).toHaveBeenCalledExactlyOnceWith();
  });

  it("keeps hover actions reachable and operable from the keyboard", async () => {
    const user = userEvent.setup();
    const action = createReplyAction();
    render(<WorkspaceMessageBubbleQuickActions actions={[action]} />);

    await user.tab();
    expect(screen.getByRole("button", { name: "Reply" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(action.onSelect).toHaveBeenCalledExactlyOnceWith();
  });
});
