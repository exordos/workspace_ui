import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createDraft = vi.hoisted(() => vi.fn());
const updateDraft = vi.hoisted(() => vi.fn());
const deleteDraft = vi.hoisted(() => vi.fn());
const writeWorkspaceComposerDraftRecord = vi.hoisted(() => vi.fn());
const deleteWorkspaceComposerDraftRecord = vi.hoisted(() => vi.fn());

vi.mock("~/shared/api/messenger-drafts.api", () => ({
  createDraft,
  updateDraft,
  deleteDraft,
}));

vi.mock("~/shared/lib/workspace-messenger-cache-db", () => ({
  readWorkspaceComposerDraft: vi.fn().mockResolvedValue(null),
  readWorkspaceComposerDraftRecords: vi.fn().mockResolvedValue([]),
  writeWorkspaceComposerDraftRecord,
  deleteWorkspaceComposerDraftRecord,
}));

import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { MessengerApiError } from "~/shared/api/messenger-transport.internal";
import {
  deleteWorkspaceComposerDraftFromServer,
  resetWorkspaceComposerDraftSyncForTests,
  resumeWorkspaceComposerDraftSync,
  syncWorkspaceComposerDraft,
} from "./composer-draft-sync.lib";
import { EMPTY_WORKSPACE_COMPOSER_DRAFT_REPLY_SESSION } from "./composer-draft.lib";
import {
  resetWorkspaceComposerDraftStoreForTests,
  useWorkspaceComposerDraftStore,
} from "./composer-draft.model";
import type { WorkspaceComposerDraft, WorkspaceComposerDraftContent } from "./composer-draft.types";

const OWNER = "account:a:instance:i:organization:o:project:p:user:u";
const CONVERSATION = "topic:stream-a:topic-a";
const TARGET = {
  streamUuid: "00000000-0000-4000-8000-000000000011",
  topicUuid: "00000000-0000-4000-8000-000000000012",
};
const runtimeContext: WorkspaceRuntimeContext = {
  accountId: "a",
  instanceId: "i",
  organizationId: "o",
  projectId: "p",
  userUuid: "u",
  organizationOrigin: "https://workspace.example.test",
  accessToken: "token",
  runtimeGeneration: 1,
};

function content(text: string): WorkspaceComposerDraftContent {
  return { text, replySession: EMPTY_WORKSPACE_COMPOSER_DRAFT_REPLY_SESSION };
}

