import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deleteWorkspaceComposerDraftRecord = vi.hoisted(() => vi.fn());
const migrateWorkspaceComposerDraftToRecord = vi.hoisted(() => vi.fn());
const readWorkspaceComposerDraft = vi.hoisted(() => vi.fn());
const readWorkspaceComposerDraftRecords = vi.hoisted(() => vi.fn());
const writeWorkspaceComposerDraftRecord = vi.hoisted(() => vi.fn());

vi.mock("~/shared/lib/workspace-messenger-cache-db", () => ({
  deleteWorkspaceComposerDraftRecord,
  migrateWorkspaceComposerDraftToRecord,
  readWorkspaceComposerDraft,
  readWorkspaceComposerDraftRecords,
  writeWorkspaceComposerDraftRecord,
}));

import { EMPTY_WORKSPACE_COMPOSER_DRAFT_REPLY_SESSION } from "./composer-draft.lib";
import {
  resetWorkspaceComposerDraftStoreForTests,
  useWorkspaceComposerDraftStore,
} from "./composer-draft.model";

const OWNER = "account:a:instance:i:organization:o:project:p:user:u";
const CONVERSATION = "topic:stream-a:topic-a";

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolvePromise: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

async function waitForWriteStart(): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (writeWorkspaceComposerDraftRecord.mock.calls.length > 0) return;
    await Promise.resolve();
  }
  throw new Error("Expected composer draft write to start");
}

beforeEach(() => {
  resetWorkspaceComposerDraftStoreForTests();
  vi.clearAllMocks();
  deleteWorkspaceComposerDraftRecord.mockResolvedValue(undefined);
  migrateWorkspaceComposerDraftToRecord.mockResolvedValue(false);
  readWorkspaceComposerDraft.mockResolvedValue(null);
  readWorkspaceComposerDraftRecords.mockResolvedValue([]);
});

afterEach(() => {
  resetWorkspaceComposerDraftStoreForTests();
});

describe("workspace composer draft owner disposal", () => {
  it("waits for an in-flight write before owner cache cleanup can continue", async () => {
    const deferredWrite = createDeferred();
    writeWorkspaceComposerDraftRecord.mockReturnValueOnce(deferredWrite.promise);
    const draft = useWorkspaceComposerDraftStore.getState().setDraft(OWNER, CONVERSATION, {
      text: "Черновик",
      replySession: EMPTY_WORKSPACE_COMPOSER_DRAFT_REPLY_SESSION,
    });
    expect(draft).not.toBeNull();

    const flush = useWorkspaceComposerDraftStore.getState().flushDraft(OWNER, draft!.draftUuid);
    await waitForWriteStart();

    let disposed = false;
    const disposal = useWorkspaceComposerDraftStore
      .getState()
      .disposeOwner(OWNER)
      .then(() => {
        disposed = true;
      });
    await Promise.resolve();
    expect(disposed).toBe(false);

    deferredWrite.resolve();
    await flush;
    await disposal;

    expect(disposed).toBe(true);
  });
});
