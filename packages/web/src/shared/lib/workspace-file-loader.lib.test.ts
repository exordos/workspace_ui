import { beforeEach, describe, expect, it, vi } from "vitest";
import { downloadWorkspaceFile } from "~/shared/api/messenger-files.api";
import type { MessengerBinaryResult } from "~/shared/api/messenger-transport.internal";
import { loadWorkspaceFile, type WorkspaceFileLoaderOptions } from "./workspace-file-loader.lib";

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
    headers: new Headers({ "Content-Type": "text/plain", "X-File": "workspace" }),
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
});
