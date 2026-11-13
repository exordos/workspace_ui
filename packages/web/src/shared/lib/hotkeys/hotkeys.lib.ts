import {
  validateHotkey,
  formatForDisplay,
  parseKeyboardEvent,
  parseHotkey,
  isModifierKey,
  normalizeHotkey,
  areHotkeysEqual,
  PUNCTUATION_CODE_MAP,
  type Hotkey,
} from "@tanstack/react-hotkeys";

// Mod means Command on Mac and Control on Windows and Linux.
// A null default means the action has no shortcut until the user adds one.
const chatSearchHotkey = ["navigation.chatSearch", "Mod+K"] as const;
const definitions = [
  ["navigation.back", "Alt+ArrowLeft"],
  ["navigation.forward", "Alt+ArrowRight"],
  ["navigation.messenger", null],
  ["navigation.calendar", null],
  ["navigation.mail", null],
  ["navigation.calls", null],
  ["navigation.activity", null],
  chatSearchHotkey,
  ["navigation.folderList", null],
  ["interface.theme", null],
  ["interface.help", "Mod+/"],
  ["interface.sidebar", "Mod+\\"],
  ["interface.infoPanel", "Mod+."],
  ["interface.quoteMessage", "Control+L"],
  ["composer.editLastMessage", "ArrowUp"],
  ["composer.bold", "Mod+B"],
  ["composer.italic", "Mod+I"],
  ["composer.strike", "Mod+Shift+X"],
  ["composer.code", "Mod+E"],
] as const;
export type HotkeyId = (typeof definitions)[number][0];
export type HotkeyOverrides = Partial<Record<HotkeyId, string | null>>;
export const HOTKEYS = definitions.map(([id, defaultBinding]) => ({
  id,
  defaultBinding,
  labelKey: `hotkeys.actions.${id}`,
  category: id.split(".")[0],
  scope: id.startsWith("composer.") ? "composer" : "global",
  remappable: true,
}));
export const FIXED_HOTKEYS = [
  { id: "fixed.cancel", binding: "Escape", labelKey: "hotkeys.fixed.cancel" },
  { id: "fixed.focus", binding: "Tab", labelKey: "hotkeys.fixed.focus" },
  { id: "fixed.send", binding: "Enter", labelKey: "hotkeys.fixed.send" },
  { id: "fixed.editing", binding: "Mod+C", labelKey: "hotkeys.fixed.editing" },
  { id: "fixed.focusZones", binding: "F6", labelKey: "hotkeys.fixed.focusZones" },
] as const;
export function getHotkeyBinding(id: HotkeyId, overrides: HotkeyOverrides): string | null {
  // Missing means use the default; null means the user disabled the shortcut.
  return overrides[id] === undefined
    ? (HOTKEYS.find((item) => item.id === id)?.defaultBinding ?? null)
    : (overrides[id] ?? null);
}
export function formatHotkey(binding: string): string {
  return formatForDisplay(binding as Hotkey);
}

// Stored labels use US QWERTY positions, regardless of the active OS layout.
const keyByCode = new Map<string, string>([
  ...Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ", (key): [string, string] => [`Key${key}`, key]),
  ...Array.from("0123456789", (key): [string, string] => [`Digit${key}`, key]),
  ...Object.entries(PUNCTUATION_CODE_MAP),
]);
const codeByKey = new Map(Array.from(keyByCode, ([code, key]) => [key, code]));
// Keep keypad and international keys distinct from the main keyboard positions.
const specialKeyByCode = new Map<string, string>([
  ...Array.from("0123456789", (key): [string, string] => [`Numpad${key}`, key]),
  ["NumpadAdd", "+"],
  ["NumpadSubtract", "-"],
  ["NumpadMultiply", "*"],
  ["NumpadDivide", "/"],
  ["NumpadDecimal", "."],
  ["NumpadComma", ","],
  ["NumpadEqual", "="],
  ["NumpadEnter", "Enter"],
  ["IntlBackslash", "IntlBackslash"],
  ["IntlRo", "IntlRo"],
  ["IntlYen", "IntlYen"],
]);
const shiftedKeys = new Map(
  Object.entries({
    "~": "`",
    "!": "1",
    "@": "2",
    "#": "3",
    $: "4",
    "%": "5",
    "^": "6",
    "&": "7",
    "*": "8",
    "(": "9",
    ")": "0",
    _: "-",
    "+": "=",
    "{": "[",
    "}": "]",
    "|": "\\",
    ":": ";",
    '"': "'",
    "<": ",",
    ">": ".",
    "?": "/",
  }),
);

export function toPhysicalHotkey(
  binding: string | null,
  platform?: "mac" | "windows" | "linux",
): string | null {
  if (binding == null) return null;
  const parsed = parseHotkey(binding, platform);
  if (parsed.key == null) return binding;
  const { key, ...modifiers } = parsed;
  const baseKey = shiftedKeys.get(key);
  const code = codeByKey.get(baseKey ?? key);
  if (code == null) return binding;
  // Preserve old bindings written as a shifted glyph, such as Control+?.
  return normalizeHotkey(
    { ...modifiers, code, shift: modifiers.shift || baseKey != null },
    platform,
  );
}

