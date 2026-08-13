import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDownloadStore } from "~/entities/download/download.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { resetToastStateForTests, useToastStore } from "~/shared/lib/toast/toast.model";
import {
  cancelWorkspaceDownload,
  deriveWorkspaceDownloadFileName,
  dismissWorkspaceDownloads,
  openWorkspaceDownload,
  retryWorkspaceDownload,
  revealWorkspaceDownload,
  startWorkspaceFileDownload,
  triggerWorkspaceBrowserDownload,
} from "./workspace-file-download.lib";

const runtimeContext: WorkspaceRuntimeContext = {
  accountId: "org-a:project-a:user-a",
  instanceId: "instance-a",
  organizationId: "org-a",
  organizationOrigin: "https://org-a.example.com",
  projectId: "project-a",
  userUuid: "user-a",
  accessToken: "access-token",
  refreshToken: "refresh-token",
  runtimeGeneration: 1,
};

describe("workspace file download", () => {
  beforeEach(() => {
    delete (window as unknown as { electronAPI?: ElectronAPI }).electronAPI;
    useDownloadStore.setState({ entries: [], duplicateRequestTick: 0 });
    resetToastStateForTests();
    useWorkspaceAuthStore.setState({
      sessions: [
        {
          ...runtimeContext,
          login: "user@example.com",
          profile: {
            uuid: "user-a",
            username: "user",
            firstName: null,
            lastName: null,
            email: "user@example.com",
          },
        },
      ],
      currentAccountId: runtimeContext.accountId,
      runtimeGeneration: 1,
    });
  });

  afterEach(() => resetToastStateForTests());

  function installElectronDownloads(
    overrides: Partial<ElectronAPI["downloads"]> = {},
  ): ElectronAPI["downloads"] {
    const downloads: ElectronAPI["downloads"] = {
      start: vi.fn(),
      getSnapshot: vi.fn(),
      cancel: vi.fn(),
      open: vi.fn(),
      reveal: vi.fn(),
      dismiss: vi.fn(() => Promise.resolve({ ok: true as const })),
      onChanged: vi.fn(),
      ...overrides,
    };
    (window as unknown as { electronAPI: Partial<ElectronAPI> }).electronAPI = { downloads };
    return downloads;
  }

  it("derives a sanitized file name from response, hint, or UUID", () => {
    expect(
      deriveWorkspaceDownloadFileName({
        fileUuid: "file-uuid",
        fileNameHint: "hint.txt",
        contentDisposition: "attachment; filename*=UTF-8''server%20file.txt",
      }),
    ).toBe("server file.txt");
    expect(
      deriveWorkspaceDownloadFileName({ fileUuid: "file-uuid", fileNameHint: "hint.txt" }),
    ).toBe("hint.txt");
    expect(deriveWorkspaceDownloadFileName({ fileUuid: "file-uuid" })).toBe("file-uuid");
  });

  it("uses Blob fallback in a browser", async () => {
    vi.useFakeTimers();
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:file");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    await startWorkspaceFileDownload({
      runtimeContext,
      fileUuid: "file-uuid",
      fileNameHint: "hint.txt",
      loadBrowserResource: (freshRuntimeContext) => {
        expect(freshRuntimeContext.accessToken).toBe("access-token");
        return Promise.resolve({
          blob: new Blob(["hello"], { type: "text/plain" }),
          headers: new Headers({ "content-disposition": 'attachment; filename="server.txt"' }),
        });
      },
    });

    expect(useDownloadStore.getState().entries[0]).toMatchObject({
      ownerKey: workspaceRuntimeOwnerKey(runtimeContext),
      accountId: runtimeContext.accountId,
      fileUuid: "file-uuid",
      fileName: "server.txt",
      status: "downloaded",
      receivedBytes: 5,
      totalBytes: 5,
    });
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runOnlyPendingTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:file");

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    click.mockRestore();
    vi.useRealTimers();
  });

  it("starts Electron download with a fresh session and skips Blob loading", async () => {
    const start = vi.fn().mockImplementation((input: ElectronDownloadStartInput) =>
      Promise.resolve({
        ok: true as const,
        reused: false,
        entry: {
          id: input.id,
          ownerKey: input.ownerKey,
          accountId: input.accountId,
          fileUuid: input.fileUuid,
          fileName: input.fileName,
          status: "starting" as const,
          receivedBytes: 0,
          totalBytes: null,
          startedAt: 10,
        },
      }),
    );
    installElectronDownloads({ start });
    const loadBrowserResource = vi.fn();

    await startWorkspaceFileDownload({
      runtimeContext,
      fileUuid: "file-uuid",
      fileNameHint: "report.txt",
      loadBrowserResource,
    });

    expect(loadBrowserResource).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerKey: workspaceRuntimeOwnerKey(runtimeContext),
        accountId: runtimeContext.accountId,
        fileUuid: "file-uuid",
        fileName: "report.txt",
        organizationOrigin: "https://org-a.example.com",
        accessToken: "access-token",
      }),
    );
  });

  it("waits for a fresh session before creating an Electron entry", async () => {
    const refreshResponse = new Response(
      JSON.stringify({
        access_token: "fresh-access-token",
        refresh_token: "fresh-refresh-token",
        expires_in: 3600,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(refreshResponse);
    useWorkspaceAuthStore.setState((state) => ({
      sessions: state.sessions.map((session) => ({ ...session, expiresAtMs: 0 })),
    }));
    let resolveSnapshot: ((entries: ElectronDownloadEntry[]) => void) | undefined;
    const snapshot = new Promise<ElectronDownloadEntry[]>((resolve) => {
      resolveSnapshot = resolve;
    });
    const downloads = installElectronDownloads({
      getSnapshot: vi.fn(() => snapshot),
      start: vi.fn().mockImplementation((input: ElectronDownloadStartInput) =>
        Promise.resolve({
          ok: true as const,
          reused: false,
          entry: {
            id: input.id,
            ownerKey: input.ownerKey,
            accountId: input.accountId,
            fileUuid: input.fileUuid,
            fileName: input.fileName,
            status: "starting" as const,
            receivedBytes: 0,
            totalBytes: null,
            startedAt: 10,
          },
        }),
      ),
    });

    const startPromise = startWorkspaceFileDownload({
      runtimeContext,
      fileUuid: "123e4567-e89b-42d3-a456-426614174000",
      fileNameHint: "report.txt",
      loadBrowserResource: vi.fn(),
    });
    resolveSnapshot?.([]);
    await startPromise;

    expect(downloads.start).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "fresh-access-token" }),
    );
    expect(useDownloadStore.getState().entries).toHaveLength(1);
    fetchMock.mockRestore();
  });

  it("dismisses the old failed entry before retrying", async () => {
    useDownloadStore.getState().replaceDownloads([
      {
        id: "failed-download",
        ownerKey: workspaceRuntimeOwnerKey(runtimeContext),
        accountId: runtimeContext.accountId,
        fileUuid: "123e4567-e89b-42d3-a456-426614174000",
        fileName: "report.txt",
        status: "error",
        receivedBytes: 0,
        totalBytes: null,
        startedAt: 1,
        errorCode: "interrupted",
      },
    ]);
    const dismiss = vi.fn(() => Promise.resolve({ ok: true as const }));
    const start = vi.fn().mockImplementation((input: ElectronDownloadStartInput) =>
      Promise.resolve({
        ok: true as const,
        reused: false,
        entry: {
          id: input.id,
          ownerKey: input.ownerKey,
          accountId: input.accountId,
          fileUuid: input.fileUuid,
          fileName: input.fileName,
          status: "starting" as const,
          receivedBytes: 0,
          totalBytes: null,
          startedAt: 2,
        },
      }),
    );
    installElectronDownloads({ dismiss, start });

    await retryWorkspaceDownload("failed-download");

    expect(dismiss).toHaveBeenCalledWith(["failed-download"]);
    expect(start).toHaveBeenCalledOnce();
    expect(useDownloadStore.getState().entries).toHaveLength(1);
    expect(useDownloadStore.getState().entries[0]).toMatchObject({ status: "starting" });
    expect(useDownloadStore.getState().entries[0]?.id).not.toBe("failed-download");
  });

  it("keeps the old error and shows feedback when dismiss before retry fails", async () => {
    useDownloadStore.getState().replaceDownloads([
      {
        id: "failed-download",
        ownerKey: workspaceRuntimeOwnerKey(runtimeContext),
        accountId: runtimeContext.accountId,
        fileUuid: "123e4567-e89b-42d3-a456-426614174000",
        fileName: "report.txt",
        status: "error",
        receivedBytes: 0,
        totalBytes: null,
        startedAt: 1,
      },
    ]);
    const start = vi.fn().mockResolvedValue({ ok: false, errorCode: "start-failed" });
    installElectronDownloads({
      dismiss: vi.fn().mockRejectedValue(new Error("IPC failed")),
      start,
    });

    await retryWorkspaceDownload("failed-download");

    expect(start).not.toHaveBeenCalled();
    expect(useDownloadStore.getState().entries[0]?.id).toBe("failed-download");
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it("shows a visible error when open or reveal fails", async () => {
    installElectronDownloads({
      open: vi.fn().mockResolvedValue({ ok: false, errorCode: "open-failed" }),
      reveal: vi.fn().mockRejectedValue(new Error("IPC failed")),
    });

    await openWorkspaceDownload("download-a");
    expect(useToastStore.getState().toasts).toHaveLength(1);

    resetToastStateForTests();
    await revealWorkspaceDownload("download-a");
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it("shows a visible error when cancel or dismiss IPC rejects", async () => {
    installElectronDownloads({
      cancel: vi.fn().mockRejectedValue(new Error("IPC failed")),
      dismiss: vi.fn().mockRejectedValue(new Error("IPC failed")),
    });

    await cancelWorkspaceDownload("download-a");
    expect(useToastStore.getState().toasts).toHaveLength(1);

    resetToastStateForTests();
    await dismissWorkspaceDownloads(["download-a"]);
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it("revokes the Blob URL after a browser download", () => {
    vi.useFakeTimers();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:file");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    triggerWorkspaceBrowserDownload(new Blob(["file"]), "report.txt");

    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runOnlyPendingTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:file");
    vi.useRealTimers();
  });
});
