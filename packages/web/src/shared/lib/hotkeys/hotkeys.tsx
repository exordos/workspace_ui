// Shares shortcut settings and connects app actions to keyboard events.
import { useHotkey, type Hotkey } from "@tanstack/react-hotkeys";
import { createContext, useContext, type ReactNode, type RefObject } from "react";
import {
  HOTKEYS,
  getHotkeyBinding,
  validateHotkeyBinding,
  type HotkeyId,
  type HotkeyOverrides,
} from "./hotkeys.lib";

interface Settings {
  overrides: HotkeyOverrides;
  enabled: boolean;
  onOverridesChange: (value: HotkeyOverrides) => boolean;
  onEnabledChange: (value: boolean) => boolean;
}
const defaults: Settings = {
  overrides: {},
  enabled: true,
  onOverridesChange: () => false,
  onEnabledChange: () => false,
};
const Context = createContext<Settings>(defaults);
export function HotkeysProvider({ children, ...value }: Settings & { children: ReactNode }) {
  const guardedValue = {
    ...value,
    onOverridesChange: (next: HotkeyOverrides) => {
      // Validate here too, so callers cannot save unknown or conflicting shortcuts.
      if (
        !next ||
        typeof next !== "object" ||
        Object.keys(next).some((id) => !HOTKEYS.some((item) => item.id === id))
      )
        return false;
      for (const item of HOTKEYS) {
        const binding = next[item.id];
        if (
          binding !== undefined &&
          binding !== null &&
          (typeof binding !== "string" || validateHotkeyBinding(item.id, binding, next) !== null)
        )
          return false;
        if (
          binding === undefined &&
          item.defaultBinding &&
          validateHotkeyBinding(item.id, item.defaultBinding, next) !== null
        )
          return false;
      }
      return value.onOverridesChange(next);
    },
  };
  return <Context.Provider value={guardedValue}>{children}</Context.Provider>;
}
export function useHotkeySettings(): Settings {
  return useContext(Context);
}
export function isHotkeyBlockedByModal(target?: HTMLElement | null): boolean {
  // A dialog blocks shortcuts outside it, but not shortcuts inside it.
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      '[role="dialog"], [role="alertdialog"], [data-shortcut-context="modal"]',
    ),
  ).some(
    (dialog) =>
      !dialog.closest('[hidden], [aria-hidden="true"], [data-state="closed"]') &&
      getComputedStyle(dialog).display !== "none" &&
      getComputedStyle(dialog).visibility !== "hidden" &&
      (!target || !dialog.contains(target)),
  );
}
export function useAppHotkey(
  id: HotkeyId,
  callback: (event: KeyboardEvent) => void,
  options: {
    target?: RefObject<HTMLElement | null>;
    enabled?: boolean;
    preventDefault?: boolean;
    allowInputTarget?: (element: HTMLElement) => boolean;
  } = {},
): void {
  const settings = useHotkeySettings();
  const binding = getHotkeyBinding(id, settings.overrides);
  useHotkey(
    binding as Hotkey | null,
    (event) => {
      // Let local controls handle the event first and leave text input alone.
      if (
        (options.target &&
          (!options.target.current || !event.composedPath().includes(options.target.current))) ||
        (!options.target &&
          event.target instanceof HTMLElement &&
          (event.target.isContentEditable ||
            /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) &&
          !options.allowInputTarget?.(event.target)) ||
        event.defaultPrevented ||
        event.isComposing ||
        event.keyCode === 229 ||
        event.repeat ||
        event.getModifierState("AltGraph") ||
        isHotkeyBlockedByModal(options.target?.current)
      )
        return;
      if (options.preventDefault !== false) event.preventDefault();
      callback(event);
    },
    {
      target: typeof window === "undefined" ? null : window,
      capture: false,
      preventDefault: false,
      stopPropagation: false,
      ignoreInputs: false,
      enabled: settings.enabled && options.enabled !== false,
    },
  );
}
