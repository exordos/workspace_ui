import { fireEvent, render, screen } from "@testing-library/react";
import { useLayoutEffect, useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceReplyTabs } from "./workspace-reply.ui";
import type { WorkspaceReplySession, WorkspaceReplyTab } from "./workspace-reply.types";

function tab(
  overrides: Partial<WorkspaceReplyTab> & Pick<WorkspaceReplyTab, "id" | "senderName">,
): WorkspaceReplyTab {
  return {
    id: overrides.id,
    messageUuid: `${overrides.id}-message`,
    senderUuid: `${overrides.id}-sender`,
    senderName: overrides.senderName,
    quotedContent: overrides.quotedContent ?? `Quote from ${overrides.senderName}`,
    createdAt: overrides.createdAt ?? "2026-07-14T10:00:00.000Z",
    answer: overrides.answer ?? "",
    selectedText: overrides.selectedText,
  };
}

function session(
  tabs: WorkspaceReplyTab[],
  activeTabId: string | null = tabs[0]?.id ?? null,
): WorkspaceReplySession {
  return { tabs, activeTabId };
}

describe("WorkspaceReplyTabs", () => {
  it("renders ordinary tab and close button interactions", () => {
    const first = tab({ id: "first", senderName: "Alice", quotedContent: "First quote" });
    const second = tab({ id: "second", senderName: "Maria", quotedContent: "Second quote" });
    const onSelect = vi.fn();
    const onRemove = vi.fn();

    render(
      <WorkspaceReplyTabs
        session={session([first, second], second.id)}
        onSelect={onSelect}
        onRemove={onRemove}
      />,
    );

    const firstTab = screen.getByRole("tab", { name: "Alice: First quote: Reply" });
    const closeButton = screen.getByRole("button", { name: "Close: Alice" });
    expect(screen.getByRole("tablist", { name: "Reply" })).toBeInTheDocument();
    expect(firstTab).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "Maria: Second quote: Reply" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(firstTab).not.toHaveAttribute("draggable");
    expect(firstTab).toHaveClass("cursor-pointer");
    expect(firstTab).not.toHaveClass("cursor-grab", "active:cursor-grabbing");
    expect(closeButton).not.toHaveAttribute("draggable");

    fireEvent.click(firstTab);
    fireEvent.click(closeButton);

    expect(onSelect).toHaveBeenCalledWith(first.id, "pointer");
    expect(onRemove).toHaveBeenCalledWith(first.id);
  });

  it("renders compact tabs without extra controls", () => {
    const first = tab({ id: "first", senderName: "Alice" });
    const second = tab({ id: "second", senderName: "Maria" });

    render(
      <WorkspaceReplyTabs
        session={session([first, second])}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByRole("tab", { name: "Alice: Quote from Alice: Reply" })).toHaveTextContent(
      "Alice",
    );
    expect(screen.queryByRole("button", { name: /prev|next|add/i })).not.toBeInTheDocument();
  });

  it("selects neighboring tabs with keyboard navigation", () => {
    const first = tab({ id: "first", senderName: "Alice" });
    const second = tab({ id: "second", senderName: "Maria" });
    const third = tab({ id: "third", senderName: "Igor" });
    const onSelect = vi.fn();

    render(
      <WorkspaceReplyTabs
        session={session([first, second, third], second.id)}
        onSelect={onSelect}
        onRemove={vi.fn()}
      />,
    );

    const activeTab = screen.getByRole("tab", { name: "Maria: Quote from Maria: Reply" });
    fireEvent.keyDown(activeTab, { key: "ArrowRight" });
    fireEvent.keyDown(activeTab, { key: "Home" });

    expect(onSelect).toHaveBeenNthCalledWith(1, third.id, "keyboard");
    expect(onSelect).toHaveBeenNthCalledWith(2, first.id, "keyboard");
  });

  it("moves focus with the active tab and continues keyboard navigation", () => {
    const first = tab({ id: "first", senderName: "Alice" });
    const second = tab({ id: "second", senderName: "Maria" });
    const third = tab({ id: "third", senderName: "Igor" });
    const onSelect = vi.fn();

    function ControlledTabs() {
      const [activeTabId, setActiveTabId] = useState(second.id);

      return (
        <WorkspaceReplyTabs
          session={session([first, second, third], activeTabId)}
          onSelect={(tabId, source) => {
            onSelect(tabId, source);
            setActiveTabId(tabId);
          }}
          onRemove={vi.fn()}
        />
      );
    }

    render(<ControlledTabs />);

    const firstTab = screen.getByRole("tab", { name: "Alice: Quote from Alice: Reply" });
    const secondTab = screen.getByRole("tab", { name: "Maria: Quote from Maria: Reply" });
    const thirdTab = screen.getByRole("tab", { name: "Igor: Quote from Igor: Reply" });

    secondTab.focus();
    fireEvent.keyDown(secondTab, { key: "ArrowRight" });
    expect(onSelect).toHaveBeenLastCalledWith(third.id, "keyboard");
    expect(thirdTab).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(thirdTab);

    fireEvent.keyDown(thirdTab, { key: "ArrowLeft" });
    expect(onSelect).toHaveBeenLastCalledWith(second.id, "keyboard");
    expect(secondTab).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(secondTab);

    fireEvent.keyDown(secondTab, { key: "Home" });
    expect(onSelect).toHaveBeenLastCalledWith(first.id, "keyboard");
    expect(firstTab).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(firstTab);

    fireEvent.keyDown(firstTab, { key: "End" });
    expect(onSelect).toHaveBeenLastCalledWith(third.id, "keyboard");
    expect(thirdTab).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(thirdTab);
  });

  it("keeps keyboard focus when the parent would otherwise focus the composer", () => {
    const first = tab({ id: "first", senderName: "Alice" });
    const second = tab({ id: "second", senderName: "Maria" });
    const third = tab({ id: "third", senderName: "Igor" });

    function ControlledTabsWithComposer() {
      const [activeTabId, setActiveTabId] = useState(second.id);
      const [focusKey, setFocusKey] = useState<string | null>(second.id);
      const composerRef = useRef<HTMLTextAreaElement>(null);

      useLayoutEffect(() => {
        if (focusKey != null) composerRef.current?.focus();
      }, [focusKey]);

      return (
        <>
          <textarea ref={composerRef} data-testid="composer" />
          <WorkspaceReplyTabs
            session={session([first, second, third], activeTabId)}
            onSelect={(tabId, source) => {
              setActiveTabId(tabId);
              setFocusKey(source === "keyboard" ? null : tabId);
            }}
            onRemove={vi.fn()}
          />
        </>
      );
    }

    render(<ControlledTabsWithComposer />);

    const firstTab = screen.getByRole("tab", { name: "Alice: Quote from Alice: Reply" });
    const secondTab = screen.getByRole("tab", { name: "Maria: Quote from Maria: Reply" });
    const thirdTab = screen.getByRole("tab", { name: "Igor: Quote from Igor: Reply" });
    const composer = screen.getByTestId("composer");

    secondTab.focus();
    fireEvent.keyDown(secondTab, { key: "ArrowRight" });
    expect(document.activeElement).toBe(thirdTab);

    fireEvent.keyDown(thirdTab, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(secondTab);

    fireEvent.click(firstTab);
    expect(document.activeElement).toBe(composer);
  });

  it("renders nothing for an empty session", () => {
    const { container } = render(
      <WorkspaceReplyTabs session={session([])} onSelect={vi.fn()} onRemove={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
