import { contextBridge, ipcRenderer } from "electron";

const electronAPI = {
  /** Sync OS id for renderer (e.g. macOS title bar inset). Same as `app.getPlatform()`. */
  platform: process.platform,

  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke("app:getVersion"),
    getPlatform: (): Promise<string> => ipcRenderer.invoke("app:getPlatform"),
  },

  clipboard: {
    // Мост для записи в буфер обмена через main-процесс.
    writeText: (text: string): Promise<boolean> => ipcRenderer.invoke("clipboard:writeText", text),
    // Мост для чтения буфера обмена через main-процесс.
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
    show: (title: string, body: string): Promise<boolean> =>
      ipcRenderer.invoke("notifications:show", title, body),
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
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

export type ElectronAPI = typeof electronAPI;
