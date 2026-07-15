import React, { useCallback, useLayoutEffect, useRef } from "react";
import { useTranslation } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import type { WorkspaceReplySession, WorkspaceReplyTab } from "./workspace-reply.types";

export interface WorkspaceReplyTabsProps {
  session: WorkspaceReplySession;
  onSelect: (tabId: string, source?: WorkspaceReplyTabSelectSource) => void;
  onRemove: (tabId: string) => void;
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
  }) {
    const tabLabel = getTabLabel(tab);
    const handleSelect = useCallback(() => onSelectClick(tab.id), [onSelectClick, tab.id]);
    const handleRemove = useCallback(() => onRemove(tab.id), [onRemove, tab.id]);
    const handleTabButtonRef = useCallback(
      (button: HTMLButtonElement | null) => registerTabButton(tab.id, button),
      [registerTabButton, tab.id],
    );

    return (
      <div
        onPointerDown={onPointerDown}
        className="bg-bg-elevated/50 flex min-w-0 shrink-0 items-center overflow-hidden rounded-xl border border-border-subtle"
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
  className = "",
}) {
  const { t: translate } = useTranslation();
  const replyLabel = translate("message.replyTo");
  const closeLabel = translate("common.close");
  const tabButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingKeyboardFocusTabIdRef = useRef<string | null>(null);

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

  const handlePointerDown = useCallback(() => {
    clearPendingKeyboardFocus();
  }, [clearPendingKeyboardFocus]);

  const handleSelectClick = useCallback(
    (tabId: string) => {
      clearPendingKeyboardFocus();
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
      className={`flex min-w-0 gap-1.5 overflow-x-auto border-b border-border-subtle px-3 py-2 ${className}`}
      role="tablist"
      aria-label={replyLabel}
    >
      {session.tabs.map((tab, index) => (
        <WorkspaceReplyTabItem
          key={tab.id}
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
        />
      ))}
    </div>
  );
});
