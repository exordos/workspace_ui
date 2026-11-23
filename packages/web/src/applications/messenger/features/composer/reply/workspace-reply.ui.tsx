import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  draggable,
  dropTargetForElements,
  type ElementEventPayloadMap,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import {
  getWorkspaceReplyTabDragData,
  getWorkspaceReplyTabDropIndex,
  isWorkspaceReplyTabDragData,
  WORKSPACE_REPLY_TAB_LIST_TARGET_ID,
} from "./workspace-reply.dnd";
import type { WorkspaceReplySession, WorkspaceReplyTab } from "./workspace-reply.types";

export interface WorkspaceReplyTabsProps {
  session: WorkspaceReplySession;
  onSelect: (tabId: string, source?: WorkspaceReplyTabSelectSource) => void;
  onRemove: (tabId: string) => void;
  onReorder?: (tabId: string, destinationIndex: number) => void;
  className?: string;
}

export type WorkspaceReplyTabSelectSource = "pointer" | "keyboard";

function getTabExcerpt(tab: WorkspaceReplyTab): string {
  const content = (tab.selectedText ?? tab.quotedContent).replace(/\s+/g, " ").trim();
  if (content.length <= 36) return content;
  return `${content.slice(0, 36).trimEnd()}…`;
}

function getTabLabel(tab: WorkspaceReplyTab): string {
  const excerpt = getTabExcerpt(tab);
  return excerpt.length > 0 ? `${tab.senderName}: ${excerpt}` : tab.senderName;
}

interface WorkspaceReplyTabItemProps {
  tab: WorkspaceReplyTab;
  index: number;
  selected: boolean;
  onSelectClick: (tabId: string) => void;
  onPointerDown: () => void;
  onRemove: (tabId: string) => void;
  registerTabButton: (tabId: string, button: HTMLButtonElement | null) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => void;
  replyLabel: string;
  closeLabel: string;
  dragging: boolean;
  onDrag: (args: ElementEventPayloadMap["onDrag"]) => void;
  onDragStart: (tabId: string) => void;
  onDrop: (args: ElementEventPayloadMap["onDrop"]) => void;
  onDndCleanup: (tabId: string) => void;
  registerTabElement: (tabId: string, element: HTMLElement | null) => void;
}

const WorkspaceReplyTabItem = React.memo<WorkspaceReplyTabItemProps>(
  function WorkspaceReplyTabItem({
    tab,
    index,
    selected,
    onSelectClick,
    onPointerDown,
    onRemove,
    registerTabButton,
    onKeyDown,
    replyLabel,
    closeLabel,
    dragging,
    onDrag,
    onDragStart,
    onDrop,
    onDndCleanup,
    registerTabElement,
  }) {
    const tabLabel = getTabLabel(tab);
    const tabElementRef = useRef<HTMLDivElement>(null);
    const dragHandleRef = useRef<HTMLButtonElement>(null);
    const handleSelect = useCallback(() => onSelectClick(tab.id), [onSelectClick, tab.id]);
    const handleRemove = useCallback(() => onRemove(tab.id), [onRemove, tab.id]);
    const handleTabButtonRef = useCallback(
      (button: HTMLButtonElement | null) => {
        dragHandleRef.current = button;
        registerTabButton(tab.id, button);
      },
      [registerTabButton, tab.id],
    );

    useEffect(() => {
      const element = tabElementRef.current;
      const dragHandle = dragHandleRef.current;
      if (element == null || dragHandle == null) return;

      registerTabElement(tab.id, element);

      return combine(
        draggable({
          element,
          dragHandle,
          getInitialData: () => getWorkspaceReplyTabDragData(tab.id),
          onDragStart: () => onDragStart(tab.id),
          onDrag,
          onDrop,
        }),
        dropTargetForElements({
          element,
          getData: () => getWorkspaceReplyTabDragData(tab.id),
          canDrop: ({ source }) =>
            isWorkspaceReplyTabDragData(source.data) && source.data.tabId !== tab.id,
          getDropEffect: () => "move",
        }),
        () => onDndCleanup(tab.id),
        () => registerTabElement(tab.id, null),
      );
    }, [onDndCleanup, onDrag, onDragStart, onDrop, registerTabElement, tab.id]);

    return (
      <div
        ref={tabElementRef}
        onPointerDown={onPointerDown}
        className={`bg-bg-elevated/50 flex min-w-0 shrink-0 items-center overflow-hidden rounded-xl border border-border-subtle transition-[opacity,transform] duration-150 ease-out ${dragging ? "opacity-60" : ""}`}
      >
        <button
          type="button"
          role="tab"
          ref={handleTabButtonRef}
          aria-selected={selected}
          aria-label={`${tabLabel}: ${replyLabel}`}
          tabIndex={selected ? 0 : -1}
          onClick={handleSelect}
          onKeyDown={(event) => onKeyDown(event, index)}
          className={`min-w-0 max-w-52 cursor-pointer px-3 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
            selected
              ? "bg-accent/15 text-text-primary"
              : "text-text-muted hover:bg-bg-elevated hover:text-text-primary"
          }`}
          title={tabLabel}
        >
          <span className="block truncate font-medium">{tab.senderName}</span>
        </button>
        <button
          type="button"
          aria-label={`${closeLabel}: ${tab.senderName}`}
          title={closeLabel}
          onClick={handleRemove}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        >
          <Icon name="close" size={14} />
        </button>
      </div>
    );
  },
);

