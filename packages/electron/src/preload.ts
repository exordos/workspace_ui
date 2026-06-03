import { contextBridge, ipcRenderer } from "electron";

const electronAPI = {
  /** Sync OS id for renderer (e.g. macOS title bar inset). Same as `app.getPlatform()`. */
  platform: process.platform,

  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke("app:getVersion"),
    getPlatform: (): Promise<string> => ipcRenderer.invoke("app:getPlatform"),
  },

  clipboard: {
    writeText: (text: string): Promise<boolean> => ipcRenderer.invoke("clipboard:writeText", text),
    readText: (): Promise<string | null> => ipcRenderer.invoke("clipboard:readText"),
  },

  theme: {
    shouldUseDarkColors: (): Promise<boolean> => ipcRenderer.invoke("theme:shouldUseDarkColors"),
    set: (mode: "light" | "dark" | "system"): void => {
      ipcRenderer.send("theme:set", mode);
    },
  },

  window: {
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke("window:isMaximized"),
    isFocused: (): Promise<boolean> => ipcRenderer.invoke("window:isFocused"),
    minimize: (): void => ipcRenderer.send("window:minimize"),
    maximize: (): void => ipcRenderer.send("window:maximize"),
    close: (): void => ipcRenderer.send("window:close"),
  },

  notifications: {
    show: (
      title: string,
      body: string,
      options?: { tag?: string; silent?: boolean },
    ): Promise<boolean> => ipcRenderer.invoke("notifications:show", title, body, options),
    closeByTag: (tag: string): Promise<void> => ipcRenderer.invoke("notifications:closeByTag", tag),
  },

  os: {
    setBadgeCount: (count: number): void => ipcRenderer.send("os:setBadgeCount", count),
    setProgressBar: (progress: number): void => ipcRenderer.send("os:setProgressBar", progress),
    requestAttention: (): void => ipcRenderer.send("os:requestAttention"),
    setLoginItemSettings: (openAtLogin: boolean): void =>
      ipcRenderer.send("os:setLoginItemSettings", openAtLogin),
    getLoginItemSettings: (): Promise<{ openAtLogin: boolean }> =>
      ipcRenderer.invoke("os:getLoginItemSettings"),
  },

  updater: {
    check: (): void => ipcRenderer.send("updater:check"),
    install: (): void => ipcRenderer.send("updater:install"),
    onStatus: (
      callback: (data: { status: string; [key: string]: unknown }) => void,
    ): (() => void) => {
      const handler = (_event: unknown, data: { status: string; [key: string]: unknown }) =>
        callback(data);
      ipcRenderer.on("updater:status", handler);
      return () => ipcRenderer.removeListener("updater:status", handler);
    },
  },

  deeplink: {
    onNavigate: (callback: (route: string) => void): (() => void) => {
      const handler = (_event: unknown, route: string) => callback(route);
      ipcRenderer.on("deeplink:navigate", handler);
      return () => ipcRenderer.removeListener("deeplink:navigate", handler);
    },
  },

  call: {
    start: (data: { room: string; participants?: number }): void =>
      ipcRenderer.send("call:start", data),
    end: (): void => ipcRenderer.send("call:end"),
    update: (data: { participants?: number }): void => ipcRenderer.send("call:update", data),
  },

  logs: {
    append: (line: string): Promise<boolean> => ipcRenderer.invoke("logs:append", line),
    getFilePath: (): Promise<string | null> => ipcRenderer.invoke("logs:getFilePath"),
  },

  auth: {
    getCsrfToken: (payload: { realm: string }): Promise<string | null> =>
      ipcRenderer.invoke("auth:getCsrfToken", payload),
    // The renderer cannot access Electron session directly; it only asks the main process to exchange.
    exchangeDesktopFlowToken: (payload: {
      // Realm tells the main process which Zulip server should exchange the token.
      realm: string;
      // Token comes from desktop-flow and is only valid during exchange.
      token: string;
    }): Promise<
      | {
          ok: true;
          data: {
            // api_key means normal Basic auth; session means later requests use cookies.
            authType: "api_key" | "session";
            // Email is saved in the instance list after successful login.
            email: string;
            // API key exists only for api_key auth; session auth does not need it.
            apiKey?: string;
          };
        }
      | {
          ok: false;
          // A short reason is used by UI and logs, so they do not depend on error text.
          reason:
            | "INVALID_DESKTOP_FLOW_TOKEN"
            | "DESKTOP_FLOW_EXCHANGE_NETWORK_ERROR"
            | "DESKTOP_FLOW_EXCHANGE_HTTP_ERROR"
            | "DESKTOP_FLOW_SESSION_FAILED";
          // HTTP status is optional: network and validation errors do not have it.
          status?: number;
          // Details help debugging, but should not be shown to the user as is.
          details?: string;
        }
    > => ipcRenderer.invoke("auth:exchangeDesktopFlowToken", payload),
  },
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

export type ElectronAPI = typeof electronAPI;