export function hotkeyFromEvent(event: KeyboardEvent): string | null {
  if (
    event.isComposing ||
    event.keyCode === 229 ||
    event.repeat ||
    isModifierKey(event.key) ||
    event.getModifierState("AltGraph")
  )
    return null;
  try {
    const key = keyByCode.get(event.code);
    if (key != null) {
      return normalizeHotkey({
        key,
        ctrl: event.ctrlKey,
        alt: event.altKey,
        shift: event.shiftKey,
        meta: event.metaKey,
      });
    }
    if (specialKeyByCode.has(event.code)) {
      return normalizeHotkey({
        code: event.code,
        ctrl: event.ctrlKey,
        alt: event.altKey,
        shift: event.shiftKey,
        meta: event.metaKey,
      });
    }
    return normalizeHotkey(parseKeyboardEvent(event));
  } catch {
    return null;
  }
}
export function validateHotkeyBinding(
  id: HotkeyId,
  binding: string,
  overrides: HotkeyOverrides,
): "invalid" | "reserved" | "conflict" | null {
  if (!HOTKEYS.some((item) => item.id === id) || !validateHotkey(binding).valid) return "invalid";
  const recorded = parseHotkey(binding);
  let policyBinding = binding;
  if (recorded.code != null) {
    const key = specialKeyByCode.get(recorded.code);
    if (key == null) return "invalid";
    const { ctrl, alt, shift, meta } = recorded;
    policyBinding = normalizeHotkey({ key, ctrl, alt, shift, meta });
  }
  const normalized = normalizeHotkey(policyBinding);
  const parsed = parseHotkey(policyBinding);
  const key = parsed.key?.toLowerCase();
  const platformModifier = parsed.ctrl || parsed.meta;
  // Keep system and text editing keys available to the browser and the user.
  if (
    (key != null && ["escape", "tab", "enter", "f6"].includes(key)) ||
    (!parsed.ctrl &&
      !parsed.meta &&
      !parsed.alt &&
      !(id === "composer.editLastMessage" && key === "arrowup" && !parsed.shift)) ||
    (platformModifier && (key === "+" || key === "=" || key === "-" || key === "0")) ||
    (platformModifier && parsed.shift && key === "r") ||
    /^(Mod|Ctrl|Control|Meta)\+[1-9]$/i.test(normalized) ||
    /^(Mod|Ctrl|Control|Meta)\+Shift\+T$/i.test(normalized) ||
    (/^(Mod|Ctrl|Control|Meta)\+[ACFVXLNORPSTWYZQ]$/i.test(normalized) &&
      !(id === "interface.quoteMessage" && /^(Ctrl|Control)\+L$/i.test(binding))) ||
    /^(Mod|Ctrl|Control|Meta)\+Shift\+Z$/i.test(normalized) ||
    /^(Shift\+(Insert|Delete)|(Control|Ctrl|Mod|Meta)\+Insert)$/i.test(normalized) ||
    /^Alt\+F4$/i.test(normalized)
  )
    return "reserved";
  // Check both platforms because Mod can mean different keys on each one.
  if (
    HOTKEYS.some(
      (item) =>
        item.id !== id &&
        getHotkeyBinding(item.id, overrides) &&
        (["mac", "windows"] as const).some((platform) =>
          areHotkeysEqual(
            toPhysicalHotkey(getHotkeyBinding(item.id, overrides), platform)! as Hotkey,
            toPhysicalHotkey(binding, platform)! as Hotkey,
            platform,
          ),
        ),
    )
  )
    return "conflict";
  return null;
}
export function normalizeHotkeyOverrides(value: unknown): HotkeyOverrides {
  const result: HotkeyOverrides = {};
  if (!value || typeof value !== "object") return result;
  for (const item of HOTKEYS) {
    const binding = (value as Record<string, unknown>)[item.id];
    if (binding === null || (typeof binding === "string" && validateHotkey(binding).valid))
      result[item.id] = binding;
  }
  const [chatSearchId, chatSearchBinding] = chatSearchHotkey;
  const useChatSearchDefault = result[chatSearchId] === undefined;
  // Preserve existing assignments when introducing the chat search default.
  if (useChatSearchDefault) result[chatSearchId] = null;
  // Removing one invalid shortcut can restore a default and reveal another conflict.
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of HOTKEYS) {
      const binding = result[item.id];
      if (typeof binding === "string" && validateHotkeyBinding(item.id, binding, result) !== null) {
        delete result[item.id];
        changed = true;
      }
    }
  }
  if (
    useChatSearchDefault &&
    validateHotkeyBinding(chatSearchId, chatSearchBinding, result) === null
  ) {
    delete result[chatSearchId];
  }
  return result;
}