export const WorkspaceReplyTabs = React.memo<WorkspaceReplyTabsProps>(function WorkspaceReplyTabs({
  session,
  onSelect,
  onRemove,
  onReorder,
  className = "",
}) {
  const { t: translate } = useTranslation();
  const replyLabel = translate("message.replyTo");
  const closeLabel = translate("common.close");
  const tabButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const tabElementsRef = useRef(new Map<string, HTMLElement>());
  const listElementRef = useRef<HTMLDivElement>(null);
  const pendingKeyboardFocusTabIdRef = useRef<string | null>(null);
  const suppressedClickTabIdRef = useRef<string | null>(null);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const registerTabButton = useCallback((tabId: string, button: HTMLButtonElement | null) => {
    if (button == null) {
      tabButtonRefs.current.delete(tabId);
    } else {
      tabButtonRefs.current.set(tabId, button);
    }
  }, []);

  useLayoutEffect(() => {
    const pendingTabId = pendingKeyboardFocusTabIdRef.current;
    if (pendingTabId == null) return;
    if (session.activeTabId !== pendingTabId) {
      pendingKeyboardFocusTabIdRef.current = null;
      return;
    }

    tabButtonRefs.current.get(pendingTabId)?.focus();
    pendingKeyboardFocusTabIdRef.current = null;
  }, [session.activeTabId]);

  const clearPendingKeyboardFocus = useCallback(() => {
    pendingKeyboardFocusTabIdRef.current = null;
  }, []);

  const getDropIndex = useCallback(
    (args: ElementEventPayloadMap["onDrag"]) =>
      getWorkspaceReplyTabDropIndex({
        tabs: session.tabs,
        tabElements: tabElementsRef.current,
        dropTargets: args.location.current.dropTargets,
        clientX: args.location.current.input.clientX,
      }),
    [session.tabs],
  );

  const handleDrag = useCallback(
    (args: ElementEventPayloadMap["onDrag"]) => {
      if (!isWorkspaceReplyTabDragData(args.source.data)) {
        setDropIndex(null);
        return;
      }

      setDraggingTabId(args.source.data.tabId);
      setDropIndex(getDropIndex(args));
    },
    [getDropIndex],
  );

  const handleDragStart = useCallback((tabId: string) => {
    suppressedClickTabIdRef.current = null;
    setDraggingTabId(tabId);
    setDropIndex(null);
  }, []);

  const clearDndState = useCallback(() => {
    setDraggingTabId(null);
    setDropIndex(null);
  }, []);

  const handleDrop = useCallback(
    (args: ElementEventPayloadMap["onDrop"]) => {
      const sourceData = args.source.data;
      const destinationIndex = isWorkspaceReplyTabDragData(sourceData) ? getDropIndex(args) : null;

      clearDndState();

      if (
        !isWorkspaceReplyTabDragData(sourceData) ||
        sourceData.tabId === WORKSPACE_REPLY_TAB_LIST_TARGET_ID ||
        destinationIndex == null
      ) {
        return;
      }

      suppressedClickTabIdRef.current = sourceData.tabId;
      onReorder?.(sourceData.tabId, destinationIndex);
    },
    [clearDndState, getDropIndex, onReorder],
  );

  const registerTabElement = useCallback((tabId: string, element: HTMLElement | null) => {
    if (element == null) {
      tabElementsRef.current.delete(tabId);
    } else {
      tabElementsRef.current.set(tabId, element);
    }
  }, []);

  useEffect(() => {
    const element = listElementRef.current;
    if (element == null) return;

    return dropTargetForElements({
      element,
      getData: () => getWorkspaceReplyTabDragData(WORKSPACE_REPLY_TAB_LIST_TARGET_ID),
      canDrop: ({ source }) => isWorkspaceReplyTabDragData(source.data),
      getDropEffect: () => "move",
    });
  }, []);

  useEffect(() => clearDndState, [clearDndState]);

  const handlePointerDown = useCallback(() => {
    clearPendingKeyboardFocus();
    // A new pointer interaction starts a new click cycle.
    suppressedClickTabIdRef.current = null;
  }, [clearPendingKeyboardFocus]);

  const handleSelectClick = useCallback(
    (tabId: string) => {
      clearPendingKeyboardFocus();
      if (suppressedClickTabIdRef.current === tabId) {
        suppressedClickTabIdRef.current = null;
        return;
      }
      onSelect(tabId, "pointer");
    },
    [clearPendingKeyboardFocus, onSelect],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (
        event.key !== "ArrowLeft" &&
        event.key !== "ArrowRight" &&
        event.key !== "Home" &&
        event.key !== "End"
      ) {
        return;
      }

      event.preventDefault();
      let nextIndex = index + (event.key === "ArrowRight" ? 1 : -1);
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = session.tabs.length - 1;
      const nextTab = session.tabs[nextIndex];
      if (nextTab != null) {
        pendingKeyboardFocusTabIdRef.current = nextTab.id;
        onSelect(nextTab.id, "keyboard");
      }
    },
    [onSelect, session.tabs],
  );

  if (session.tabs.length === 0) return null;

  return (
    <div
      className={`flex w-full min-w-0 gap-1.5 overflow-x-auto ${className}`}
      ref={listElementRef}
      role="tablist"
      aria-label={replyLabel}
    >
      {session.tabs.map((tab, index) => (
        <React.Fragment key={tab.id}>
          {dropIndex === index && <WorkspaceReplyDropIndicator />}
          <WorkspaceReplyTabItem
            tab={tab}
            index={index}
            selected={session.activeTabId === tab.id}
            onSelectClick={handleSelectClick}
            onPointerDown={handlePointerDown}
            onRemove={onRemove}
            registerTabButton={registerTabButton}
            onKeyDown={handleKeyDown}
            replyLabel={replyLabel}
            closeLabel={closeLabel}
            dragging={draggingTabId === tab.id}
            onDrag={handleDrag}
            onDragStart={handleDragStart}
            onDrop={handleDrop}
            onDndCleanup={clearDndState}
            registerTabElement={registerTabElement}
          />
        </React.Fragment>
      ))}
      {dropIndex === session.tabs.length && <WorkspaceReplyDropIndicator />}
    </div>
  );
});

function WorkspaceReplyDropIndicator() {
  return (
    <span
      aria-hidden="true"
      data-testid="workspace-reply-drop-indicator"
      className="h-8 w-0.5 shrink-0 rounded-full bg-accent transition-[opacity,transform] duration-150 ease-out"
    />
  );
}
