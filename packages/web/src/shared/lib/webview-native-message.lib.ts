/**
 * Parses incoming native WebView postMessage payloads into typed messages.
 */

import type {
  NativeAuthMessage,
  NativeBackMessage,
  NativeLocaleMessage,
  NativeLogoutMessage,
  NativeMessage,
  NativeMessageType,
  NativeNavigateMessage,
  NativeThemeMessage,
  NativeThemeMode,
} from "./webview";

const KNOWN_MESSAGE_TYPES: ReadonlySet<string> = new Set<NativeMessageType>([
  "auth",
  "theme",
  "navigate",
  "back",
  "locale",
  "logout",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function isThemeMode(value: unknown): value is NativeThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

function parseAuthMessage(payload: Record<string, unknown>): NativeAuthMessage | null {
  const email = payload.email;
  const apiKey = payload.apiKey;
  const realm = payload.realm;
  if (typeof email !== "string" || typeof apiKey !== "string" || typeof realm !== "string") {
    return null;
  }
  return { type: "auth", email, apiKey, realm };
}

function parseNavigateMessage(payload: Record<string, unknown>): NativeNavigateMessage | null {
  const path = payload.path;
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
    return null;
  }
  return { type: "navigate", path };
}

function parseThemeMessage(payload: Record<string, unknown>): NativeThemeMessage | null {
  const modeRaw = payload.mode;
  const themeRaw = payload.theme;
  const paletteIdRaw = payload.paletteId;

  if (modeRaw != null && !isThemeMode(modeRaw)) return null;
  if (themeRaw != null && !isThemeMode(themeRaw)) return null;
  if (paletteIdRaw != null && typeof paletteIdRaw !== "string") return null;

  return {
    type: "theme",
    mode: isThemeMode(modeRaw) ? modeRaw : undefined,
    theme: isThemeMode(themeRaw) ? themeRaw : undefined,
    paletteId: typeof paletteIdRaw === "string" && paletteIdRaw.trim() ? paletteIdRaw : undefined,
  };
}

function parseLocaleMessage(payload: Record<string, unknown>): NativeLocaleMessage | null {
  const locale = payload.locale;
  if (typeof locale !== "string" || locale.trim().length === 0) return null;
  return { type: "locale", locale: locale.trim() };
}

const BACK_MESSAGE: NativeBackMessage = { type: "back" };
const LOGOUT_MESSAGE: NativeLogoutMessage = { type: "logout" };

type NativeMessageParser = (payload: Record<string, unknown>) => NativeMessage | null;

const NATIVE_MESSAGE_PARSERS: Record<NativeMessageType, NativeMessageParser> = {
  auth: parseAuthMessage,
  navigate: parseNavigateMessage,
  theme: parseThemeMessage,
  locale: parseLocaleMessage,
  back: () => BACK_MESSAGE,
  logout: () => LOGOUT_MESSAGE,
};

/** Validates and normalizes a native bridge message from `event.data`. */
export function parseNativeMessage(data: unknown): NativeMessage | null {
  const payload = asRecord(data);
  if (!payload) return null;

  const type = payload.type;
  if (typeof type !== "string" || !KNOWN_MESSAGE_TYPES.has(type)) {
    return null;
  }

  return NATIVE_MESSAGE_PARSERS[type as NativeMessageType](payload);
}
