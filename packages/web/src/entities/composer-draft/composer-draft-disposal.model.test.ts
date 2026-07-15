import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deleteWorkspaceComposerDraft = vi.hoisted(() => vi.fn());
const deleteWorkspaceComposerDraftIfSnapshotMatches = vi.hoisted(() => vi.fn());
const readWorkspaceComposerDraft = vi.hoisted(() => vi.fn());
const writeWorkspaceComposerDraft = vi.hoisted(() => vi.fn());

vi.mock("~/shared/lib/workspace-messenger-cache-db", () => ({
  deleteWorkspaceComposerDraft,
  deleteWorkspaceComposerDraftIfSnapshotMatches,
  readWorkspaceComposerDraft,
  writeWorkspaceComposerDraft,
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
    if (writeWorkspaceComposerDraft.mock.calls.length > 0) return;
    await Promise.resolve();
  }
  throw new Error("Expected composer draft write to start");
}

beforeEach(() => {
  resetWorkspaceComposerDraftStoreForTests();
  vi.clearAllMocks();
  deleteWorkspaceComposerDraft.mockResolvedValue(undefined);
  deleteWorkspaceComposerDraftIfSnapshotMatches.mockResolvedValue(false);
  readWorkspaceComposerDraft.mockResolvedValue(null);
});

afterEach(() => {
  resetWorkspaceComposerDraftStoreForTests();
});

describe("workspace composer draft owner disposal", () => {
  it("waits for an in-flight write before owner cache cleanup can continue", async () => {
    const deferredWrite = createDeferred();
    writeWorkspaceComposerDraft.mockReturnValueOnce(deferredWrite.promise);
    useWorkspaceComposerDraftStore.getState().setDraft(OWNER, CONVERSATION, {
      text: "Черновик",
      replySession: EMPTY_WORKSPACE_COMPOSER_DRAFT_REPLY_SESSION,
    });

    const flush = useWorkspaceComposerDraftStore.getState().flushDraft(OWNER, CONVERSATION);
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