function snapshot(text: string, revision: number, etag: string) {
  return {
    draft: {
      uuid: "00000000-0000-4000-8000-000000000013",
      project_id: "00000000-0000-4000-8000-000000000014",
      user_uuid: "00000000-0000-4000-8000-000000000015",
      stream_uuid: TARGET.streamUuid,
      topic_uuid: TARGET.topicUuid,
      payload: { kind: "markdown" as const, content: text },
      revision,
      created_at: "2026-07-20T09:00:00.000Z",
      updated_at: `2026-07-20T09:00:0${revision}.000Z`,
    },
    etag,
  };
}

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolvePromise: (value: T) => void = () => {};
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function sync(draft: WorkspaceComposerDraft): void {
  syncWorkspaceComposerDraft({
    runtimeContext,
    getRuntimeContext: () => runtimeContext,
    draft,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  resetWorkspaceComposerDraftSyncForTests();
  resetWorkspaceComposerDraftStoreForTests();
  vi.clearAllMocks();
  writeWorkspaceComposerDraftRecord.mockResolvedValue(undefined);
  deleteWorkspaceComposerDraftRecord.mockResolvedValue(undefined);
});

afterEach(() => {
  resetWorkspaceComposerDraftSyncForTests();
  resetWorkspaceComposerDraftStoreForTests();
  vi.useRealTimers();
});

describe("workspace composer draft remote queue", () => {
  it("creates once and then updates the newest local text after an in-flight POST", async () => {
    const created = createDeferred<ReturnType<typeof snapshot>>();
    createDraft.mockReturnValueOnce(created.promise);
    updateDraft.mockResolvedValueOnce(snapshot("B", 2, "etag-2"));
    const first = useWorkspaceComposerDraftStore
      .getState()
      .setDraft(OWNER, CONVERSATION, content("A"), TARGET);
    expect(first).not.toBeNull();

    sync(first!);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(createDraft).toHaveBeenCalledTimes(1);
    expect(createDraft.mock.calls[0]?.[1]).toMatchObject({
      uuid: first?.draftUuid,
      payload: { content: "A" },
    });

    const second = useWorkspaceComposerDraftStore
      .getState()
      .setDraft(OWNER, CONVERSATION, content("B"), TARGET);
    expect(second?.draftUuid).toBe(first?.draftUuid);
    sync(second!);

    created.resolve(snapshot("A", 1, "etag-1"));
    await flushMicrotasks();

    expect(createDraft).toHaveBeenCalledTimes(1);
    expect(updateDraft).toHaveBeenCalledTimes(1);
    expect(updateDraft.mock.calls[0]?.[2]).toMatchObject({ payload: { content: "B" } });
    expect(updateDraft.mock.calls[0]?.[3]).toBe("etag-1");

    await flushMicrotasks();
    expect(useWorkspaceComposerDraftStore.getState().draftsByKey[first!.key]).toMatchObject({
      content: { text: "B" },
      etag: "etag-2",
      syncStatus: "saved",
    });
  });

  it("retries a timed-out create with its first payload before putting newer local text", async () => {
    // The server may have accepted A although the client never received its response.
    // Its idempotent retry must therefore not turn into POST(B) and produce 409.
    createDraft
      .mockRejectedValueOnce(new Error("request timeout after server-side creation"))
      .mockResolvedValueOnce(snapshot("A", 1, "etag-1"));
    updateDraft.mockResolvedValueOnce(snapshot("B", 2, "etag-2"));
    const first = useWorkspaceComposerDraftStore
      .getState()
      .setDraft(OWNER, CONVERSATION, content("A"), TARGET);
    sync(first!);

    await vi.advanceTimersByTimeAsync(1_000);
    await flushMicrotasks();
    expect(createDraft).toHaveBeenCalledTimes(1);

    const second = useWorkspaceComposerDraftStore
      .getState()
      .setDraft(OWNER, CONVERSATION, content("B"), TARGET);
    sync(second!);

    await vi.advanceTimersByTimeAsync(1_000);
    await flushMicrotasks();

    expect(createDraft).toHaveBeenCalledTimes(2);
    expect(createDraft.mock.calls[1]?.[1]).toMatchObject({
      uuid: first?.draftUuid,
      payload: { content: "A" },
    });
    expect(updateDraft).toHaveBeenCalledWith(
      expect.anything(),
      first?.draftUuid,
      { payload: { kind: "markdown", content: "B" } },
      "etag-1",
    );
    await flushMicrotasks();
    expect(useWorkspaceComposerDraftStore.getState().draftsByKey[first!.key]).toMatchObject({
      content: { text: "B" },
      etag: "etag-2",
      syncStatus: "saved",
      pendingCreatePayload: null,
    });
  });

  it("resumes only non-conflicting cached drafts for the current owner", async () => {
    createDraft.mockResolvedValueOnce(snapshot("local", 1, "etag-1"));
    const local = useWorkspaceComposerDraftStore
      .getState()
      .setDraft(OWNER, CONVERSATION, content("local"), TARGET);
    expect(local).not.toBeNull();
    const conflict = {
      ...local!,
      key: `${OWNER}:00000000-0000-4000-8000-000000000099`,
      draftUuid: "00000000-0000-4000-8000-000000000099",
      syncStatus: "conflict" as const,
    };
    useWorkspaceComposerDraftStore.setState({
      draftsByKey: { [local!.key]: local!, [conflict.key]: conflict },
    });

    resumeWorkspaceComposerDraftSync({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
    });
    await vi.advanceTimersByTimeAsync(1_000);

    expect(createDraft).toHaveBeenCalledTimes(1);
    expect(createDraft.mock.calls[0]?.[1]).toMatchObject({ uuid: local?.draftUuid });
  });

  it("waits for a create ETag before deleting a draft", async () => {
    const created = createDeferred<ReturnType<typeof snapshot>>();
    createDraft.mockReturnValueOnce(created.promise);
    deleteDraft.mockResolvedValueOnce(undefined);
    const draft = useWorkspaceComposerDraftStore
      .getState()
      .setDraft(OWNER, CONVERSATION, content("A"), TARGET);
    sync(draft!);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(createDraft).toHaveBeenCalledTimes(1);

    const deleting = deleteWorkspaceComposerDraftFromServer({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      draft: draft!,
    });
    expect(useWorkspaceComposerDraftStore.getState().draftsByKey[draft!.key]?.syncStatus).toBe(
      "deleting",
    );

    created.resolve(snapshot("A", 1, "etag-1"));
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(0);
    await flushMicrotasks();
    expect(deleteDraft).toHaveBeenCalledWith(expect.anything(), draft!.draftUuid, "etag-1");
    expect(deleting).toBe(true);
    await flushMicrotasks();
    expect(useWorkspaceComposerDraftStore.getState().draftsByKey[draft!.key]).toBeUndefined();
  });

  it("persists a deletion tombstone before starting the server DELETE", async () => {
    const draft = useWorkspaceComposerDraftStore
      .getState()
      .setDraft(OWNER, CONVERSATION, content("Already sent"), TARGET);
    expect(draft).not.toBeNull();
    useWorkspaceComposerDraftStore
      .getState()
      .applyDraftSyncSuccess(OWNER, draft!.draftUuid, draft!.snapshotId, {
        etag: "etag-1",
        updatedAt: "2026-07-20T09:00:01.000Z",
      });
    await useWorkspaceComposerDraftStore.getState().flushDraft(OWNER, draft!.draftUuid);
    vi.clearAllMocks();

    // A reload while DELETE is pending must hydrate the deletion tombstone,
    // rather than the previously saved draft that contains an already-sent message.
    const persisted = createDeferred<void>();
    writeWorkspaceComposerDraftRecord.mockReturnValueOnce(persisted.promise);
    deleteDraft.mockResolvedValueOnce(undefined);

    expect(
      deleteWorkspaceComposerDraftFromServer({
        runtimeContext,
        getRuntimeContext: () => runtimeContext,
        draft: draft!,
      }),
    ).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    await flushMicrotasks();

    expect(writeWorkspaceComposerDraftRecord).toHaveBeenCalledWith(
      OWNER,
      expect.objectContaining({
        draftUuid: draft!.draftUuid,
        syncStatus: "deleting",
      }),
    );
    expect(deleteDraft).not.toHaveBeenCalled();

    persisted.resolve(undefined);
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(0);

    expect(deleteDraft).toHaveBeenCalledWith(expect.anything(), draft!.draftUuid, "etag-1");
  });

  it("keeps local and server snapshots and stops after a 412 conflict", async () => {
    createDraft.mockResolvedValueOnce(snapshot("A", 1, "etag-1"));
    const conflict = new MessengerApiError(
      "stale draft",
      412,
      snapshot("server", 2, "etag-2").draft,
      new Headers({ ETag: "etag-2" }),
    );
    updateDraft.mockRejectedValueOnce(conflict);
    const first = useWorkspaceComposerDraftStore
      .getState()
      .setDraft(OWNER, CONVERSATION, content("A"), TARGET);
    sync(first!);
    await vi.advanceTimersByTimeAsync(1_000);
    await flushMicrotasks();

    const second = useWorkspaceComposerDraftStore
      .getState()
      .setDraft(OWNER, CONVERSATION, content("local"), TARGET);
    sync(second!);
    await vi.advanceTimersByTimeAsync(1_000);
    await flushMicrotasks();

    const conflicted = useWorkspaceComposerDraftStore.getState().draftsByKey[first!.key];
    expect(conflicted).toMatchObject({
      syncStatus: "conflict",
      content: { text: "local" },
      conflictServerContent: { text: "server" },
      conflictServerEtag: "etag-2",
    });
    expect(updateDraft).toHaveBeenCalledTimes(1);
  });

  it("accepts a 412 snapshot when its content already matches the latest local draft", async () => {
    createDraft.mockResolvedValueOnce(snapshot("A", 1, "etag-1"));
    const first = useWorkspaceComposerDraftStore
      .getState()
      .setDraft(OWNER, CONVERSATION, content("A"), TARGET);
    sync(first!);
    await vi.advanceTimersByTimeAsync(1_000);
    await flushMicrotasks();

    const local = useWorkspaceComposerDraftStore
      .getState()
      .setDraft(OWNER, CONVERSATION, content("local"), TARGET);
    const server = snapshot("local", 2, "etag-2");
    updateDraft.mockRejectedValueOnce(
      new MessengerApiError("response lost", 412, server.draft, new Headers({ ETag: server.etag })),
    );

    sync(local!);
    await vi.advanceTimersByTimeAsync(1_000);
    await flushMicrotasks();

    expect(useWorkspaceComposerDraftStore.getState().draftsByKey[first!.key]).toMatchObject({
      content: { text: "local" },
      etag: "etag-2",
      serverUpdatedAt: server.draft.updated_at,
      syncStatus: "saved",
    });
  });

  it("does not repeat PUT when the server returns canonicalized markdown", async () => {
    createDraft.mockResolvedValueOnce(snapshot("A", 1, "etag-1"));
    const first = useWorkspaceComposerDraftStore
      .getState()
      .setDraft(OWNER, CONVERSATION, content("A"), TARGET);
    sync(first!);
    await vi.advanceTimersByTimeAsync(1_000);
    await flushMicrotasks();

    const local = useWorkspaceComposerDraftStore
      .getState()
      .setDraft(OWNER, CONVERSATION, content("local  "), TARGET);
    updateDraft.mockResolvedValue(snapshot("local", 2, "etag-2"));

    sync(local!);
    await vi.advanceTimersByTimeAsync(1_000);
    await flushMicrotasks();

    expect(updateDraft).toHaveBeenCalledTimes(1);
    expect(useWorkspaceComposerDraftStore.getState().draftsByKey[first!.key]).toMatchObject({
      content: { text: "local  " },
      etag: "etag-2",
      syncStatus: "saved",
    });

    await vi.advanceTimersByTimeAsync(10_000);
    expect(updateDraft).toHaveBeenCalledTimes(1);
  });

  it("does not PUT when only surrounding whitespace changes after a saved draft", async () => {
    createDraft.mockResolvedValueOnce(snapshot("local", 1, "etag-1"));
    const first = useWorkspaceComposerDraftStore
      .getState()
      .setDraft(OWNER, CONVERSATION, content("local"), TARGET);
    sync(first!);
    await vi.advanceTimersByTimeAsync(1_000);
    await flushMicrotasks();

    const whitespaceOnly = useWorkspaceComposerDraftStore
      .getState()
      .setDraft(OWNER, CONVERSATION, content("  local  "), TARGET);
    expect(whitespaceOnly).toMatchObject({
      content: { text: "  local  " },
      syncStatus: "saved",
    });

    sync(whitespaceOnly!);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(createDraft).toHaveBeenCalledTimes(1);
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it("does not PUT whitespace added while the previous request is in flight", async () => {
    const created = createDeferred<ReturnType<typeof snapshot>>();
    createDraft.mockReturnValueOnce(created.promise);
    const first = useWorkspaceComposerDraftStore
      .getState()
      .setDraft(OWNER, CONVERSATION, content("local"), TARGET);
    sync(first!);
    await vi.advanceTimersByTimeAsync(1_000);

    const whitespaceOnly = useWorkspaceComposerDraftStore
      .getState()
      .setDraft(OWNER, CONVERSATION, content("local  "), TARGET);
    sync(whitespaceOnly!);

    created.resolve(snapshot("local", 1, "etag-1"));
    await flushMicrotasks();

    expect(createDraft).toHaveBeenCalledTimes(1);
    expect(updateDraft).not.toHaveBeenCalled();
    expect(useWorkspaceComposerDraftStore.getState().draftsByKey[first!.key]).toMatchObject({
      content: { text: "local  " },
      syncStatus: "saved",
    });
  });

  it("treats a missing draft on DELETE as an already successful deletion", async () => {
    const draft = useWorkspaceComposerDraftStore
      .getState()
      .setDraft(OWNER, CONVERSATION, content("A"), TARGET);
    expect(draft).not.toBeNull();
    useWorkspaceComposerDraftStore
      .getState()
      .applyDraftSyncSuccess(OWNER, draft!.draftUuid, draft!.snapshotId, {
        etag: "etag-1",
        updatedAt: "2026-07-20T09:00:01.000Z",
      });
    deleteDraft.mockRejectedValueOnce(new MessengerApiError("not found", 404, null));

    const deleting = deleteWorkspaceComposerDraftFromServer({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      draft: draft!,
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(deleting).toBe(true);
    await flushMicrotasks();
    expect(deleteDraft).toHaveBeenCalledTimes(1);
    expect(useWorkspaceComposerDraftStore.getState().draftsByKey[draft!.key]).toBeUndefined();
  });

  it.each([403, 404, 409, 428])(
    "does not retry a terminal HTTP %i response from PUT",
    async (status) => {
      createDraft.mockResolvedValueOnce(snapshot("A", 1, "etag-1"));
      const first = useWorkspaceComposerDraftStore
        .getState()
        .setDraft(OWNER, CONVERSATION, content("A"), TARGET);
      sync(first!);
      await vi.advanceTimersByTimeAsync(1_000);
      await flushMicrotasks();

      const local = useWorkspaceComposerDraftStore
        .getState()
        .setDraft(OWNER, CONVERSATION, content("local"), TARGET);
      updateDraft.mockRejectedValueOnce(new MessengerApiError("terminal", status, null));
      sync(local!);
      await vi.advanceTimersByTimeAsync(1_000);
      await flushMicrotasks();
      await vi.advanceTimersByTimeAsync(10_000);

      expect(updateDraft).toHaveBeenCalledTimes(1);
    },
  );

  it("does not retry a terminal POST conflict", async () => {
    createDraft.mockRejectedValueOnce(new MessengerApiError("UUID conflict", 409, null));
    const draft = useWorkspaceComposerDraftStore
      .getState()
      .setDraft(OWNER, CONVERSATION, content("A"), TARGET);
    sync(draft!);
    await vi.advanceTimersByTimeAsync(1_000);
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(createDraft).toHaveBeenCalledTimes(1);
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it("does not resume a terminal failure, but retries after a new edit", async () => {
    createDraft.mockRejectedValueOnce(new MessengerApiError("forbidden", 403, null));
    const first = useWorkspaceComposerDraftStore
      .getState()
      .setDraft(OWNER, CONVERSATION, content("A"), TARGET);
    sync(first!);
    await vi.advanceTimersByTimeAsync(1_000);
    await flushMicrotasks();

    expect(useWorkspaceComposerDraftStore.getState().draftsByKey[first!.key]?.syncStatus).toBe(
      "failed",
    );

    resetWorkspaceComposerDraftSyncForTests();
    resumeWorkspaceComposerDraftSync({ runtimeContext, getRuntimeContext: () => runtimeContext });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(createDraft).toHaveBeenCalledTimes(1);

    createDraft.mockResolvedValueOnce(snapshot("A", 1, "etag-1"));
    updateDraft.mockResolvedValueOnce(snapshot("B", 2, "etag-2"));
    const edited = useWorkspaceComposerDraftStore
      .getState()
      .setDraft(OWNER, CONVERSATION, content("B"), TARGET);
    expect(edited?.syncStatus).toBe("local");
    sync(edited!);
    await vi.advanceTimersByTimeAsync(1_000);
    await flushMicrotasks();

    expect(createDraft).toHaveBeenCalledTimes(2);
    expect(updateDraft).toHaveBeenCalledWith(
      expect.anything(),
      edited?.draftUuid,
      { payload: { kind: "markdown", content: "B" } },
      "etag-1",
    );
    expect(useWorkspaceComposerDraftStore.getState().draftsByKey[first!.key]).toMatchObject({
      syncStatus: "saved",
      content: { text: "B" },
    });
  });
});
