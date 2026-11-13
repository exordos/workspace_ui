import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const pageUrl = "file:///app/renderer/jitsi-call.html";
const mainPageUrl = "file:///app/renderer/index.html";
const payload = {
  callId: "call-1",
  meetingUrl: "https://meet.example.test/room",
  locationName: "Room",
  displayName: "Guest",
  startWithVideoMuted: true,
  language: "en",
};
const channels = {
  open: "jitsi-call-window:open",
  focus: "jitsi-call-window:focus",
  close: "jitsi-call-window:close",
  closed: "jitsi-call-window:closed",
  payload: "jitsi-call-window:get-payload",
  update: "jitsi-call-window:update-participants",
  participants: "jitsi-call-window:participants",
};

let registerJitsiCallWindow;
let harness;

function fakeContents(url) {
  return Object.assign(new EventEmitter(), {
    mainFrame: { url, frames: [] },
    sent: [],
    isDestroyed: () => false,
    send(channel, data) {
      this.sent.push({ channel, data });
    },
    setWindowOpenHandler() {},
  });
}

class FakeWindow extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.webContents = fakeContents(pageUrl);
    this.visible = false;
    this.destroyed = false;
    this.focusCount = 0;
    this.tracker = {
      destroyed: false,
      isDestroyed: () => this.tracker.destroyed,
      destroy: () => {
        this.tracker.destroyed = true;
      },
    };
    harness.windows.push(this);
  }

  loadURL(url) {
    assert.equal(url, pageUrl);
    return new Promise((resolve, reject) => {
      this.finishLoad = resolve;
      this.failLoad = reject;
    });
  }

  isVisible() {
    return this.visible;
  }

  isMinimized() {
    return false;
  }

  isDestroyed() {
    return this.destroyed;
  }

  show() {
    this.visible = true;
  }

  focus() {
    this.focusCount++;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.emit("closed");
  }
}

before(async () => {
  const fakeModule = {
    BrowserWindow: FakeWindow,
    ipcMain: {
      handle: (name, fn) => harness.invokes.set(name, fn),
      on: (name, fn) => harness.events.set(name, fn),
    },
    session: {
      fromPartition: (partition) => {
        harness.partition = partition;
        return harness.session;
      },
    },
    shell: {},
    setupScreenSharingMain: (window) => {
      harness.session.setDisplayMediaRequestHandler(() => {});
      return { _screenShareTracker: window.tracker };
    },
  };

  globalThis.jitsiCallWindowTestElectron = fakeModule;
  const result = await build({
    entryPoints: [fileURLToPath(new URL("../src/jitsi-call-window.ts", import.meta.url))],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    plugins: [
      {
        name: "mock-electron-and-jitsi",
        setup(builder) {
          builder.onResolve({ filter: /^(electron|@jitsi\/electron-sdk\/main)$/ }, ({ path }) => ({
            path,
            namespace: "jitsi-call-window-test",
          }));
          builder.onLoad({ filter: /.*/, namespace: "jitsi-call-window-test" }, ({ path }) => ({
            contents:
              path === "electron"
                ? "export const { BrowserWindow, ipcMain, session, shell } = globalThis.jitsiCallWindowTestElectron;"
                : "export const { setupScreenSharingMain } = globalThis.jitsiCallWindowTestElectron;",
          }));
        },
      },
    ],
  });

  const code = Buffer.from(result.outputFiles[0].text).toString("base64");
  ({ registerJitsiCallWindow } = await import(`data:text/javascript;base64,${code}`));
  delete globalThis.jitsiCallWindowTestElectron;
});

beforeEach(() => {
  const callSession = {
    webRequest: { onHeadersReceived: () => {} },
    setPermissionRequestHandler: (handler) => {
      callSession.requestPermission = handler;
    },
    setPermissionCheckHandler: (handler) => {
      callSession.checkPermission = handler;
    },
    setDisplayMediaRequestHandler: (handler) => {
      callSession.displayMedia = handler;
    },
  };
  harness = {
    windows: [],
    events: new Map(),
    invokes: new Map(),
    destroyed: [],
    main: fakeContents(`${mainPageUrl}#/chat/123`),
    session: callSession,
  };
  registerJitsiCallWindow({
    pageUrl,
    mainPageUrl,
    preloadPath: "/app/jitsi-call-window-preload.js",
    appName: "Workspace",
    isDev: false,
    isSafeExternalUrl: () => false,
    getMainWebContents: () => harness.main,
    onWindowDestroyed: (contents) => harness.destroyed.push(contents),
  });
});

