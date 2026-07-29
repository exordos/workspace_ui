/**
 * Native WebView bridge — enables embedding web pages inside iOS/Android native apps.
 *
 * When a native app loads a page in a WebView, it injects `window.NativeApp`
 * (Android: via addJavascriptInterface, iOS: via WKScriptMessageHandler + JS injection).
 * This module detects that context and provides a typed bridge.
 *
 * Scenarios:
 * - iOS dev hasn't built the profile screen yet → opens /webview/profile in WKWebView
 * - Android dev needs a quick settings page → opens /webview/licenses in WebView
 * - Both platforms share the same chat detail view during transition period
 *
 * Detection priority: URL param `?webview=1` → `window.NativeApp` → user-agent heuristic.
 *
 * Security: auth token is passed via the JS bridge (postMessage), never in the URL.
 */

import { IS_CONNECTION_DIAGNOSTICS_ENABLED } from "~/shared/config/constants";
import { createLogger } from "./logger";
import { isValidRealmUrl } from "./validation";
import {
  dispatchNativeMessageToHandlers,
  logRejectedMalformedNativeMessage,
  logRejectedNativeOrigin,
  parseIncomingNativeMessage,
} from "./webview-incoming-message.lib";
import { isTrustedWebViewMessageOrigin } from "./webview-trust.lib";

const log = createLogger("webview");

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

export type WebViewPlatform = "ios" | "android" | null;

export function isWebView(): boolean {
  if (typeof window === "undefined") return false;

  if (new URLSearchParams(window.location.search).get("webview") === "1") return true;
  if (window.NativeApp != null) return true;

  const ua = navigator.userAgent;
  if (ua.includes("wv)") || /; wv\b/.test(ua)) return true;
  if (ua.includes("WebView")) return true;

  return false;
}

export function getWebViewPlatform(): WebViewPlatform {
  if (typeof window === "undefined") return null;

  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) && !ua.includes("Safari")) return "ios";
  if (ua.includes("Android") && ua.includes("wv)")) return "android";
  if (window.NativeApp?.platform === "ios") return "ios";
  if (window.NativeApp?.platform === "android") return "android";

  return null;
}

// ---------------------------------------------------------------------------
// Bridge: Web → Native
// ---------------------------------------------------------------------------

export interface NativeBridge {
  /** Close the WebView and return to native screen. */
  close(): void;
  /** Navigate to a native screen by route name. */
  navigateNative(route: string, params?: Record<string, string>): void;
  /** Set the native navigation bar title. */
  setTitle(title: string): void;
  /** Show/hide native loading indicator. */
  setLoading(loading: boolean): void;
  /** Share content via native share sheet. */
  share(text: string, url?: string): void;
  /** Send an arbitrary event to the native layer. */
  postEvent(type: string, data?: Record<string, unknown>): void;
  /** Request auth credentials from the native app. */
  requestAuth(): void;
}

function createBridge(): NativeBridge {
  const post = (type: string, data?: Record<string, unknown>) => {
    try {
      if (window.NativeApp?.postMessage) {
        window.NativeApp.postMessage(JSON.stringify({ type, ...data }));
      } else if (window.webkit?.messageHandlers?.nativeApp) {
        window.webkit.messageHandlers.nativeApp.postMessage({ type, ...data });
      } else {
        log.warn("No native bridge available", { type });
      }
    } catch (err) {
      log.error("Bridge postMessage failed", { type, error: String(err) });
    }
  };

  return {
    close: () => post("close"),
    navigateNative: (route, params) => post("navigate", { route, params }),
    setTitle: (title) => post("setTitle", { title }),
    setLoading: (loading) => post("setLoading", { loading }),
    share: (text, url) => post("share", { text, url }),
    postEvent: (type, data) => post("event", { eventType: type, ...data }),
    requestAuth: () => post("requestAuth"),
  };
}

let _bridge: NativeBridge | null = null;

export function getNativeBridge(): NativeBridge {
  _bridge ??= createBridge();
  return _bridge;
}

// ---------------------------------------------------------------------------
// Bridge: Native → Web (incoming messages)
// ---------------------------------------------------------------------------

export type NativeMessageType = "auth" | "theme" | "navigate" | "back" | "locale" | "logout";
export type NativeThemeMode = "light" | "dark" | "system";

export interface NativeAuthMessage {
  type: "auth";
  email: string;
  apiKey: string;
  realm: string;
}

export interface NativeThemeMessage {
  type: "theme";
  mode?: NativeThemeMode;
  /** Legacy alias used by some native clients. */
  theme?: NativeThemeMode;
  paletteId?: string;
}

