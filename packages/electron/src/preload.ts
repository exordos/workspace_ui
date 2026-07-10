import { contextBridge, ipcRenderer } from "electron";

export interface ElectronMainMemorySnapshot {
  collectedAt: string;
  main: NodeJS.MemoryUsage;
  system: Electron.SystemMemoryInfo;
  processes: Array<{
    pid: number;
    type: string;
    memory: { workingSetSize: number; peakWorkingSetSize: number };
    cpu?: { percentCPUUsage: number };
  }>;
  totalWorkingSetKb: number;
}

export interface ElectronRendererMemorySnapshot {
  processMemory: Electron.ProcessMemoryInfo;
  heapStatistics: Electron.HeapStatistics;
  blinkMemoryInfo: Electron.BlinkMemoryInfo;
}

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
      options?: { tag?: string; silent?: boolean; clickRoute?: string },
    ): Promise<boolean> => ipcRenderer.invoke("notifications:show", title, body, options),
    closeByTag: (tag: string): Promise<void> => ipcRenderer.invoke("notifications:closeByTag", tag),
    onClick: (callback: (tag: string) => void): (() => void) => {
      const handler = (_event: unknown, tag: string) => callback(tag);
      ipcRenderer.on("notifications:click", handler);
      return () => ipcRenderer.removeListener("notifications:click", handler);
    },
    diagnostics: (): Promise<{
      platform: string;
      isPackaged: boolean;
      appName: string;
      appVersion: string;
      appPath: string;
      exePath: string;
      userDataPath: string;
      notificationSupported: boolean;
    }> => ipcRenderer.invoke("notifications:diagnostics"),
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

  diagnostics: {
    getMemorySnapshot: (): Promise<ElectronMainMemorySnapshot> =>
      ipcRenderer.invoke("diagnostics:getMemorySnapshot"),
    getRendererMemory: (): Promise<ElectronRendererMemorySnapshot> =>
      Promise.all([
        process.getProcessMemoryInfo(),
        Promise.resolve(process.getHeapStatistics()),
        Promise.resolve(process.getBlinkMemoryInfo()),
      ]).then(([processMemory, heapStatistics, blinkMemoryInfo]) => ({
        processMemory,
        heapStatistics,
        blinkMemoryInfo,
      })),
  },
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

export type ElectronAPI = typeof electronAPI;
