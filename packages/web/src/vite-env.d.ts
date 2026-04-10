/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

interface ImportMetaEnv {
  /** Workspace/Zulip API origin (e.g. https://zulip.example.com). REQUIRED. */
  readonly VITE_WORKSPACE_API_ORIGIN: string;
  /**
   * Zulip realm origin for `/user_uploads/` (standard Zulip: same host as API). Dev proxy target
   * for `/user_uploads/*`. Defaults to VITE_WORKSPACE_API_ORIGIN when unset.
   */
  readonly VITE_ZULIP_REALM_ORIGIN?: string;
  /**
   * When true, dev proxy forwards `/user_uploads/...` without a `/workspace/v1` prefix (standard
   * Zulip: `https://realm/user_uploads/...`). Same as VITE_USER_UPLOADS_PATH_PREFIX=realm-root.
   */
  readonly VITE_USER_UPLOADS_AT_REALM_ROOT?: string;
  /**
   * When API origin and VITE_ZULIP_REALM_ORIGIN differ, the dev upload proxy defaults to realm-root
   * paths. Set true only if uploads on the Zulip host are under a prefix (e.g. /workspace/v1).
   */
  readonly VITE_USER_UPLOADS_PREFIX_ON_ZULIP_REALM?: string;
  /** When true, Vite dev server logs each proxied request: method, path → upstream URL. */
  readonly VITE_DEV_PROXY_DEBUG?: string;
  /** Jitsi Meet domain without protocol (e.g. meet.example.com). Optional. */
  readonly VITE_JITSI_MEET_DOMAIN?: string;
  /** Override for Workspace API base URL. Optional. */
  readonly VITE_WORKSPACE_API_BASE_URL?: string;
  /** CDN base URL for static assets (e.g. https://cdn.example.com/workspace). Optional. */
  readonly VITE_CDN_URL?: string;
  /** Zulip API base path (default: /api/v1). For custom API gateways. */
  readonly VITE_ZULIP_API_PATH?: string;
  /** Workspace API base path (default: /api/v1). For Zulip uploads and legacy routing. */
  readonly VITE_WORKSPACE_API_PATH?: string;
  /** Extra path before Orval `/v1/...` routes (default empty). Use if Workspace REST is mounted under a prefix. */
  readonly VITE_WORKSPACE_REST_API_PATH?: string;
  /**
   * Path before `/user_uploads/` on the backend (e.g. `/workspace/v1`). Dev proxy rewrites
   * `/user_uploads/...` → `{prefix}/user_uploads/...`. Optional.
   */
  readonly VITE_USER_UPLOADS_PATH_PREFIX?: string;
  /** Sentry DSN for error tracking. Optional — disabled if empty. */
  readonly VITE_SENTRY_DSN?: string;
  /** App version for Sentry releases. Set by CI. */
  readonly VITE_APP_VERSION?: string;
  /** Comma-separated origins allowed for iframe embedding. */
  readonly VITE_EMBED_ALLOWED_ORIGINS?: string;
  /** Calendar page embed URL override. Optional. */
  readonly VITE_CALENDAR_EMBED_URL?: string;
  /** Mail page embed URL override. Optional. */
  readonly VITE_MAIL_EMBED_URL?: string;
  /** Persist chat messages to IndexedDB (write-through). Optional; legacy VITE_CHAT_MESSAGES_SOURCE_INDEXEDDB. */
  readonly VITE_CHAT_MESSAGES_PERSIST_INDEXEDDB?: string;
  /** @deprecated Prefer VITE_CHAT_MESSAGES_PERSIST_INDEXEDDB. */
  readonly VITE_CHAT_MESSAGES_SOURCE_INDEXEDDB?: string;
  /** Google Analytics 4 measurement ID (e.g. G-XXXXXXXXXX). Optional. */
  readonly VITE_GA4_MEASUREMENT_ID?: string;
  /** Yandex Metrika counter ID (numeric). Optional. */
  readonly VITE_YM_COUNTER_ID?: string;
  /** Firebase API key for FCM push. Optional. */
  readonly VITE_FIREBASE_API_KEY?: string;
  /** Firebase project ID. Optional. */
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  /** Firebase messaging sender ID (numeric). Optional. */
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  /** Firebase app ID. Optional. */
  readonly VITE_FIREBASE_APP_ID?: string;
  /** VAPID key for web push certificates. Optional. */
  readonly VITE_FIREBASE_VAPID_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "zulip-js" {
  const init: (config: { realm: string; username: string; apiKey: string }) => Promise<unknown>;
  export default init;
}

interface ElectronAPI {
  app: {
    getVersion: () => Promise<string>;
    getPlatform: () => Promise<string>;
  };
  theme: {
    shouldUseDarkColors: () => Promise<boolean>;
    set: (mode: "light" | "dark" | "system") => void;
  };
  window: {
    isMaximized: () => Promise<boolean>;
    isFocused: () => Promise<boolean>;
    minimize: () => void;
    maximize: () => void;
    close: () => void;
  };
  notifications: {
    show: (title: string, body: string) => Promise<boolean>;
  };
  os: {
    setBadgeCount: (count: number) => void;
    setProgressBar: (progress: number) => void;
    requestAttention: () => void;
    setLoginItemSettings: (openAtLogin: boolean) => void;
    getLoginItemSettings: () => Promise<{ openAtLogin: boolean }>;
  };
  updater: {
    check: () => void;
    install: () => void;
    onStatus: (callback: (data: { status: string; [key: string]: unknown }) => void) => () => void;
  };
  deeplink: {
    onNavigate: (callback: (route: string) => void) => () => void;
  };
  call: {
    start: (data: { room: string; participants?: number }) => void;
    end: () => void;
    update: (data: { participants?: number }) => void;
  };
  logs: {
    append: (line: string) => Promise<boolean>;
    getFilePath: () => Promise<string | null>;
  };
}

interface NativeAppBridge {
  platform?: "ios" | "android";
  postMessage(json: string): void;
}

interface Window {
  electronAPI?: ElectronAPI;
  NativeApp?: NativeAppBridge;
  webkit?: {
    messageHandlers: {
      nativeApp?: { postMessage(data: unknown): void };
    };
  };
}
