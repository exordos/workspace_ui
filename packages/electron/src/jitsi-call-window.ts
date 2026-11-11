import { BrowserWindow, ipcMain, session, shell } from "electron";
import { setupScreenSharingMain } from "@jitsi/electron-sdk/main";
import {
  JITSI_CALL_WINDOW_IPC,
  type JitsiCallWindowParticipant,
  type JitsiCallWindowPayload,
} from "./jitsi-call-window.contract";
import { getShellContentSecurityPolicy } from "./security-policy.lib";

const CALL_PARTITION = "jitsi-call-window";
const WINDOW_LOAD_TIMEOUT_MS = 15_000;
const MAX_PARTICIPANTS = 1_000;
const MAX_DISPLAY_NAME_LENGTH = 256;

interface JitsiCallWindowOptions {
  getMainWebContents: () => Electron.WebContents | null;
  pageUrl: string;
  mainPageUrl: string;
  preloadPath: string;
  appName: string;
  isDev: boolean;
  icon?: string;
  isSafeExternalUrl: (url: string) => boolean;
  onWindowDestroyed: (contents: Electron.WebContents) => void;
}

interface ActiveWindow {
  owner: Electron.WebContents;
  window: BrowserWindow;
  contents: Electron.WebContents;
  payload: JitsiCallWindowPayload;
  ready: Promise<boolean>;
  loaded: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readPayload(input: unknown): JitsiCallWindowPayload | null {
  if (!isRecord(input)) return null;
  const { callId, meetingUrl, locationName, displayName, startWithVideoMuted, language, theme } =
    input;

  if (
    typeof callId !== "string" ||
    callId.length === 0 ||
    callId.length > 128 ||
    typeof meetingUrl !== "string" ||
    meetingUrl.length > 8192 ||
    typeof locationName !== "string" ||
    typeof displayName !== "string" ||
    typeof startWithVideoMuted !== "boolean" ||
    (language !== "ru" && language !== "en")
  ) {
    return null;
  }

  try {
    const url = new URL(meetingUrl);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password ||
      !url.pathname.replace(/^\/+/, "")
    ) {
      return null;
    }

    const validTheme =
      isRecord(theme) &&
      (theme.mode === "light" || theme.mode === "dark") &&
      typeof theme.paletteId === "string" &&
      theme.paletteId.length <= 128
        ? ({ mode: theme.mode, paletteId: theme.paletteId } as const)
        : undefined;

    return {
      callId,
      meetingUrl,
      locationName: locationName.slice(0, MAX_DISPLAY_NAME_LENGTH),
      displayName: displayName.slice(0, MAX_DISPLAY_NAME_LENGTH),
      startWithVideoMuted,
      language,
      theme: validTheme,
    };
  } catch {
    return null;
  }
}

function readParticipants(input: unknown): JitsiCallWindowParticipant[] | null {
  if (!Array.isArray(input)) return null;
  return input
    .slice(0, MAX_PARTICIPANTS)
    .flatMap((participant: unknown) =>
      isRecord(participant) && typeof participant.displayName === "string"
        ? [{ displayName: participant.displayName.slice(0, MAX_DISPLAY_NAME_LENGTH) }]
        : [],
    );
}

function getUrlOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function configureCallSession(
  callSession: Electron.Session,
  contents: Electron.WebContents,
  payload: JitsiCallWindowPayload,
  options: JitsiCallWindowOptions,
): void {
  // The Jitsi embed uses the meeting URL's hostname and constructs an HTTPS iframe.
  const meetingOrigin = `https://${new URL(payload.meetingUrl).hostname}`;
  const csp = getShellContentSecurityPolicy(options.isDev).join("; ");
  callSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders:
        details.url === options.pageUrl
          ? { ...details.responseHeaders, "Content-Security-Policy": [csp] }
          : details.responseHeaders,
    });
  });

  const isMeetingFrame = (
    sender: Electron.WebContents | null,
    isMainFrame: boolean,
    requestingUrl: string,
  ): boolean =>
    sender === contents &&
    !contents.isDestroyed() &&
    !isMainFrame &&
    getUrlOrigin(requestingUrl) === meetingOrigin &&
    contents.mainFrame.frames.some(
      (frame) => !frame.detached && getUrlOrigin(frame.url) === meetingOrigin,
    );

  callSession.setPermissionRequestHandler((sender, permission, callback, details) => {
    callback(
      (permission === "media" || permission === "display-capture" || permission === "fullscreen") &&
        isMeetingFrame(sender, details.isMainFrame, details.requestingUrl),
    );
  });
  callSession.setPermissionCheckHandler(
    (sender, permission, origin, details) =>
      (permission === "media" || permission === "fullscreen") &&
      isMeetingFrame(sender, details.isMainFrame, origin),
  );
}

function destroyWindow(window: BrowserWindow): void {
  if (!window.isDestroyed()) window.destroy();
}

function focusWindow(window: BrowserWindow): void {
  if (window.isMinimized()) window.restore();
  if (!window.isVisible()) window.show();
  window.focus();
}

async function loadWindow(active: ActiveWindow, pageUrl: string): Promise<boolean> {
  const { window } = active;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let onClosed: (() => void) | undefined;
  const closed = new Promise<false>((resolve) => {
    onClosed = () => resolve(false);
    window.once("closed", onClosed);
  });

  try {
    const timedOut = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(
        () => reject(new Error("Jitsi call window timed out")),
        WINDOW_LOAD_TIMEOUT_MS,
      );
    });
    const loaded = await Promise.race([window.loadURL(pageUrl), timedOut, closed]);
    if (loaded === false || window.isDestroyed()) return false;
    window.show();
    active.loaded = true;
    return true;
  } catch {
    destroyWindow(window);
    return await closed;
  } finally {
    clearTimeout(timeout);
    if (onClosed) window.removeListener("closed", onClosed);
  }
}

