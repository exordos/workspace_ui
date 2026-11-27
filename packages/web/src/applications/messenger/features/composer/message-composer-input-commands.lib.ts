/** Send vs newline Enter rules for the composer (single source for onKeyDown). */
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

export type ComposerSendNewlineMode = "enter-sends" | "mod-enter-sends";

type KeyboardCommandEvent = Pick<
  ReactKeyboardEvent<HTMLTextAreaElement>,
  "key" | "shiftKey" | "metaKey" | "ctrlKey" | "altKey"
>;

function isPlainEnter(event: KeyboardCommandEvent): boolean {
  return (
    event.key === "Enter" && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
  );
}

function isShiftEnter(event: KeyboardCommandEvent): boolean {
  return (
    event.key === "Enter" && event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey
  );
}

function isModEnter(event: KeyboardCommandEvent): boolean {
  return (
    event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey
  );
}

export function isSendCommand(event: KeyboardCommandEvent, mode: ComposerSendNewlineMode): boolean {
  if (mode === "mod-enter-sends") {
    return isModEnter(event);
  }
  return isPlainEnter(event);
}

export function isNewlineCommand(
  event: KeyboardCommandEvent,
  mode: ComposerSendNewlineMode,
): boolean {
  if (mode === "mod-enter-sends") {
    return isPlainEnter(event) || isShiftEnter(event);
  }
  return isShiftEnter(event);
}
