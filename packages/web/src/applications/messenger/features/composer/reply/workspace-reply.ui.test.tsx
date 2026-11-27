import { act, fireEvent, render, screen } from "@testing-library/react";
import { useLayoutEffect, useRef, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pddMocks = vi.hoisted(() => ({
  draggable: vi.fn(() => vi.fn()),
  dropTargetForElements: vi.fn(() => vi.fn()),
  combine: vi.fn((...cleanups: (() => void | undefined)[]) => () => {
    for (const cleanup of cleanups) cleanup?.();
  }),
}));

vi.mock("@atlaskit/pragmatic-drag-and-drop/element/adapter", () => ({
  draggable: pddMocks.draggable,
  dropTargetForElements: pddMocks.dropTargetForElements,
}));
vi.mock("@atlaskit/pragmatic-drag-and-drop/combine", () => ({ combine: pddMocks.combine }));

import {
  WORKSPACE_REPLY_TAB_DND_TYPE,
  WORKSPACE_REPLY_TAB_LIST_TARGET_ID,
} from "./workspace-reply.dnd";
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

interface MockDragRegistration {
  getInitialData: () => Record<string, unknown>;
  onDrag: (args: never) => void;
  onDrop: (args: never) => void;
}

interface MockDropTargetRegistration {
  element: Element;
  getData: () => Record<string, unknown>;
}

function mockDragEvent(tabId: string, clientX: number, target: MockDropTargetRegistration): never {
  return {
    source: { data: { type: WORKSPACE_REPLY_TAB_DND_TYPE, tabId } },
    location: {
      current: {
        input: { clientX },
        dropTargets: [{ element: target.element, data: target.getData() }],
      },
    },
  } as never;
}

describe("WorkspaceReplyTabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers PDD sources and targets with move semantics and tab-only data", () => {
    const first = tab({ id: "first", senderName: "Alice" });
    const second = tab({ id: "second", senderName: "Maria" });

    render(
      <WorkspaceReplyTabs
        session={session([first, second])}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    expect(pddMocks.draggable).toHaveBeenCalledTimes(2);
    expect(pddMocks.dropTargetForElements).toHaveBeenCalledTimes(3);

    const sourceRegistrations = (pddMocks.draggable.mock.calls as unknown as [unknown][]).map(
      ([args]) => args as { dragHandle: Element; getInitialData: () => Record<string, unknown> },
    );
    expect(sourceRegistrations.map((registration) => registration.getInitialData())).toEqual([
      { type: WORKSPACE_REPLY_TAB_DND_TYPE, tabId: first.id },
      { type: WORKSPACE_REPLY_TAB_DND_TYPE, tabId: second.id },
    ]);

    const targetRegistrations = (
      pddMocks.dropTargetForElements.mock.calls as unknown as [unknown][]
    ).map(
      ([args]) =>
        args as {
          getData: () => Record<string, unknown>;
          getDropEffect: () => string;
        },
    );
    expect(targetRegistrations.map((registration) => registration.getData())).toEqual(
      expect.arrayContaining([
        { type: WORKSPACE_REPLY_TAB_DND_TYPE, tabId: WORKSPACE_REPLY_TAB_LIST_TARGET_ID },
        { type: WORKSPACE_REPLY_TAB_DND_TYPE, tabId: first.id },
        { type: WORKSPACE_REPLY_TAB_DND_TYPE, tabId: second.id },
      ]),
    );
    expect(
      targetRegistrations.every((registration) => registration.getDropEffect() === "move"),
    ).toBe(true);

    const firstTab = screen.getByRole("tab", { name: "Alice: Quote from Alice: Reply" });
    const closeButton = screen.getByRole("button", { name: "Close: Alice" });
    expect(sourceRegistrations[0]?.dragHandle).toBe(firstTab);
    expect(sourceRegistrations[0]?.dragHandle).not.toBe(closeButton);
  });

  it("uses midpoint before/after positions and reorders only from the mocked drop callback", () => {
    const first = tab({ id: "first", senderName: "Alice" });
    const second = tab({ id: "second", senderName: "Maria" });
    const third = tab({ id: "third", senderName: "Igor" });
    const onReorder = vi.fn();

    render(
      <WorkspaceReplyTabs
        session={session([first, second, third])}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        onReorder={onReorder}
      />,
    );

    const source = (pddMocks.draggable.mock.calls as unknown as [unknown][])
      .map(([args]) => args as MockDragRegistration)
      .find((registration) => registration.getInitialData().tabId === first.id);
    const target = (pddMocks.dropTargetForElements.mock.calls as unknown as [unknown][])
      .map(([args]) => args as MockDropTargetRegistration)
      .find((registration) => registration.getData().tabId === second.id);

    expect(source).toBeDefined();
    expect(target).toBeDefined();
    if (source == null || target == null) return;

    vi.spyOn(target.element, "getBoundingClientRect").mockReturnValue({
      left: 100,
      width: 100,
      right: 200,
      top: 0,
      bottom: 40,
      height: 40,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    });

    act(() => source.onDrag(mockDragEvent(first.id, 120, target)));
    expect(screen.getByTestId("workspace-reply-drop-indicator")).toBeInTheDocument();
    act(() => source.onDrop(mockDragEvent(first.id, 120, target)));
    expect(onReorder).toHaveBeenNthCalledWith(1, first.id, 1);
    expect(screen.queryByTestId("workspace-reply-drop-indicator")).not.toBeInTheDocument();

    act(() => source.onDrag(mockDragEvent(first.id, 180, target)));
    act(() => source.onDrop(mockDragEvent(first.id, 180, target)));
    expect(onReorder).toHaveBeenNthCalledWith(2, first.id, 2);
  });

  it("clears stale post-drop suppression on the next pointer interaction", () => {
    const first = tab({ id: "first", senderName: "Alice" });
    const second = tab({ id: "second", senderName: "Maria" });
    const onSelect = vi.fn();

    render(
      <WorkspaceReplyTabs
        session={session([first, second])}
        onSelect={onSelect}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    const source = (pddMocks.draggable.mock.calls as unknown as [unknown][])
      .map(([args]) => args as MockDragRegistration)
      .find((registration) => registration.getInitialData().tabId === first.id);
    const listTarget = (pddMocks.dropTargetForElements.mock.calls as unknown as [unknown][])
      .map(([args]) => args as MockDropTargetRegistration)
      .find((registration) => registration.getData().tabId === WORKSPACE_REPLY_TAB_LIST_TARGET_ID);
    const firstTab = screen.getByRole("tab", { name: "Alice: Quote from Alice: Reply" });
    const secondTab = screen.getByRole("tab", { name: "Maria: Quote from Maria: Reply" });

    expect(source).toBeDefined();
    expect(listTarget).toBeDefined();
    if (source == null || listTarget == null) return;

    act(() => source.onDrop(mockDragEvent(first.id, -1, listTarget)));

    // No click arrived for the drop. A later real pointer interaction must not be swallowed.
    fireEvent.pointerDown(secondTab);
    fireEvent.click(secondTab);
    fireEvent.click(firstTab);

    expect(onSelect).toHaveBeenNthCalledWith(1, second.id, "pointer");
    expect(onSelect).toHaveBeenNthCalledWith(2, first.id, "pointer");
  });

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
        onReorder={vi.fn()}
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
        onReorder={vi.fn()}
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
        onReorder={vi.fn()}
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
          onReorder={vi.fn()}
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
            onReorder={vi.fn()}
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
      <WorkspaceReplyTabs
        session={session([])}
        onSelect={vi.fn()}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