function isTrustedMainFrameUrl(url: string, mainPageUrl: string): boolean {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.href === mainPageUrl;
  } catch {
    return false;
  }
}

export function registerJitsiCallWindow(options: JitsiCallWindowOptions) {
  let activeWindow: ActiveWindow | null = null;
  const callSession = session.fromPartition(CALL_PARTITION);

  const isMainSender = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): boolean =>
    event.sender === options.getMainWebContents() &&
    event.senderFrame != null &&
    event.senderFrame === event.sender.mainFrame &&
    isTrustedMainFrameUrl(event.senderFrame.url, options.mainPageUrl);

  const isCallSender = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): boolean =>
    event.sender === activeWindow?.contents &&
    event.senderFrame === event.sender.mainFrame &&
    event.senderFrame?.url === options.pageUrl;

  const close = (): void => {
    if (activeWindow) destroyWindow(activeWindow.window);
  };

  ipcMain.handle(JITSI_CALL_WINDOW_IPC.open, async (event, input: unknown) => {
    if (!isMainSender(event)) return false;
    const payload = readPayload(input);
    if (activeWindow) {
      if (activeWindow.owner !== event.sender || activeWindow.payload.callId !== payload?.callId) {
        throw new Error("A different Jitsi call window is already open");
      }
      if (activeWindow.loaded) focusWindow(activeWindow.window);
      return activeWindow.ready;
    }
    if (!payload) return false;

    let window: BrowserWindow;
    try {
      window = new BrowserWindow({
        width: 1000,
        height: 720,
        minWidth: 400,
        minHeight: 300,
        title: options.appName,
        backgroundColor: "#1B1B1D",
        icon: options.icon,
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
          preload: options.preloadPath,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          session: callSession,
        },
      });
    } catch {
      return false;
    }
    const contents = window.webContents;
    const active: ActiveWindow = {
      owner: event.sender,
      window,
      contents,
      payload,
      ready: Promise.resolve(false),
      loaded: false,
    };
    activeWindow = active;

    let screenSharing: ReturnType<typeof setupScreenSharingMain> | undefined;
    window.once("closed", () => {
      activeWindow = null;
      callSession.setDisplayMediaRequestHandler(null);
      callSession.setPermissionRequestHandler((_sender, _permission, callback) => callback(false));
      callSession.setPermissionCheckHandler(() => false);
      callSession.webRequest.onHeadersReceived(null);

      // The SDK rejects outstanding picker requests on close but leaves its tracker window open.
      const tracker = screenSharing?._screenShareTracker;
      if (tracker && !tracker.isDestroyed()) tracker.destroy();

      options.onWindowDestroyed(contents);
      if (active.loaded && !active.owner.isDestroyed()) {
        active.owner.send(JITSI_CALL_WINDOW_IPC.closed, payload.callId);
      }
    });

    try {
      configureCallSession(callSession, contents, payload, options);
      // The main window already checks macOS screen recording permission at app startup.
      screenSharing = setupScreenSharingMain(window, options.appName);

      contents.setWindowOpenHandler(({ url }) => {
        if (options.isSafeExternalUrl(url)) void shell.openExternal(url).catch(() => undefined);
        return { action: "deny" };
      });
      contents.on("will-navigate", (event) => event.preventDefault());
      contents.on("will-redirect", (event) => {
        if (event.isMainFrame) event.preventDefault();
      });
      contents.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => {
        if (active.loaded && isMainFrame && !isInPlace) destroyWindow(window);
      });
      contents.on("will-prevent-unload", (event) => event.preventDefault());
      contents.once("render-process-gone", () => destroyWindow(window));

      active.ready = loadWindow(active, options.pageUrl);
      return active.ready;
    } catch {
      destroyWindow(window);
      return false;
    }
  });

  ipcMain.on(JITSI_CALL_WINDOW_IPC.focus, (event, callId: unknown) => {
    if (
      activeWindow?.loaded &&
      callId === activeWindow.payload.callId &&
      isMainSender(event) &&
      event.sender === activeWindow.owner
    ) {
      focusWindow(activeWindow.window);
    }
  });
  ipcMain.on(JITSI_CALL_WINDOW_IPC.close, (event, callId: unknown) => {
    if (!activeWindow || activeWindow.payload.callId !== callId) return;
    if (isCallSender(event) || (isMainSender(event) && event.sender === activeWindow.owner)) {
      close();
    }
  });
  ipcMain.handle(JITSI_CALL_WINDOW_IPC.getPayload, (event) =>
    isCallSender(event) ? (activeWindow?.payload ?? null) : null,
  );
  ipcMain.on(JITSI_CALL_WINDOW_IPC.updateParticipants, (event, callId: unknown, input: unknown) => {
    if (!activeWindow || callId !== activeWindow.payload.callId || !isCallSender(event)) return;
    const participants = readParticipants(input);
    if (participants && !activeWindow.owner.isDestroyed()) {
      activeWindow.owner.send(JITSI_CALL_WINDOW_IPC.participants, { callId, participants });
    }
  });

  return { close, isCallSender, isMainSender };
}
