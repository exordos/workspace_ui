import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  nativeTheme,
  session,
  shell,
  ipcMain,
} from "electron";
import { autoUpdater } from "electron-updater";
import path from "node:path";

/** Set at compile time via `ELECTRON_DISABLE_AUTO_UPDATE` in esbuild (`get-main-esbuild-define.mjs`). */
declare const __ELECTRON_DISABLE_AUTO_UPDATE__: boolean;

const IS_DEV = !app.isPackaged;
const IS_AUTO_UPDATE_DISABLED = __ELECTRON_DISABLE_AUTO_UPDATE__;
const DEV_SERVER_URL = "http://localhost:5173";
const PRELOAD_PATH = path.join(__dirname, "preload.js");
const RESOURCES_PATH = path.join(__dirname, "..", "resources");

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let currentBadgeCount = 0;
let callPowerSaveBlockerId: number | null = null;
let activeCallRoom: string | null = null;

const LOG_DIR_NAME = "workspace_logs";
const LOG_FILE_NAME = "workspace.log";
const LOG_ROTATED_FILE_NAME = "workspace.log.1";
const MAX_LOG_FILE_BYTES = 1024 * 1024;
const MAX_LOG_LINE_LENGTH = 32768;

function getLogsDirectoryPath(): string {
  return path.join(app.getPath("userData"), LOG_DIR_NAME);
}

function getLogsFilePath(): string {
  return path.join(getLogsDirectoryPath(), LOG_FILE_NAME);
}

function getRotatedLogsFilePath(): string {
  return path.join(getLogsDirectoryPath(), LOG_ROTATED_FILE_NAME);
}

function ensureLogsDirectory(): void {
  try {
    require("node:fs").mkdirSync(getLogsDirectoryPath(), { recursive: true });
  } catch {
    // best-effort directory creation for diagnostics logs
  }
}

function rotateLogsIfNeeded(filePath: string): void {
  try {
    const fs = require("node:fs") as typeof import("node:fs");
    if (!fs.existsSync(filePath)) return;

    const stat = fs.statSync(filePath);
    if (stat.size < MAX_LOG_FILE_BYTES) return;

    const rotatedPath = getRotatedLogsFilePath();
    if (fs.existsSync(rotatedPath)) {
      fs.unlinkSync(rotatedPath);
    }
    fs.renameSync(filePath, rotatedPath);
  } catch {
    // rotation is best-effort; append can still proceed
  }
}

function appendLogsLine(rawLine: string): boolean {
  const sanitizedLine = rawLine
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .slice(0, MAX_LOG_LINE_LENGTH)
    .trim();
  if (!sanitizedLine) return false;

  const filePath = getLogsFilePath();

  try {
    const fs = require("node:fs") as typeof import("node:fs");
    ensureLogsDirectory();
    rotateLogsIfNeeded(filePath);
    fs.appendFileSync(filePath, `${new Date().toISOString()} ${sanitizedLine}\n`, "utf-8");
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Deep links (custom protocol: workspace://)
// ---------------------------------------------------------------------------

const PROTOCOL = "workspace";
let pendingDeepLink: string | null = null;

if (!IS_DEV) {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

function handleDeepLink(url: string): void {
  if (!url.startsWith(`${PROTOCOL}://`)) return;
  const route = url.replace(`${PROTOCOL}://open`, "").replace(`${PROTOCOL}://`, "");
  const safeRoute = route || "/";
  if (!isSafeDeeplinkRoute(safeRoute)) return;
  if (mainWindow) {
    mainWindow.webContents.send("deeplink:navigate", safeRoute);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  } else {
    pendingDeepLink = safeRoute;
  }
}

// macOS: open-url event (app already running or launched via URL)
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

// ---------------------------------------------------------------------------
// Single instance lock
// ---------------------------------------------------------------------------

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    // Windows/Linux: deep link URL is in argv
    const url = argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
    if (url) handleDeepLink(url);

    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ---------------------------------------------------------------------------
// Window state persistence
// ---------------------------------------------------------------------------

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

function loadWindowState(): WindowState {
  try {
    const data = require("node:fs").readFileSync(
      path.join(app.getPath("userData"), "window-state.json"),
      "utf-8",
    );
    return JSON.parse(data) as WindowState;
  } catch {
    return { width: 1440, height: 900, isMaximized: false };
  }
}

function saveWindowState(): void {
  if (!mainWindow) return;
  const bounds = mainWindow.getBounds();
  const state: WindowState = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized: mainWindow.isMaximized(),
  };
  try {
    require("node:fs").writeFileSync(
      path.join(app.getPath("userData"), "window-state.json"),
      JSON.stringify(state),
    );
  } catch {
    /* non-critical */
  }
}

function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" || parsed.protocol === "http:" || parsed.protocol === "mailto:"
    );
  } catch {
    return false;
  }
}

