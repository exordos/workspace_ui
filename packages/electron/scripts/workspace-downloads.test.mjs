import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { dirname, resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const electronRoot = resolve(__dirname, "..");
const fileUuid = "123e4567-e89b-42d3-a456-426614174000";

let downloads;
let tempBuildDir;

before(async () => {
  tempBuildDir = mkdtempSync(path.join(tmpdir(), "workspace-downloads-test-"));
  const outfile = path.join(tempBuildDir, "workspace-downloads.js");
  await build({
    entryPoints: [resolve(electronRoot, "src", "workspace-downloads.ts")],
    outfile,
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    logLevel: "silent",
  });
  downloads = await import(pathToFileURL(outfile).href);
});

after(() => {
  if (tempBuildDir) rmSync(tempBuildDir, { recursive: true, force: true });
});

function validInput(overrides = {}) {
  return {
    id: "download-1",
    ownerKey: "account-1:project-1",
    accountId: "account-1",
    fileUuid,
    fileName: "report.pdf",
    organizationOrigin: "https://workspace.example.com",
    accessToken: "secret-token",
    ...overrides,
  };
}

describe("resolveWorkspaceDownloadRequest", () => {
  it("builds the fixed production endpoint and authorization headers", () => {
    const result = downloads.resolveWorkspaceDownloadRequest(validInput(), {
      isDev: false,
      devServerUrl: "http://localhost:5173",
    });

    const url = new URL(result.url);
    assert.equal(url.origin, "https://workspace.example.com");
    assert.equal(
      url.pathname,
      `/api/workspace/v1/messenger/files/${fileUuid}/actions/download`,
    );
    assert.match(url.searchParams.get("workspace_download_request"), /^[0-9a-f-]{36}$/i);
    assert.deepEqual(result?.headers, {
      Accept: "*/*",
      Authorization: "Bearer secret-token",
    });
  });

  it("uses only the local proxy in dev and identifies the validated target origin", () => {
    const result = downloads.resolveWorkspaceDownloadRequest(validInput(), {
      isDev: true,
      devServerUrl: "http://localhost:5173",
    });

    const url = new URL(result.url);
    assert.equal(url.origin, "http://localhost:5173");
    assert.equal(
      url.pathname,
      `/api/workspace/v1/messenger/files/${fileUuid}/actions/download`,
    );
    assert.match(url.searchParams.get("workspace_download_request"), /^[0-9a-f-]{36}$/i);
    assert.equal(result?.headers["X-Workspace-Dev-Target-Origin"], "https://workspace.example.com");
  });

  it("rejects unsafe origins, file ids, names and tokens", () => {
    const options = { isDev: false, devServerUrl: "http://localhost:5173" };
    assert.equal(
      downloads.resolveWorkspaceDownloadRequest(
        validInput({ organizationOrigin: "http://workspace.example.com" }),
        options,
      ),
      null,
    );
    assert.equal(
      downloads.resolveWorkspaceDownloadRequest(
        validInput({ organizationOrigin: "https://workspace.example.com/?injected=true" }),
        options,
      ),
      null,
    );
    assert.equal(
      downloads.resolveWorkspaceDownloadRequest(validInput({ fileUuid: "not-a-uuid" }), options),
      null,
    );
    assert.equal(
      downloads.resolveWorkspaceDownloadRequest(validInput({ fileName: "../report.pdf" }), options),
      null,
    );
    assert.equal(
      downloads.resolveWorkspaceDownloadRequest(validInput({ accessToken: "token\nheader" }), options),
      null,
    );
  });

  it("generates a different request URL for every start of the same file", () => {
    const options = { isDev: false, devServerUrl: "http://localhost:5173" };
    const first = downloads.resolveWorkspaceDownloadRequest(validInput(), options);
    const second = downloads.resolveWorkspaceDownloadRequest(validInput(), options);

    assert.notEqual(first.url, second.url);
    assert.equal(new URL(first.url).pathname, new URL(second.url).pathname);
  });
});

describe("resolveUniqueDownloadPath", () => {
  it("keeps the requested name when it is free", () => {
    const result = downloads.resolveUniqueDownloadPath("/downloads", "report.pdf", new Set(), () => false);
    assert.equal(result, path.join("/downloads", "report.pdf"));
  });

  it("skips existing and concurrently reserved names without losing the extension", () => {
    const occupied = new Set([path.join("/downloads", "report.tar (1).gz")]);
    const result = downloads.resolveUniqueDownloadPath(
      "/downloads",
      "report.tar.gz",
      occupied,
      (candidate) => candidate === path.join("/downloads", "report.tar.gz"),
    );
    assert.equal(result, path.join("/downloads", "report.tar (2).gz"));
  });
});

class FakeIpcMain {
  handlers = new Map();

  handle(channel, handler) {
    this.handlers.set(channel, handler);
  }
}

class FakeSession extends EventEmitter {
  downloadPath = null;

  setDownloadPath(downloadPath) {
    this.downloadPath = downloadPath;
  }
}

class FakeDownloadItem extends EventEmitter {
  constructor(url) {
    super();
    this.url = url;
  }

  receivedBytes = 0;
  totalBytes = 100;
  savePath = null;
  cancelled = false;

  getURL() {
    return this.url;
  }

  getURLChain() {
    return [this.url];
  }

  getReceivedBytes() {
    return this.receivedBytes;
  }

  getTotalBytes() {
    return this.totalBytes;
  }

  setSavePath(savePath) {
    this.savePath = savePath;
  }

  cancel() {
    this.cancelled = true;
    this.emit("done", {}, "cancelled");
  }
}

function createCoordinatorHarness(name, coordinatorOptions = {}) {
  const ipcMain = new FakeIpcMain();
  const session = new FakeSession();
  const requestedDownloads = [];
  const webContents = {
    id: 42,
    isDestroyed: () => false,
    send: () => {},
    downloadURL: (url, options) => requestedDownloads.push({ url, options }),
  };
  const downloadsPath = path.join(tempBuildDir, name);
  mkdirSync(downloadsPath);
  downloads.registerWorkspaceDownloadCoordinator({
    ipcMain,
    session,
    shell: { openPath: async () => "", showItemInFolder: () => {} },
    downloadsPath,
    isDev: false,
    devServerUrl: "http://localhost:5173",
    getMainWebContents: () => webContents,
    ...coordinatorOptions,
  });
  return { ipcMain, session, requestedDownloads, webContents };
}

describe("registerWorkspaceDownloadCoordinator", () => {
  it("deduplicates managed requests, ignores foreign downloads and opens only registered paths", async () => {
    const ipcMain = new FakeIpcMain();
    const session = new FakeSession();
    const sentEvents = [];
    const requestedDownloads = [];
    const openedPaths = [];
    const webContents = {
      id: 42,
      isDestroyed: () => false,
      send: (_channel, changed) => sentEvents.push(changed),
      downloadURL: (url, options) => requestedDownloads.push({ url, options }),
    };
    const downloadsPath = path.join(tempBuildDir, "downloads");
    mkdirSync(downloadsPath);
    downloads.registerWorkspaceDownloadCoordinator({
      ipcMain,
      session,
      shell: {
        openPath: async (filePath) => {
          openedPaths.push(filePath);
          return "";
        },
        showItemInFolder: () => {},
      },
      downloadsPath,
      isDev: false,
      devServerUrl: "http://localhost:5173",
      getMainWebContents: () => webContents,
    });

    assert.equal(session.listenerCount("will-download"), 1);
    const start = ipcMain.handlers.get("workspace-downloads:start");
    const input = validInput();
    const first = await start({ sender: webContents }, input);
    const duplicate = await start({ sender: webContents }, { ...input, id: "download-2" });
    assert.equal(first.ok, true);
    assert.equal(duplicate.reused, true);
    assert.equal(requestedDownloads.length, 1);

    const foreign = new FakeDownloadItem("https://example.com/foreign.zip");
    session.emit("will-download", {}, foreign, webContents);
    assert.equal(foreign.savePath, null);

    const item = new FakeDownloadItem(requestedDownloads[0].url);
    session.emit("will-download", {}, item, webContents);
    assert.equal(item.savePath, path.join(downloadsPath, "report.pdf"));
    item.receivedBytes = 50;
    item.emit("updated", {}, "progressing");
    writeFileSync(item.savePath, "downloaded");
    item.receivedBytes = 100;
    item.emit("done", {}, "completed");

    const snapshot = ipcMain.handlers.get("workspace-downloads:snapshot");
    const entries = await snapshot({ sender: webContents });
    assert.equal(entries[0].status, "downloaded");
    assert.equal(entries[0].receivedBytes, 100);
    assert.ok(sentEvents.some((event) => event.type === "upsert" && event.entry.status === "downloaded"));

    const action = ipcMain.handlers.get("workspace-downloads:action");
    assert.deepEqual(await action({ sender: webContents }, "open", input.id), { ok: true });
    assert.deepEqual(openedPaths, [item.savePath]);

    const dismiss = ipcMain.handlers.get("workspace-downloads:dismiss");
    assert.deepEqual(await dismiss({ sender: webContents }, [input.id]), { ok: true });
    assert.deepEqual(await snapshot({ sender: webContents }), []);
  });

  it("prevents a download item that arrives after cancellation while starting", async () => {
    const { ipcMain, session, requestedDownloads, webContents } = createCoordinatorHarness(
      "cancel-before-item",
    );
    const start = ipcMain.handlers.get("workspace-downloads:start");
    const action = ipcMain.handlers.get("workspace-downloads:action");
    const input = validInput();
    await start({ sender: webContents }, input);

    assert.deepEqual(await action({ sender: webContents }, "cancel", input.id), { ok: true });
    const event = { preventDefault: () => (event.prevented = true), prevented: false };
    const lateItem = new FakeDownloadItem(requestedDownloads[0].url);
    session.emit("will-download", event, lateItem, webContents);

    assert.equal(event.prevented, true);
    assert.equal(lateItem.savePath, null);
  });

  it("prevents a download item that arrives after the start timeout", async () => {
    const { ipcMain, session, requestedDownloads, webContents } = createCoordinatorHarness(
      "timeout-before-item",
      { startTimeoutMs: 5, lateItemTombstoneTtlMs: 1_000 },
    );
    const start = ipcMain.handlers.get("workspace-downloads:start");
    const snapshot = ipcMain.handlers.get("workspace-downloads:snapshot");
    await start({ sender: webContents }, validInput());
    await new Promise((resolve) => setTimeout(resolve, 15));
    assert.equal((await snapshot({ sender: webContents }))[0].errorCode, "start-timeout");

    const event = { preventDefault: () => (event.prevented = true), prevented: false };
    const lateItem = new FakeDownloadItem(requestedDownloads[0].url);
    session.emit("will-download", event, lateItem, webContents);

    assert.equal(event.prevented, true);
    assert.equal(lateItem.savePath, null);
  });

  for (const terminalReason of ["cancel", "timeout"]) {
    it(`keeps an immediate retry separate from an old ${terminalReason} tombstone`, async () => {
      const { ipcMain, session, requestedDownloads, webContents } = createCoordinatorHarness(
        `retry-after-${terminalReason}`,
        { startTimeoutMs: 5, lateItemTombstoneTtlMs: 1_000 },
      );
      const start = ipcMain.handlers.get("workspace-downloads:start");
      const action = ipcMain.handlers.get("workspace-downloads:action");
      const firstInput = validInput();
      await start({ sender: webContents }, firstInput);
      const oldUrl = requestedDownloads[0].url;

      if (terminalReason === "cancel") {
        await action({ sender: webContents }, "cancel", firstInput.id);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 15));
      }

      await start(
        { sender: webContents },
        validInput({ id: `retry-after-${terminalReason}` }),
      );
      const retryUrl = requestedDownloads[1].url;
      assert.notEqual(retryUrl, oldUrl);

      const retryEvent = {
        preventDefault: () => (retryEvent.prevented = true),
        prevented: false,
      };
      const retryItem = new FakeDownloadItem(retryUrl);
      session.emit("will-download", retryEvent, retryItem, webContents);
      assert.equal(retryEvent.prevented, false);
      assert.notEqual(retryItem.savePath, null);

      const oldEvent = { preventDefault: () => (oldEvent.prevented = true), prevented: false };
      const oldItem = new FakeDownloadItem(oldUrl);
      session.emit("will-download", oldEvent, oldItem, webContents);
      assert.equal(oldEvent.prevented, true);
      assert.equal(oldItem.savePath, null);
    });
  }
});
