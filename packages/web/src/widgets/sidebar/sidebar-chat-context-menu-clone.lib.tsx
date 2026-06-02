import React from "react";

export function isContextMenuKeyboardEvent(event: React.KeyboardEvent): boolean {
  return event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
}

export function wrapChildWithContextMenuHandlers(
  children: React.ReactNode,
  options: {
    handleContextMenuCapture: (event: React.MouseEvent) => void;
    openMenu: () => void;
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
            options.openMenu();
          }
        },
      })}
    </>
  );
}
