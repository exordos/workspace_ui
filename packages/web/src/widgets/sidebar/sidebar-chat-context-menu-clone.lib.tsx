import React, { useCallback, useState } from "react";
import type { DropdownMenuContextAnchor } from "~/shared/ui/dropdown-menu";

export function isContextMenuKeyboardEvent(event: React.KeyboardEvent): boolean {
  return event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
}

/** Anchor at cursor for right-click; Radix positions content relative to this point. */
function resolveContextMenuAnchorFromMouseEvent(
  event: React.MouseEvent,
): DropdownMenuContextAnchor {
  return { left: event.clientX, top: event.clientY };
}

/** Keyboard context menu: anchor at the focused row's trailing edge. */
function resolveContextMenuAnchorFromKeyboardEvent(
  event: React.KeyboardEvent,
): DropdownMenuContextAnchor {
  const target = event.currentTarget;
  if (target instanceof HTMLElement) {
    const rect = target.getBoundingClientRect();
    return { left: rect.right, top: rect.top + rect.height / 2 };
  }
  return { left: 0, top: 0 };
}

/** Shared open/anchor state for sidebar chat rows (context menu only, no visible trigger). */
export function useSidebarChatContextMenuAnchor() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [contextAnchor, setContextAnchor] = useState<DropdownMenuContextAnchor | null>(null);

  const handleContextMenuCapture = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setContextAnchor(resolveContextMenuAnchorFromMouseEvent(event));
    setMenuOpen(true);
  }, []);

  const handleKeyboardContextMenu = useCallback((event: React.KeyboardEvent) => {
    setContextAnchor(resolveContextMenuAnchorFromKeyboardEvent(event));
    setMenuOpen(true);
  }, []);

  const handleMenuOpenChange = useCallback((nextOpen: boolean) => {
    setMenuOpen(nextOpen);
    if (!nextOpen) {
      setContextAnchor(null);
    }
  }, []);

  return {
    menuOpen,
    contextAnchor,
    handleContextMenuCapture,
    handleKeyboardContextMenu,
    handleMenuOpenChange,
  };
}

export function wrapChildWithContextMenuHandlers(
  children: React.ReactNode,
  options: {
    handleContextMenuCapture: (event: React.MouseEvent) => void;
    handleKeyboardContextMenu: (event: React.KeyboardEvent) => void;
  },
): React.ReactElement {
  if (!React.isValidElement(children)) {
    return <>{children}</>;
  }
  const childElement = children as React.ReactElement<{
    onContextMenu?: React.MouseEventHandler;
    onKeyDown?: React.KeyboardEventHandler;
  }>;
  const existingOnContextMenu = childElement.props.onContextMenu;
  const existingOnKeyDown = childElement.props.onKeyDown;
  return (
    <>
      {React.cloneElement(childElement, {
        onContextMenu: (event: React.MouseEvent) => {
          existingOnContextMenu?.(event);
          options.handleContextMenuCapture(event);
        },
        onKeyDown: (event: React.KeyboardEvent) => {
          existingOnKeyDown?.(event);
          if (event.defaultPrevented) {
            return;
          }
          if (isContextMenuKeyboardEvent(event)) {
            event.preventDefault();
            options.handleKeyboardContextMenu(event);
          }
        },
      })}
    </>
  );
}