export interface NativeNavigateMessage {
  type: "navigate";
  path: string;
}

export interface NativeBackMessage {
  type: "back";
}

export interface NativeLocaleMessage {
  type: "locale";
  locale: string;
}

export interface NativeLogoutMessage {
  type: "logout";
}

export type NativeMessage =
  | NativeAuthMessage
  | NativeThemeMessage
  | NativeNavigateMessage
  | NativeBackMessage
  | NativeLocaleMessage
  | NativeLogoutMessage;

type NativeMessageHandler = (msg: NativeMessage) => void;
const handlers = new Set<NativeMessageHandler>();

export function onNativeMessage(handler: NativeMessageHandler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

function handleIncomingMessage(event: MessageEvent): void {
  const inWebViewContext = isWebView();
  if (!isTrustedWebViewMessageOrigin(event.origin)) {
    logRejectedNativeOrigin(log, event.origin, inWebViewContext);
    return;
  }

  const msg = parseIncomingNativeMessage(event.data);
  if (!msg) {
    logRejectedMalformedNativeMessage(log, event.data, inWebViewContext);
    return;
  }

  log.info("Native message received", { type: msg.type });
  dispatchNativeMessageToHandlers(msg, handlers, log);
}

// ---------------------------------------------------------------------------
// Auth injection from native
// ---------------------------------------------------------------------------

type AuthCallback = (credentials: { email: string; apiKey: string; realm: string }) => void;

let authCallback: AuthCallback | null = null;

export function onAuthFromNative(cb: AuthCallback): () => void {
  authCallback = cb;
  return () => {
    authCallback = null;
  };
}

function handleAuthMessage(msg: NativeMessage): void {
  if (msg.type !== "auth") return;
  if (!authCallback) return;

  if (!isValidRealmUrl(msg.realm)) {
    log.warn("Rejected auth from native: invalid realm URL");
    return;
  }

  log.info("Auth credentials received from native");
  authCallback({ email: msg.email, apiKey: msg.apiKey, realm: msg.realm });
}

// ---------------------------------------------------------------------------
// WebView-available pages registry
// ---------------------------------------------------------------------------

export interface WebViewPageDef {
  /** Route path (e.g., "/profile", "/licenses", "/settings"). */
  path: string;
  /** Human-readable label for the native app to display. */
  label: string;
  /** Minimum app version that should use WebView for this page. */
  minNativeVersion?: string;
}

const webViewPages: WebViewPageDef[] = [
  { path: "/licenses", label: "Open Source Licenses" },
  { path: "/org/:orgId/project/:projectId/activity/:filter", label: "Activity" },
  // Workspace uses the same stream route for channels and direct-message conversations.
  { path: "/org/:orgId/project/:projectId/stream/:streamUuid", label: "Conversation" },
  {
    path: "/org/:orgId/project/:projectId/stream/:streamUuid/topic/:topicUuid",
    label: "Topic",
  },
  { path: "/calendar", label: "Calendar" },
  { path: "/mail", label: "Mail" },
  { path: "/call", label: "Call" },
  { path: "/calls", label: "Calls" },
  { path: "/settings", label: "Settings" },
  { path: "/settings/build", label: "Settings Build" },
  ...(IS_CONNECTION_DIAGNOSTICS_ENABLED
    ? ([
        { path: "/settings/logs", label: "Diagnostics" },
        { path: "/logs", label: "Logs" },
      ] as const)
    : []),
  { path: "/services", label: "Services" },
  { path: "/all-services", label: "All Services" },
  { path: "/org/:orgId/project/:projectId/inbox", label: "Inbox" },
  { path: "/org/:orgId/project/:projectId/feed", label: "Feed" },
  { path: "/updates", label: "Update Center" },
];

export function getWebViewPages(): readonly WebViewPageDef[] {
  return webViewPages;
}

export function registerWebViewPage(page: WebViewPageDef): void {
  if (!webViewPages.some((p) => p.path === page.path)) {
    webViewPages.push(page);
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

let initialized = false;

export function initWebViewBridge(): () => void {
  if (initialized || typeof window === "undefined") return () => {};
  initialized = true;

  window.addEventListener("message", handleIncomingMessage);
  const unsubAuthHandler = onNativeMessage(handleAuthMessage);

  if (isWebView()) {
    getNativeBridge().setLoading(false);
    log.info("WebView bridge initialized", { platform: getWebViewPlatform() });
  }

  return () => {
    window.removeEventListener("message", handleIncomingMessage);
    unsubAuthHandler();
    initialized = false;
  };
}