/** Rejects routes that could be used for script injection or external navigation. */
function isSafeDeeplinkRoute(route: string): boolean {
  const trimmed = route.trim();
  if (trimmed.length === 0 || trimmed.length > 512) return false;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:"))
    return false;
  if (trimmed.includes("//")) return false;
  return true;
}

function getWebRoot(): string {
  return path.join(__dirname, "..", "renderer");
}

function getIconPath(name: string): string {
  if (app.isPackaged) {
    const fs = require("node:fs") as typeof import("node:fs");
    const unpacked = path.join(process.resourcesPath, "app.asar.unpacked", "resources", name);
    if (fs.existsSync(unpacked)) {
      return unpacked;
    }
  }
  return path.join(RESOURCES_PATH, name);
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function createWindow(): void {
  const saved = loadWindowState();

  mainWindow = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    ...(saved.x != null && saved.y != null && { x: saved.x, y: saved.y }),
    minWidth: 960,
    minHeight: 600,
    title: "Workspace",
    backgroundColor: "#1B1B1D",
    show: false,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
    ...(process.platform === "darwin" && {
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 12, y: 12 },
      vibrancy: "sidebar",
    }),
    ...(process.platform === "linux" && {
      icon: getIconPath("icon.png"),
    }),
    ...(process.platform === "win32" && {
      autoHideMenuBar: true,
    }),
  });

  if (saved.isMaximized) {
    mainWindow.maximize();
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    if (pendingDeepLink && isSafeDeeplinkRoute(pendingDeepLink)) {
      mainWindow?.webContents.send("deeplink:navigate", pendingDeepLink);
    }
    pendingDeepLink = null;
  });

  mainWindow.on("close", () => saveWindowState());
  mainWindow.on("resize", () => saveWindowState());
  mainWindow.on("move", () => saveWindowState());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const appOrigin = IS_DEV ? DEV_SERVER_URL : "file://";
    if (!url.startsWith(appOrigin)) {
      event.preventDefault();
      if (isSafeExternalUrl(url)) {
        shell.openExternal(url);
      }
    }
  });

  mainWindow.on("focus", () => {
    mainWindow?.flashFrame(false);
  });

  if (IS_DEV) {
    mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(getWebRoot(), "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------

function createTray(): void {
  const iconFile = process.platform === "darwin" ? "tray-icon-mac.png" : "tray-icon.png";
  const iconPath = getIconPath(iconFile);

  try {
    const icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) return;

    tray = new Tray(icon.resize({ width: 16, height: 16 }));
    tray.setToolTip("Workspace");
    updateTrayMenu();

    tray.on("click", () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      } else {
        createWindow();
      }
    });
  } catch {
    // tray icon file missing — non-critical
  }
}

function updateTrayMenu(): void {
  if (!tray) return;

  const badgeLabel = currentBadgeCount > 0 ? ` (${currentBadgeCount} unread)` : "";

  const contextMenu = Menu.buildFromTemplate([
    { label: `Workspace${badgeLabel}`, enabled: false },
    { type: "separator" },
    {
      label: "Open",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      },
    },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);
  tray.setContextMenu(contextMenu);
}

// ---------------------------------------------------------------------------
// Badge Count (unread messages)
// ---------------------------------------------------------------------------

function setBadgeCount(count: number): void {
  currentBadgeCount = count;

  if (process.platform === "darwin") {
    app.dock?.setBadge(count > 0 ? String(count) : "");
  }

  if (process.platform === "linux") {
    app.setBadgeCount(count);
  }

  if (process.platform === "win32" && mainWindow) {
    if (count > 0) {
      const badge = createBadgeOverlay(count);
      mainWindow.setOverlayIcon(badge, `${count} unread`);
    } else {
      mainWindow.setOverlayIcon(null, "");
    }
  }

  updateTrayMenu();
}

