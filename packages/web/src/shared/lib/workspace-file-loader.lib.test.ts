import { beforeEach, describe, expect, it, vi } from "vitest";
import { downloadWorkspaceFile } from "~/shared/api/messenger-files.api";
import type { MessengerBinaryResult } from "~/shared/api/messenger-transport.internal";
import {
  createWorkspaceFileResourceCache,
  invalidateWorkspaceFileResourceCache,
  loadWorkspaceFile,
  type WorkspaceFileLoaderOptions,
} from "./workspace-file-loader.lib";

vi.mock("~/shared/api/messenger-files.api", () => ({
  downloadWorkspaceFile: vi.fn(),
}));

const downloadMock = vi.mocked(downloadWorkspaceFile);

const FILE_UUID = "33333333-3333-4333-8333-333333333333";

function options(overrides: Partial<WorkspaceFileLoaderOptions> = {}): WorkspaceFileLoaderOptions {
  return {
    ownerKey: "owner-a",
    runtimeGeneration: 1,
    fileUuid: FILE_UUID,
    requestOptions: { accessToken: "access-token" },
    ...overrides,
  };
}

function result(text = "file"): MessengerBinaryResult {
  return {
    blob: new Blob([text], { type: "text/plain" }),
    headers: new Headers({
      "Content-Disposition": 'attachment; filename="workspace.txt"',
      "Content-Type": "text/plain",
      "X-File": "workspace",
    }),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function requestSignal(): AbortSignal {
  const call = downloadMock.mock.calls[0];
  const signal = call?.[0]?.signal;
  if (signal == null) {
    throw new Error("Expected a shared request signal");
  }
  return signal;
}

describe("loadWorkspaceFile", () => {
  beforeEach(() => {
    downloadMock.mockReset();
  });

  it("joins simultaneous requests with the same owner, runtime, and file key", async () => {
    const request = deferred<MessengerBinaryResult>();
    downloadMock.mockReturnValue(request.promise);
    const transportSignal = new AbortController().signal;

    const first = loadWorkspaceFile(
      options({ requestOptions: { accessToken: "access-token", signal: transportSignal } }),
    );
    const second = loadWorkspaceFile(options());

    expect(downloadMock).toHaveBeenCalledTimes(1);
    expect(requestSignal()).not.toBe(transportSignal);

    const value = result();
    request.resolve(value);
    await expect(first).resolves.toBe(value);
    await expect(second).resolves.toBe(value);
  });

  it.each([
    ["ownerKey", { ownerKey: "owner-b" }],
    ["runtimeGeneration", { runtimeGeneration: 2 }],
  ])("does not join requests with a different %s", async (_name, override) => {
    downloadMock.mockResolvedValue(result());

    const first = loadWorkspaceFile(options());
    const second = loadWorkspaceFile(options(override));

    expect(downloadMock).toHaveBeenCalledTimes(2);
    await expect(first).resolves.toBeDefined();
    await expect(second).resolves.toBeDefined();
  });

  it("cancels only the first consumer while another consumer remains", async () => {
    const request = deferred<MessengerBinaryResult>();
    downloadMock.mockReturnValue(request.promise);
    const firstController = new AbortController();
    const secondController = new AbortController();

    const first = loadWorkspaceFile(options({ signal: firstController.signal }));
    const second = loadWorkspaceFile(options({ signal: secondController.signal }));
    firstController.abort();

    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(requestSignal().aborted).toBe(false);
    expect(requestSignal()).not.toBe(firstController.signal);
    expect(requestSignal()).not.toBe(secondController.signal);

    const value = result();
    request.resolve(value);
    await expect(second).resolves.toBe(value);
  });

  it("cancels the shared request when the last consumer is canceled", async () => {
    const request = deferred<MessengerBinaryResult>();
    downloadMock.mockReturnValue(request.promise);
    const firstController = new AbortController();
    const secondController = new AbortController();

    const first = loadWorkspaceFile(options({ signal: firstController.signal }));
    const second = loadWorkspaceFile(options({ signal: secondController.signal }));
    const sharedSignal = requestSignal();

    firstController.abort();
    secondController.abort();

    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    await expect(second).rejects.toMatchObject({ name: "AbortError" });
    expect(sharedSignal.aborted).toBe(true);
    expect(downloadMock).toHaveBeenCalledTimes(1);
  });

  it("starts a new request after the previous request has completed", async () => {
    downloadMock.mockResolvedValueOnce(result("first")).mockResolvedValueOnce(result("second"));

    const first = await loadWorkspaceFile(options());
    const second = await loadWorkspaceFile(options());

    expect(downloadMock).toHaveBeenCalledTimes(2);
    expect(await first.blob.text()).toBe("first");
    expect(await second.blob.text()).toBe("second");
  });

  it("passes through a download error to every active consumer", async () => {
    const request = deferred<MessengerBinaryResult>();
    downloadMock.mockReturnValue(request.promise);
    const error = new Error("download failed");

    const first = loadWorkspaceFile(options());
    const second = loadWorkspaceFile(options());
    request.reject(error);

    await expect(first).rejects.toBe(error);
    await expect(second).rejects.toBe(error);
    expect(downloadMock).toHaveBeenCalledTimes(1);
  });

  it("reuses a completed result from the resource cache", async () => {
    const resourceCache = createWorkspaceFileResourceCache();
    const value = result("cached");
    downloadMock.mockResolvedValue(value);

    const cached = await resourceCache.load(options());
    expect(cached).toBe(value);

    expect(downloadMock).toHaveBeenCalledTimes(1);
    expect(cached.headers.get("content-disposition")).toBe('attachment; filename="workspace.txt"');
  });

  it("does not reuse bytes cached before a realtime file mutation", async () => {
    const resourceCache = createWorkspaceFileResourceCache();
    downloadMock.mockResolvedValueOnce(result("before")).mockResolvedValueOnce(result("after"));

    expect(await (await resourceCache.load(options())).blob.text()).toBe("before");

    invalidateWorkspaceFileResourceCache("owner-a", FILE_UUID);

    expect(await (await resourceCache.load(options())).blob.text()).toBe("after");
    expect(downloadMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["ownerKey", { ownerKey: "owner-b" }],
    ["runtimeGeneration", { runtimeGeneration: 2 }],
    ["fileUuid", { fileUuid: "44444444-4444-4444-8444-444444444444" }],
  ])("does not reuse a completed result with a different %s", async (_name, override) => {
    const resourceCache = createWorkspaceFileResourceCache();
    downloadMock.mockResolvedValue(result());

    await resourceCache.load(options());
    await resourceCache.load(options(override));

    expect(downloadMock).toHaveBeenCalledTimes(2);
  });

  it("removes a failed result from the resource cache", async () => {
    const resourceCache = createWorkspaceFileResourceCache();
    downloadMock.mockRejectedValueOnce(new Error("download failed")).mockResolvedValue(result());

    await expect(resourceCache.load(options())).rejects.toThrow("download failed");
    await expect(resourceCache.load(options())).resolves.toBeDefined();

    expect(downloadMock).toHaveBeenCalledTimes(2);
  });

  it("supports aborting one resource-cache consumer without aborting another", async () => {
    const resourceCache = createWorkspaceFileResourceCache();
    const request = deferred<MessengerBinaryResult>();
    downloadMock.mockReturnValue(request.promise);
    const firstController = new AbortController();
    const secondController = new AbortController();

    const first = resourceCache.load(options({ signal: firstController.signal }));
    const second = resourceCache.load(options({ signal: secondController.signal }));
    firstController.abort();

    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    request.resolve(result());
    await expect(second).resolves.toBeDefined();
    expect(requestSignal().aborted).toBe(false);
  });

  it("clears cached resources and aborts their in-flight request", async () => {
    const resourceCache = createWorkspaceFileResourceCache();
    const request = deferred<MessengerBinaryResult>();
    downloadMock.mockReturnValue(request.promise);
    const consumerController = new AbortController();

    const pending = resourceCache.load(options({ signal: consumerController.signal }));
    const sharedSignal = requestSignal();
    resourceCache.clear();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(sharedSignal.aborted).toBe(true);
  });
});