function from(sender, senderFrame = sender.mainFrame) {
  return { sender, senderFrame };
}

function open(data = payload, event = from(harness.main)) {
  return harness.invokes.get(channels.open)(event, data);
}

test("accepts the trusted shell with a hash route and rejects child frames and another shell file", async () => {
  const originalUrl = harness.main.mainFrame.url;
  harness.main.mainFrame.url = "file:///tmp/other.html";
  assert.equal(await open(), false);
  harness.main.mainFrame.url = originalUrl;
  assert.equal(await open(payload, from(harness.main, { url: mainPageUrl })), false);
  assert.equal(harness.windows.length, 0);

  const opening = open();
  const [window] = harness.windows;
  assert.equal(harness.partition, "jitsi-call-window");
  assert.equal(window.options.webPreferences.session, harness.session);
  window.finishLoad();
  assert.equal(await opening, true);
  window.destroy();
});

test("reuses one live window and cleans up a crashed call without clearing a different call ID", async () => {
  const opening = open();
  const duplicate = open();
  const [window] = harness.windows;
  await assert.rejects(open({ ...payload, callId: "different-call" }), /already open/);
  window.finishLoad();
  assert.equal(await opening, true);
  assert.equal(await duplicate, true);
  assert.equal(harness.windows.length, 1);
  const windowEvent = from(window.webContents);
  assert.equal(harness.invokes.get(channels.payload)(windowEvent).callId, payload.callId);
  assert.equal(harness.invokes.get(channels.payload)(from(harness.main)), null);

  harness.events.get(channels.focus)(from(harness.main), payload.callId);
  assert.equal(window.focusCount, 1);
  harness.events.get(channels.close)(windowEvent, "different-call");
  assert.equal(window.destroyed, false);
  const participants = [{ displayName: "Guest" }];
  harness.events.get(channels.update)(windowEvent, payload.callId, participants);
  window.webContents.emit("render-process-gone");

  assert.equal(window.destroyed, true);
  assert.equal(window.tracker.destroyed, true);
  assert.equal(harness.session.displayMedia, null);
  assert.deepEqual(harness.destroyed, [window.webContents]);
  assert.deepEqual(harness.main.sent, [
    { channel: channels.participants, data: { callId: payload.callId, participants } },
    { channel: channels.closed, data: payload.callId },
  ]);
});

test("a failed startup or an early close settles only after disposing the window", async () => {
  const failed = open();
  const [failedWindow] = harness.windows;
  failedWindow.failLoad(new Error("Page unavailable"));
  assert.equal(await failed, false);
  assert.equal(failedWindow.destroyed, true);
  assert.equal(harness.session.displayMedia, null);

  const cancelled = open();
  const [, cancelledWindow] = harness.windows;
  harness.events.get(channels.close)(from(harness.main), payload.callId);
  assert.equal(await cancelled, false);
  assert.equal(cancelledWindow.destroyed, true);
  assert.deepEqual(harness.main.sent, []);
});

test("grants capture only for the active window and matching HTTPS child frame", async () => {
  const opening = open();
  const [window] = harness.windows;
  const contents = window.webContents;
  contents.mainFrame.frames.push({ url: payload.meetingUrl, detached: false });
  const request = (sender, requestingUrl, isMainFrame) => {
    let granted;
    harness.session.requestPermission(
      sender,
      "display-capture",
      (value) => {
        granted = value;
      },
      {
        isMainFrame,
        requestingUrl,
      },
    );
    return granted;
  };

  assert.equal(request(contents, payload.meetingUrl, false), true);
  assert.equal(request(contents, payload.meetingUrl, true), false);
  assert.equal(request(contents, "https://different.example.test/room", false), false);
  assert.equal(request(harness.main, payload.meetingUrl, false), false);

  window.destroy();
  assert.equal(await opening, false);
  assert.equal(request(contents, payload.meetingUrl, false), false);
});
