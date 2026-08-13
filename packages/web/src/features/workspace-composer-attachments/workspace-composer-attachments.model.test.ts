import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createWorkspaceComposerAttachmentsController,
  selectWorkspaceComposerAttachmentViews,
  selectWorkspaceComposerAttachmentsBlockSend,
  selectWorkspaceComposerAttachmentsReady,
} from "./workspace-composer-attachments.model";
import type {
  WorkspaceComposerAttachmentServerMetadata,
  WorkspaceComposerAttachmentTransport,
  WorkspaceComposerAttachmentUploadContext,
} from "./workspace-composer-attachments.types";

const SCOPE = { ownerKey: "owner-a", runtimeGeneration: 1, scopeKey: "topic-a" };

function file(name: string, contents = name): File {
  return new File([contents], name, { type: "text/plain" });
}

function metadata(name: string): WorkspaceComposerAttachmentServerMetadata {
  return {
    uuid: `uuid-${name}`,
    markdownLink: `[${name}](urn:file:${name})`,
    contentType: "text/plain",
    name,
    sizeBytes: name.length,
  };
}

function transport(
  upload: WorkspaceComposerAttachmentTransport["upload"],
  deleteAttachment: WorkspaceComposerAttachmentTransport["delete"] = () => Promise.resolve(),
): WorkspaceComposerAttachmentTransport {
  return { upload, delete: deleteAttachment };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function pngFile(name: string): File {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], name, {
    type: "image/png",
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("workspace composer attachments", () => {
  it("auto-starts uploads in insertion order with at most five concurrent requests", async () => {
    const requests = Array.from({ length: 7 }, () =>
      deferred<WorkspaceComposerAttachmentServerMetadata>(),
    );
    let active = 0;
    let maxActive = 0;
    const upload = vi.fn((_uploadFile: File) => {
      const requestIndex = upload.mock.calls.length - 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      return requests[requestIndex]!.promise.finally(() => {
        active -= 1;
      });
    });
    let idSequence = 0;
    const controller = createWorkspaceComposerAttachmentsController({
      scope: SCOPE,
      transport: transport(upload),
      createLocalId: () => `local-${++idSequence}`,
    });
    const files = Array.from({ length: 7 }, (_, index) => file(`file-${index + 1}.txt`));

    const localIds = controller.add(files);

    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(5));
    expect(maxActive).toBe(5);
    expect(localIds).toEqual([
      "local-1",
      "local-2",
      "local-3",
      "local-4",
      "local-5",
      "local-6",
      "local-7",
    ]);
    expect(upload.mock.calls.map(([uploadFile]) => uploadFile.name)).toEqual(
      files.slice(0, 5).map((item) => item.name),
    );

    requests[0]!.resolve(metadata(files[0]!.name));
    requests[1]!.resolve(metadata(files[1]!.name));
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(7));
    expect(maxActive).toBe(5);
    expect(controller.store.getState().attachments.map((item) => item.file.name)).toEqual(
      files.map((item) => item.name),
    );

    for (let index = 2; index < requests.length; index += 1) {
      requests[index]!.resolve(metadata(files[index]!.name));
    }
    await vi.waitFor(() =>
      expect(controller.store.getState().attachments.every((item) => item.status === "ready")).toBe(
        true,
      ),
    );
  });

  it("starts immediately after add and does not require message text", async () => {
    const upload = vi.fn((uploadFile: File) => Promise.resolve(metadata(uploadFile.name)));
    const controller = createWorkspaceComposerAttachmentsController({
      scope: SCOPE,
      transport: transport(upload),
    });

    controller.add([file("standalone.txt")]);

    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(controller.store.getState().attachments[0]?.status).toBe("ready"),
    );
  });

  it("creates one persistent image preview across upload retry and exposes it File-free", async () => {
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:draft-image");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const upload = vi
      .fn<(uploadFile: File) => Promise<WorkspaceComposerAttachmentServerMetadata>>()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockImplementation((uploadFile) => Promise.resolve(metadata(uploadFile.name)));
    const controller = createWorkspaceComposerAttachmentsController({
      scope: SCOPE,
      transport: transport(upload),
    });

    const [localId] = controller.add([pngFile("retry.png")]);
    await vi.waitFor(() =>
      expect(controller.store.getState().attachments[0]?.status).toBe("error"),
    );
    controller.retry(localId!);
    await vi.waitFor(() =>
      expect(controller.store.getState().attachments[0]?.status).toBe("ready"),
    );

    const [view] = selectWorkspaceComposerAttachmentViews(controller.store.getState());
    expect(view).toEqual(expect.objectContaining({ previewUrl: "blob:draft-image" }));
    expect(view).not.toHaveProperty("file");
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).not.toHaveBeenCalled();

    controller.remove(localId!);
    controller.remove(localId!);
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:draft-image");
  });

  it("does not allocate an object URL for a non-image attachment", () => {
    const createObjectUrl = vi.spyOn(URL, "createObjectURL");
    const controller = createWorkspaceComposerAttachmentsController({
      scope: SCOPE,
      transport: transport((uploadFile) => Promise.resolve(metadata(uploadFile.name))),
    });

    controller.add([file("document.pdf")]);

    expect(controller.store.getState().attachments[0]?.previewUrl).toBeNull();
    expect(createObjectUrl).not.toHaveBeenCalled();
  });

  it("rejects empty, oversized, and invalid image files before transport upload", async () => {
    const upload = vi.fn((uploadFile: File) => Promise.resolve(metadata(uploadFile.name)));
    const controller = createWorkspaceComposerAttachmentsController({
      scope: SCOPE,
      transport: transport(upload),
    });
    const oversized = file("large.txt");
    Object.defineProperty(oversized, "size", { value: 25 * 1024 * 1024 + 1 });
    const invalidPng = new File(["not-png"], "invalid.png", { type: "image/png" });

    const [emptyLocalId] = controller.add([new File([], "empty.txt"), oversized, invalidPng]);

    expect(controller.store.getState().attachments.map((item) => item.status)).toEqual([
      "error",
      "error",
      "validating",
    ]);
    await vi.waitFor(() =>
      expect(controller.store.getState().attachments.map((item) => item.status)).toEqual([
        "error",
        "error",
        "error",
      ]),
    );
    expect(upload).not.toHaveBeenCalled();
    expect(controller.store.getState().attachments.map((item) => item.errorKind)).toEqual([
      "validation",
      "validation",
      "validation",
    ]);
    controller.retry(emptyLocalId!);
    expect(controller.store.getState().attachments[0]?.status).toBe("error");
    expect(upload).not.toHaveBeenCalled();
  });

  it("removes an attachment while asynchronous image validation is still pending", async () => {
    const imageBytes = deferred<ArrayBuffer>();
    const pendingImage = new File(["pending"], "pending.png", { type: "image/png" });
    vi.spyOn(pendingImage, "arrayBuffer").mockReturnValue(imageBytes.promise);
    const upload = vi.fn((uploadFile: File) => Promise.resolve(metadata(uploadFile.name)));
    const controller = createWorkspaceComposerAttachmentsController({
      scope: SCOPE,
      transport: transport(upload),
    });

    const [localId] = controller.add([pendingImage]);
    expect(controller.store.getState().attachments[0]?.status).toBe("validating");

    controller.remove(localId!);
    imageBytes.resolve(new ArrayBuffer(0));
    await Promise.resolve();
    await Promise.resolve();

    expect(controller.store.getState().attachments).toEqual([]);
    expect(upload).not.toHaveBeenCalled();
  });

  it("retries only the failed attachment and preserves its local id", async () => {
    const upload = vi
      .fn<(uploadFile: File) => Promise<WorkspaceComposerAttachmentServerMetadata>>()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockImplementation((uploadFile) => Promise.resolve(metadata(uploadFile.name)));
    const controller = createWorkspaceComposerAttachmentsController({
      scope: SCOPE,
      transport: transport(upload),
      createLocalId: () => "stable-local-id",
    });

    const [localId] = controller.add([file("retry.txt")]);
    await vi.waitFor(() =>
      expect(controller.store.getState().attachments[0]?.status).toBe("error"),
    );

    controller.retry(localId!);

    await vi.waitFor(() =>
      expect(controller.store.getState().attachments[0]?.status).toBe("ready"),
    );
    expect(controller.store.getState().attachments[0]?.localId).toBe("stable-local-id");
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it("keeps other uploads running when one attachment fails", async () => {
    const upload = vi.fn((uploadFile: File) => {
      if (uploadFile.name === "broken.txt") throw new Error("broken upload");
      return Promise.resolve(metadata(uploadFile.name));
    });
    const controller = createWorkspaceComposerAttachmentsController({
      scope: SCOPE,
      transport: transport(upload),
    });

    controller.add([file("first.txt"), file("broken.txt"), file("last.txt")]);

    await vi.waitFor(() =>
      expect(controller.store.getState().attachments.map((item) => item.status)).toEqual([
        "ready",
        "error",
        "ready",
      ]),
    );
    expect(upload).toHaveBeenCalledTimes(3);
  });

  it("removes queued and failed attachments locally without server deletion", async () => {
    const activeRequests = Array.from({ length: 5 }, () =>
      deferred<WorkspaceComposerAttachmentServerMetadata>(),
    );
    const upload = vi.fn((uploadFile: File) => {
      if (uploadFile.name === "failed.txt") return Promise.reject(new Error("failed"));
      const requestIndex = upload.mock.calls.length - 1;
      return activeRequests[requestIndex]!.promise;
    });
    const deleteRequest = vi.fn(() => Promise.resolve());
    let idSequence = 0;
    const controller = createWorkspaceComposerAttachmentsController({
      scope: SCOPE,
      transport: transport(upload, deleteRequest),
      createLocalId: () => `local-${++idSequence}`,
    });

    const localIds = controller.add([
      ...Array.from({ length: 5 }, (_, index) => file(`active-${index}.txt`)),
      file("queued.txt"),
    ]);
    await vi.waitFor(() =>
      expect(controller.store.getState().attachments[5]?.status).toBe("queued"),
    );
    controller.remove(localIds[5]!);
    expect(controller.store.getState().attachments).toHaveLength(5);

    controller.discardAll();
    const [failedLocalId] = controller.add([file("failed.txt")]);
    await vi.waitFor(() =>
      expect(controller.store.getState().attachments[0]?.status).toBe("error"),
    );
    controller.remove(failedLocalId!);
    expect(controller.store.getState().attachments).toEqual([]);
    expect(deleteRequest).not.toHaveBeenCalled();
  });

  it("aborts an uploading removal and ignores its stale completion", async () => {
    const request = deferred<WorkspaceComposerAttachmentServerMetadata>();
    const deleteRequest = vi.fn(() => Promise.resolve());
    let requestContext: WorkspaceComposerAttachmentUploadContext | null = null;
    const upload = vi.fn((_file: File, context: WorkspaceComposerAttachmentUploadContext) => {
      requestContext = context;
      return request.promise;
    });
    const controller = createWorkspaceComposerAttachmentsController({
      scope: SCOPE,
      transport: transport(upload, deleteRequest),
    });
    const [localId] = controller.add([file("remove.txt")]);
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(1));

    controller.remove(localId!);

    expect(
      (requestContext as WorkspaceComposerAttachmentUploadContext | null)?.signal.aborted,
    ).toBe(true);
    expect(controller.store.getState().attachments).toEqual([]);
    request.resolve(metadata("remove.txt"));
    await Promise.resolve();
    await Promise.resolve();
    expect(controller.store.getState().attachments).toEqual([]);
    await vi.waitFor(() =>
      expect(deleteRequest).toHaveBeenCalledWith(
        metadata("remove.txt"),
        expect.objectContaining({ localId, scope: SCOPE }),
      ),
    );
  });

  it("ignores stale owner generation and attempt results", async () => {
    const first = deferred<WorkspaceComposerAttachmentServerMetadata>();
    const second = deferred<WorkspaceComposerAttachmentServerMetadata>();
    const upload = vi
      .fn<() => Promise<WorkspaceComposerAttachmentServerMetadata>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const deleteRequest = vi.fn(() => Promise.resolve());
    const controller = createWorkspaceComposerAttachmentsController({
      scope: SCOPE,
      transport: transport(upload, deleteRequest),
      createLocalId: () => "reused-local-id",
    });
    const [firstLocalId] = controller.add([file("first.txt")]);
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    controller.remove(firstLocalId!);
    controller.add([file("second.txt")]);
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(2));

    first.resolve(metadata("first.txt"));
    await Promise.resolve();
    await Promise.resolve();
    expect(controller.store.getState().attachments[0]?.status).toBe("uploading");
    expect(controller.store.getState().attachments[0]?.file.name).toBe("second.txt");

    controller.updateScope({ ownerKey: "owner-a", runtimeGeneration: 2, scopeKey: "topic-a" });
    second.resolve(metadata("second.txt"));
    await Promise.resolve();
    await Promise.resolve();
    expect(controller.store.getState().attachments).toEqual([]);
    await vi.waitFor(() => expect(deleteRequest).toHaveBeenCalledTimes(2));
  });

  it("does not apply an A-B-A scope upload result to the restored scope", async () => {
    const stale = deferred<WorkspaceComposerAttachmentServerMetadata>();
    const fresh = deferred<WorkspaceComposerAttachmentServerMetadata>();
    const upload = vi
      .fn<() => Promise<WorkspaceComposerAttachmentServerMetadata>>()
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(fresh.promise);
    const deleteRequest = vi.fn(() => Promise.resolve());
    const controller = createWorkspaceComposerAttachmentsController({
      scope: SCOPE,
      transport: transport(upload, deleteRequest),
      createLocalId: () => "reused-local-id",
    });

    controller.add([file("stale-a.txt")]);
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    controller.updateScope({ ownerKey: "owner-b", runtimeGeneration: 2, scopeKey: "topic-b" });
    controller.updateScope({ ownerKey: "owner-a", runtimeGeneration: 3, scopeKey: "topic-a" });
    controller.add([file("fresh-a.txt")]);
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(2));

    stale.resolve(metadata("stale-a.txt"));
    await vi.waitFor(() =>
      expect(deleteRequest).toHaveBeenCalledWith(
        metadata("stale-a.txt"),
        expect.objectContaining({
          localId: "reused-local-id",
          scope: SCOPE,
        }),
      ),
    );
    expect(controller.store.getState().attachments[0]).toEqual(
      expect.objectContaining({
        file: expect.objectContaining({ name: "fresh-a.txt" }),
        status: "uploading",
      }),
    );

    fresh.resolve(metadata("fresh-a.txt"));
    await vi.waitFor(() =>
      expect(controller.store.getState().attachments[0]).toEqual(
        expect.objectContaining({
          file: expect.objectContaining({ name: "fresh-a.txt" }),
          status: "ready",
        }),
      ),
    );
  });

  it("cleans up a stale upload after a scope switch within the same runtime", async () => {
    const stale = deferred<WorkspaceComposerAttachmentServerMetadata>();
    const upload = vi.fn(() => stale.promise);
    const deleteRequest = vi.fn(() => Promise.resolve());
    const controller = createWorkspaceComposerAttachmentsController({
      scope: SCOPE,
      transport: transport(upload, deleteRequest),
    });

    const [localId] = controller.add([file("stale-topic-a.txt")]);
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    controller.updateScope({ ...SCOPE, scopeKey: "topic-b" });

    stale.resolve(metadata("stale-topic-a.txt"));

    expect(controller.store.getState().attachments).toEqual([]);
    await vi.waitFor(() =>
      expect(deleteRequest).toHaveBeenCalledWith(
        metadata("stale-topic-a.txt"),
        expect.objectContaining({ localId, scope: SCOPE }),
      ),
    );
  });

  it("publishes byte progress through a File-free UI view", async () => {
    const request = deferred<WorkspaceComposerAttachmentServerMetadata>();
    const upload = vi.fn((_uploadFile: File, context: WorkspaceComposerAttachmentUploadContext) => {
      context.onProgress(4, 10);
      return request.promise;
    });
    const controller = createWorkspaceComposerAttachmentsController({
      scope: SCOPE,
      transport: transport(upload),
    });

    controller.add([file("progress.txt")]);

    await vi.waitFor(() => {
      const [view] = selectWorkspaceComposerAttachmentViews(controller.store.getState());
      expect(view).toEqual(
        expect.objectContaining({
          fileName: "progress.txt",
          status: "uploading",
          loadedBytes: 4,
          totalBytes: 10,
        }),
      );
      expect(view).not.toHaveProperty("file");
    });
    request.resolve(metadata("progress.txt"));
  });

  it("removes ready items locally and performs best-effort server deletion", async () => {
    const deleteRequest = vi.fn().mockRejectedValue(new Error("delete unavailable"));
    const controller = createWorkspaceComposerAttachmentsController({
      scope: SCOPE,
      transport: {
        upload: (uploadFile) => Promise.resolve(metadata(uploadFile.name)),
        delete: deleteRequest,
      },
    });
    const [localId] = controller.add([file("ready.txt")]);
    await vi.waitFor(() =>
      expect(controller.store.getState().attachments[0]?.status).toBe("ready"),
    );

    controller.remove(localId!);

    expect(controller.store.getState().attachments).toEqual([]);
    await vi.waitFor(() =>
      expect(deleteRequest).toHaveBeenCalledWith(
        metadata("ready.txt"),
        expect.objectContaining({
          localId,
          scope: SCOPE,
          signal: expect.any(AbortSignal),
        }),
      ),
    );
  });

  it("discards ready attachments with deletion but transfers consumed URNs without deletion", async () => {
    const deleteRequest = vi.fn(() => Promise.resolve());
    const createController = () =>
      createWorkspaceComposerAttachmentsController({
        scope: SCOPE,
        transport: {
          upload: (uploadFile) => Promise.resolve(metadata(uploadFile.name)),
          delete: deleteRequest,
        },
      });
    const discarded = createController();
    discarded.add([file("discard.txt")]);
    await vi.waitFor(() => expect(discarded.store.getState().attachments[0]?.status).toBe("ready"));

    discarded.discardAll();

    expect(discarded.store.getState().attachments).toEqual([]);
    await vi.waitFor(() =>
      expect(deleteRequest).toHaveBeenCalledWith(
        metadata("discard.txt"),
        expect.objectContaining({ scope: SCOPE }),
      ),
    );

    deleteRequest.mockClear();
    const transferred = createController();
    transferred.add([file("transfer.txt")]);
    await vi.waitFor(() =>
      expect(transferred.store.getState().attachments[0]?.status).toBe("ready"),
    );
    const failedConsume = vi.fn(() => {
      throw new Error("consumer rejected transfer");
    });
    expect(() => transferred.transferReady(failedConsume)).toThrow("consumer rejected transfer");
    expect(transferred.store.getState().attachments).toHaveLength(1);

    const consume = vi.fn((snapshot: readonly unknown[]) => {
      transferred.add([file("added-during-consume.txt")]);
      return { accepted: snapshot.length };
    });
    expect(transferred.transferReady(consume)).toEqual({ accepted: 1 });
    expect(consume).toHaveBeenCalledWith([
      { localId: expect.any(String), serverMetadata: metadata("transfer.txt") },
    ]);
    expect(
      transferred.store.getState().attachments.map((attachment) => attachment.file.name),
    ).toEqual(["added-during-consume.txt"]);
    expect(deleteRequest).not.toHaveBeenCalled();
  });

  it("commits ready edit attachments only after the async consumer succeeds", async () => {
    const deleteRequest = vi.fn(() => Promise.resolve());
    const controller = createWorkspaceComposerAttachmentsController({
      scope: SCOPE,
      transport: transport(
        (uploadFile) => Promise.resolve(metadata(uploadFile.name)),
        deleteRequest,
      ),
    });
    controller.add([file("edit.txt")]);
    await vi.waitFor(() =>
      expect(controller.store.getState().attachments[0]?.status).toBe("ready"),
    );
    const request = deferred<boolean>();
    const consume = vi.fn(() => request.promise);

    const result = controller.commitReady(consume);

    expect(controller.store.getState().attachments).toEqual([]);
    expect(consume).toHaveBeenCalledWith([
      { localId: expect.any(String), serverMetadata: metadata("edit.txt") },
    ]);
    request.resolve(true);
    await expect(result).resolves.toBe(true);
    expect(controller.store.getState().attachments).toEqual([]);
    expect(deleteRequest).not.toHaveBeenCalled();
  });

  it("restores ready edit attachments when the async consumer fails", async () => {
    const deleteRequest = vi.fn(() => Promise.resolve());
    const controller = createWorkspaceComposerAttachmentsController({
      scope: SCOPE,
      transport: transport(
        (uploadFile) => Promise.resolve(metadata(uploadFile.name)),
        deleteRequest,
      ),
    });
    controller.add([file("edit-failed.txt")]);
    await vi.waitFor(() =>
      expect(controller.store.getState().attachments[0]?.status).toBe("ready"),
    );

    await expect(
      controller.commitReady(() => Promise.reject(new Error("edit failed"))),
    ).rejects.toThrow("edit failed");

    expect(controller.store.getState().attachments).toEqual([
      expect.objectContaining({
        file: expect.objectContaining({ name: "edit-failed.txt" }),
        status: "ready",
      }),
    ]);
    expect(deleteRequest).not.toHaveBeenCalled();
  });

  it("revokes image previews on transfer, scope discard, and dispose exactly once", async () => {
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:transferred")
      .mockReturnValueOnce("blob:scoped")
      .mockReturnValueOnce("blob:disposed");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const controller = createWorkspaceComposerAttachmentsController({
      scope: SCOPE,
      transport: transport((uploadFile) => Promise.resolve(metadata(uploadFile.name))),
    });

    controller.add([pngFile("transferred.png")]);
    await vi.waitFor(() =>
      expect(controller.store.getState().attachments[0]?.status).toBe("ready"),
    );
    expect(controller.transferReady(() => true)).toBe(true);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:transferred");

    controller.add([pngFile("scoped.png")]);
    await vi.waitFor(() =>
      expect(controller.store.getState().attachments[0]?.status).toBe("ready"),
    );
    controller.updateScope({ ...SCOPE, scopeKey: "topic-b" });
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:scoped");

    controller.add([pngFile("disposed.png")]);
    await vi.waitFor(() =>
      expect(controller.store.getState().attachments[0]?.status).toBe("ready"),
    );
    controller.dispose();
    controller.dispose();

    expect(createObjectUrl).toHaveBeenCalledTimes(3);
    expect(revokeObjectUrl.mock.calls).toEqual([
      ["blob:transferred"],
      ["blob:scoped"],
      ["blob:disposed"],
    ]);
  });

  it("derives readiness and the send blocker without limiting attachment count", async () => {
    const first = deferred<WorkspaceComposerAttachmentServerMetadata>();
    const controller = createWorkspaceComposerAttachmentsController({
      scope: SCOPE,
      transport: transport(() => first.promise),
    });
    expect(selectWorkspaceComposerAttachmentsBlockSend(controller.store.getState())).toBe(false);
    expect(selectWorkspaceComposerAttachmentsReady(controller.store.getState())).toBe(false);

    controller.add(Array.from({ length: 8 }, (_, index) => file(`unlimited-${index}.txt`)));
    await vi.waitFor(() =>
      expect(selectWorkspaceComposerAttachmentsBlockSend(controller.store.getState())).toBe(true),
    );
    expect(controller.store.getState().attachments).toHaveLength(8);

    controller.discardAll();
    const readyController = createWorkspaceComposerAttachmentsController({
      scope: SCOPE,
      transport: transport((uploadFile) => Promise.resolve(metadata(uploadFile.name))),
    });
    readyController.add([file("ready.txt")]);
    await vi.waitFor(() =>
      expect(selectWorkspaceComposerAttachmentsReady(readyController.store.getState())).toBe(true),
    );
    expect(selectWorkspaceComposerAttachmentsBlockSend(readyController.store.getState())).toBe(
      false,
    );
  });
});