function createBadgeOverlay(count: number): Electron.NativeImage {
  const size = 16;
  const canvas = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#FF0000"/>
      <text x="${size / 2}" y="${size / 2 + 4}" text-anchor="middle" font-size="10"
            font-weight="bold" fill="white" font-family="sans-serif">
        ${count > 99 ? "99+" : count}
      </text>
    </svg>`;
  return nativeImage.createFromBuffer(Buffer.from(canvas), { width: size, height: size });
}

// ---------------------------------------------------------------------------
// Progress Bar (taskbar/dock)
// ---------------------------------------------------------------------------

function setProgressBar(progress: number): void {
  if (!mainWindow) return;
  if (progress < 0) {
    mainWindow.setProgressBar(-1);
  } else {
    mainWindow.setProgressBar(Math.min(1, Math.max(0, progress)));
  }
}

// ---------------------------------------------------------------------------
// Flash Frame (attention request)
// ---------------------------------------------------------------------------

function requestAttention(): void {
  if (!mainWindow) return;

  if (mainWindow.isFocused()) return;

  if (process.platform === "darwin") {
    app.dock?.bounce("informational");
  } else {
    mainWindow.flashFrame(true);
  }
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.whenReady().then(() => {
  configureSecurityPolicy();
  buildNativeMenu();
  registerIpcHandlers();
  if (!IS_AUTO_UPDATE_DISABLED) {
    configureAutoUpdater();
  }
  createWindow();
  createTray();
});

// ---------------------------------------------------------------------------
// Native application menu
// ---------------------------------------------------------------------------

function buildNativeMenu(): void {
  const isMac = process.platform === "darwin";

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [isMac ? { role: "close" as const } : { role: "quit" as const }],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" as const },
        { role: "redo" as const },
        { type: "separator" as const },
        { role: "cut" as const },
        { role: "copy" as const },
        { role: "paste" as const },
        { role: "selectAll" as const },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" as const },
        { role: "forceReload" as const },
        { role: "toggleDevTools" as const },
        { type: "separator" as const },
        { role: "resetZoom" as const },
        { role: "zoomIn" as const },
        { role: "zoomOut" as const },
        { type: "separator" as const },
        { role: "togglefullscreen" as const },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" as const },
        { role: "zoom" as const },
        ...(isMac
          ? [{ type: "separator" as const }, { role: "front" as const }]
          : [{ role: "close" as const }]),
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ---------------------------------------------------------------------------
// Security
// ---------------------------------------------------------------------------

/**
 * Shell CSP must apply only to our SPA (Vite dev server or packaged `file:` assets).
 * If we set it on every response, cross-origin documents (e.g. Jitsi Meet in an iframe)
 * inherit `script-src 'self'` where `'self'` is the app origin — inline scripts on the
 * Meet page break. Third-party pages keep their own CSP from the network response.
 */
function shouldApplyShellContentSecurityPolicy(requestUrl: string): boolean {
  if (IS_DEV) {
    try {
      const u = new URL(requestUrl);
      const port = u.port || (u.protocol === "https:" ? "443" : "80");
      const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
      const http = u.protocol === "http:" || u.protocol === "https:";
      return http && local && port === "5173";
    } catch {
      return false;
    }
  }
  try {
    return new URL(requestUrl).protocol === "file:";
  } catch {
    return false;
  }
}

function configureSecurityPolicy(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!shouldApplyShellContentSecurityPolicy(details.url)) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }

    const csp = IS_DEV
      ? [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          "connect-src 'self' ws://localhost:* http://localhost:* https: wss:",
          "img-src 'self' data: https:",
          "font-src 'self' data:",
          "media-src 'self' https:",
          "frame-src https:",
        ]
      : [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline'",
          "connect-src 'self' https: wss:",
          "img-src 'self' data: https:",
          "font-src 'self'",
          "media-src 'self' https:",
          "frame-src https:",
        ];

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp.join("; ")],
      },
    });
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ["media", "notifications", "fullscreen"];
    callback(allowed.includes(permission));
  });
}

// ---------------------------------------------------------------------------
// IPC Handlers
// ---------------------------------------------------------------------------

function registerIpcHandlers(): void {
  // App info
  ipcMain.handle("app:getVersion", () => app.getVersion());
  ipcMain.handle("app:getPlatform", () => process.platform);

  // Theme
  ipcMain.handle("theme:shouldUseDarkColors", () => nativeTheme.shouldUseDarkColors);
  ipcMain.on("theme:set", (_event, mode: unknown) => {
    if (mode === "light" || mode === "dark" || mode === "system") {
      nativeTheme.themeSource = mode;
    }
  });

  // Window controls
  ipcMain.handle("window:isMaximized", () => mainWindow?.isMaximized() ?? false);
  ipcMain.handle("window:isFocused", () => mainWindow?.isFocused() ?? false);
  ipcMain.on("window:minimize", () => mainWindow?.minimize());
  ipcMain.on("window:maximize", () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.on("window:close", () => mainWindow?.close());

  // Notifications
  const MAX_NOTIFICATION_LENGTH = 200;
  ipcMain.handle("notifications:show", async (_event, title: unknown, body: unknown) => {
    const t = typeof title === "string" ? title.slice(0, MAX_NOTIFICATION_LENGTH) : "";
    const b = typeof body === "string" ? body.slice(0, MAX_NOTIFICATION_LENGTH) : "";
    if (!t.trim()) return false;
    try {
      const { Notification } = await import("electron");
      const notification = new Notification({ title: t, body: b });
      notification.on("click", () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      });
      notification.show();
      return true;
    } catch (err) {
      console.error("[electron] Notification failed:", err);
      return false;
    }
  });

  // OS integration
  ipcMain.on("os:setBadgeCount", (_event, count: number) => {
    const n = Math.max(0, Math.floor(Number(count) || 0));
    setBadgeCount(n);
  });

  ipcMain.on("os:setProgressBar", (_event, progress: number) => {
    const p = Number(progress);
    setProgressBar(Number.isFinite(p) ? p : -1);
  });

  ipcMain.on("os:requestAttention", () => {
    requestAttention();
  });

  ipcMain.on("os:setLoginItemSettings", (_event, openAtLogin: unknown) => {
    if (typeof openAtLogin === "boolean") {
      app.setLoginItemSettings({ openAtLogin });
    }
  });

  ipcMain.handle("os:getLoginItemSettings", () => {
    return app.getLoginItemSettings();
  });

  // Logs
  ipcMain.handle("logs:getFilePath", () => {
    try {
      ensureLogsDirectory();
      return getLogsFilePath();
    } catch {
      return null;
    }
  });

  ipcMain.handle("logs:append", (_event, line: unknown) => {
    if (typeof line !== "string") return false;
    return appendLogsLine(line);
  });

  // Call state — OS awareness
  const MAX_ROOM_LENGTH = 128;
  ipcMain.on("call:start", (_event, data?: { room?: string; participants?: number }) => {
    const room =
      typeof data?.room === "string"
        ? data.room.replace(/[\x00-\x1f\x7f]/g, "").slice(0, MAX_ROOM_LENGTH) || "Call"
        : "Call";
    activeCallRoom = room;

    // Prevent system sleep during call
    if (callPowerSaveBlockerId == null) {
      const { powerSaveBlocker } = require("electron") as typeof import("electron");
      callPowerSaveBlockerId = powerSaveBlocker.start("prevent-display-sleep");
    }

    // Update tray tooltip
    if (tray) {
      tray.setToolTip(`Workspace — In call: ${activeCallRoom}`);
    }

    // macOS dock: bouncing dot to show activity
    if (process.platform === "darwin") {
      app.dock?.setBadge("📞");
    }
  });

  ipcMain.on("call:end", () => {
    activeCallRoom = null;

    // Release power save blocker
    if (callPowerSaveBlockerId != null) {
      const { powerSaveBlocker } = require("electron") as typeof import("electron");
      powerSaveBlocker.stop(callPowerSaveBlockerId);
      callPowerSaveBlockerId = null;
    }

    // Restore tray tooltip
    if (tray) {
      tray.setToolTip("Workspace");
    }

    // Restore dock badge
    if (process.platform === "darwin") {
      app.dock?.setBadge(currentBadgeCount > 0 ? String(currentBadgeCount) : "");
    }
  });

  ipcMain.on("call:update", (_event, data?: { participants?: number }) => {
    if (activeCallRoom && tray) {
      const p = data?.participants ?? 0;
      tray.setToolTip(`Workspace — In call: ${activeCallRoom} (${p} participants)`);
    }
  });

  // Updater (skipped when built with ELECTRON_DISABLE_AUTO_UPDATE=1)
  ipcMain.on("updater:check", () => {
    if (IS_DEV || IS_AUTO_UPDATE_DISABLED) return;
    autoUpdater.checkForUpdates().catch(() => {});
  });
  ipcMain.on("updater:install", () => {
    if (IS_DEV || IS_AUTO_UPDATE_DISABLED) return;
    autoUpdater.quitAndInstall(false, true);
  });
}

// ---------------------------------------------------------------------------
// Auto-updater
// ---------------------------------------------------------------------------

function configureAutoUpdater(): void {
  if (IS_DEV || IS_AUTO_UPDATE_DISABLED) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.autoRunAppAfterInstall = true;

  function send(channel: string, data?: Record<string, unknown>) {
    mainWindow?.webContents.send(channel, data);
  }

  autoUpdater.on("checking-for-update", () => {
    send("updater:status", { status: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    send("updater:status", { status: "available", version: info.version });
  });

  autoUpdater.on("update-not-available", () => {
    send("updater:status", { status: "up-to-date" });
  });

  autoUpdater.on("download-progress", (progress) => {
    setProgressBar(progress.percent / 100);
    send("updater:status", {
      status: "downloading",
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    setProgressBar(-1);
    send("updater:status", { status: "ready", version: info.version });
  });

  autoUpdater.on("error", (err) => {
    setProgressBar(-1);
    send("updater:status", { status: "error", message: err.message });
  });

  const CHECK_INTERVAL_MS = 60 * 60 * 1000;
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, CHECK_INTERVAL_MS);
}
