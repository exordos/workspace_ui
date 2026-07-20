import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deleteWorkspaceMessengerCacheDatabase,
  openWorkspaceMessengerCacheDb,
  readWorkspaceComposerDraft,
  readWorkspaceComposerDraftRecords,
  resetWorkspaceMessengerCacheDbSingletonForTests,
} from "~/shared/lib/workspace-messenger-cache-db";
import type { WorkspaceMessengerComposerDraftCacheRow } from "~/shared/lib/workspace-messenger-cache-db";
import { EMPTY_WORKSPACE_COMPOSER_DRAFT_REPLY_SESSION } from "./composer-draft.lib";
import {
  resetWorkspaceComposerDraftStoreForTests,
  selectWorkspaceComposerDraft,
  useWorkspaceComposerDraftStore,
} from "./composer-draft.model";
import type { WorkspaceComposerDraftContent } from "./composer-draft.types";

const OWNER = "account:a:instance:i:organization:o:project:p:user:u";
const OTHER_OWNER = "account:b:instance:i:organization:o:project:p:user:u";
const CONVERSATION = "topic:stream-a:topic-a";

function content(text: string): WorkspaceComposerDraftContent {
  return {
    text,
    replySession: EMPTY_WORKSPACE_COMPOSER_DRAFT_REPLY_SESSION,
  };
}

async function seedLegacyComposerDraft<TContent>(
  ownerKey: string,
  conversationId: string,
  draft: Omit<
    WorkspaceMessengerComposerDraftCacheRow<TContent>,
    "id" | "ownerKey" | "conversationId"
  >,
): Promise<void> {
  const db = await openWorkspaceMessengerCacheDb();
  const transaction = db.transaction("composerDrafts", "readwrite");
  transaction.objectStore("composerDrafts").put({
    id: `${ownerKey}:${conversationId}`,
    ownerKey,
    conversationId,
    ...draft,
  } satisfies WorkspaceMessengerComposerDraftCacheRow<TContent>);
  await new Promise<void>((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("error", () =>
      reject(new Error(transaction.error?.message ?? "Cannot seed legacy composer draft")),
    );
    transaction.addEventListener("abort", () =>
      reject(new Error(transaction.error?.message ?? "Cannot seed legacy composer draft")),
    );
  });
}

beforeEach(() => {
  resetWorkspaceComposerDraftStoreForTests();
});

afterEach(async () => {
  try {
    const db = await openWorkspaceMessengerCacheDb();
    db.close();
  } catch {
    // no open DB
  }
  resetWorkspaceMessengerCacheDbSingletonForTests();
  await deleteWorkspaceMessengerCacheDatabase();
  resetWorkspaceComposerDraftStoreForTests();
});

describe("workspace composer drafts", () => {
  it("keeps one current draft per owner and conversation and writes after debounce", async () => {
    const first = useWorkspaceComposerDraftStore
      .getState()
      .setDraft(OWNER, CONVERSATION, content("Первая"));
    const second = useWorkspaceComposerDraftStore
      .getState()
      .setDraft(OWNER, CONVERSATION, content("Вторая"));

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second?.snapshotId).not.toBe(first?.snapshotId);
    expect(
      selectWorkspaceComposerDraft(useWorkspaceComposerDraftStore.getState(), OWNER, CONVERSATION),
    ).toMatchObject({ snapshotId: second?.snapshotId, content: { text: "Вторая" } });

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 450);
    });

    await expect(
      readWorkspaceComposerDraftRecords<WorkspaceComposerDraftContent>(OWNER),
    ).resolves.toContainEqual(
      expect.objectContaining({
        snapshotId: second?.snapshotId,
        content: expect.objectContaining({ text: "Вторая" }),
      }),
    );
  });

  it("hydrates persisted reply tabs together with ordinary composer text", async () => {
    await seedLegacyComposerDraft(OWNER, CONVERSATION, {
      snapshotId: "snapshot-a",
      updatedAt: 42,
      content: {
        text: "Обычный текст",
        replySession: {
          activeTabId: "tab-a",
          tabs: [
            {
              id: "tab-a",
              messageUuid: "message-a",
              senderUuid: "user-a",
              senderName: "Алексей",
              quotedContent: "Исходный текст",
              createdAt: "2026-07-15T09:00:00.000Z",
              answer: "Ответ",
            },
          ],
        },
      },
    });

    await expect(
      useWorkspaceComposerDraftStore.getState().hydrateDraft(OWNER, CONVERSATION),
    ).resolves.toMatchObject({
      ownerKey: OWNER,
      conversationId: CONVERSATION,
      snapshotId: "snapshot-a",
      streamUuid: "stream-a",
      topicUuid: "topic-a",
      content: {
        text: "Обычный текст",
        replySession: {
          activeTabId: "tab-a",
          tabs: [
            {
              id: "tab-a",
              messageUuid: "message-a",
              senderUuid: "user-a",
              senderName: "Алексей",
              quotedContent: "Исходный текст",
              createdAt: "2026-07-15T09:00:00.000Z",
              answer: "Ответ",
            },
          ],
        },
      },
    });

    await expect(readWorkspaceComposerDraft(OWNER, CONVERSATION)).resolves.toBeNull();
    await expect(readWorkspaceComposerDraftRecords(OWNER)).resolves.toHaveLength(1);
  });

  it("hydrates malformed persisted content as an empty draft", async () => {
    await seedLegacyComposerDraft<unknown>(OWNER, CONVERSATION, {
      snapshotId: "snapshot-a",
      updatedAt: 42,
      content: {
        text: 42,
        replySession: {
          activeTabId: {},
          tabs: "not-an-array",
        },
      },
    });

    await expect(
      useWorkspaceComposerDraftStore.getState().hydrateDraft(OWNER, CONVERSATION),
    ).resolves.toMatchObject({
      content: {
        text: "",
        replySession: EMPTY_WORKSPACE_COMPOSER_DRAFT_REPLY_SESSION,
      },
    });
  });

  it("drops malformed reply tabs while preserving valid persisted tabs", async () => {
    await seedLegacyComposerDraft<unknown>(OWNER, CONVERSATION, {
      snapshotId: "snapshot-a",
      updatedAt: 42,
      content: {
        text: "Черновик",
        replySession: {
          activeTabId: "tab-a",
          tabs: [
            null,
            {
              id: "tab-invalid",
              messageUuid: 42,
              senderUuid: "user-invalid",
              senderName: "Некорректный",
              quotedContent: "Текст",
              createdAt: "2026-07-15T09:00:00.000Z",
              answer: "Ответ",
            },
            {
              id: " tab-a ",
              messageUuid: "message-a",
              senderUuid: "user-a",
              senderName: "Алексей",
              quotedContent: 42,
              selectedText: null,
              createdAt: "2026-07-15T09:00:00.000Z",
              answer: null,
            },
          ],
        },
      },
    });

    await expect(
      useWorkspaceComposerDraftStore.getState().hydrateDraft(OWNER, CONVERSATION),
    ).resolves.toMatchObject({
      content: {
        text: "Черновик",
        replySession: {
          activeTabId: "tab-a",
          tabs: [
            {
              id: "tab-a",
              messageUuid: "message-a",
              quotedContent: "",
              selectedText: undefined,
              answer: "",
            },
          ],
        },
      },
    });
  });

  it("does not let a late hydration overwrite local input", async () => {
    await seedLegacyComposerDraft(OWNER, CONVERSATION, {
      snapshotId: "persisted-snapshot",
      updatedAt: 1,
      content: content("Старый текст"),
    });

    const hydrate = useWorkspaceComposerDraftStore.getState().hydrateDraft(OWNER, CONVERSATION);
    const localDraft = useWorkspaceComposerDraftStore
      .getState()
      .setDraft(OWNER, CONVERSATION, content("Новый текст"));

    await expect(hydrate).resolves.toEqual(localDraft);
    expect(
      selectWorkspaceComposerDraft(useWorkspaceComposerDraftStore.getState(), OWNER, CONVERSATION),
    ).toEqual(localDraft);
  });

  it("clears only the snapshot that was sent", async () => {
    const sentDraft = useWorkspaceComposerDraftStore
      .getState()
      .setDraft(OWNER, CONVERSATION, content("Первое сообщение"));
    await useWorkspaceComposerDraftStore.getState().flushDraft(OWNER, CONVERSATION);
    const nextDraft = useWorkspaceComposerDraftStore
      .getState()
      .setDraft(OWNER, CONVERSATION, content("Следующее сообщение"));

    expect(
      useWorkspaceComposerDraftStore
        .getState()
        .clearDraftIfSnapshotMatches(OWNER, CONVERSATION, sentDraft!.snapshotId),
    ).toBe(false);
    expect(
      selectWorkspaceComposerDraft(useWorkspaceComposerDraftStore.getState(), OWNER, CONVERSATION),
    ).toEqual(nextDraft);

    expect(
      useWorkspaceComposerDraftStore
        .getState()
        .clearDraftIfSnapshotMatches(OWNER, CONVERSATION, nextDraft!.snapshotId),
    ).toBe(true);
    await useWorkspaceComposerDraftStore.getState().flushDraft(OWNER, CONVERSATION);
    await expect(readWorkspaceComposerDraft(OWNER, CONVERSATION)).resolves.toBeNull();
  });

  it("keeps the remaining draft out of the composer until the next chat visit", () => {
    const first = useWorkspaceComposerDraftStore
      .getState()
      .setDraft(OWNER, CONVERSATION, content("Первый"));
    useWorkspaceComposerDraftStore.getState().leaveConversation(OWNER, CONVERSATION);
    const second = useWorkspaceComposerDraftStore
      .getState()
      .setDraft(OWNER, CONVERSATION, content("Второй"));
    useWorkspaceComposerDraftStore.getState().leaveConversation(OWNER, CONVERSATION);

    const selected = useWorkspaceComposerDraftStore
      .getState()
      .selectDraftForConversation(OWNER, CONVERSATION);
    expect(selected?.draftUuid).toBe(second?.draftUuid);

    useWorkspaceComposerDraftStore
      .getState()
      .clearDraftIfSnapshotMatches(OWNER, CONVERSATION, second?.snapshotId ?? "");
    expect(
      useWorkspaceComposerDraftStore.getState().selectDraftForConversation(OWNER, CONVERSATION),
    ).toBeNull();

    useWorkspaceComposerDraftStore.getState().leaveConversation(OWNER, CONVERSATION);
    expect(
      useWorkspaceComposerDraftStore.getState().selectDraftForConversation(OWNER, CONVERSATION)
        ?.draftUuid,
    ).toBe(first?.draftUuid);
  });

  it("accepts the server version of a conflicted draft together with its ETag", () => {
    const draft = useWorkspaceComposerDraftStore
      .getState()
      .setDraft(OWNER, CONVERSATION, content("Локальная версия"));
    expect(draft).not.toBeNull();
    useWorkspaceComposerDraftStore
      .getState()
      .markDraftConflict(OWNER, draft!.draftUuid, content("Версия сервера"), "etag-server");

    const accepted = useWorkspaceComposerDraftStore
      .getState()
      .acceptDraftConflictServerVersion(OWNER, draft!.draftUuid);

    expect(accepted).toMatchObject({
      content: { text: "Версия сервера" },
      etag: "etag-server",
      syncStatus: "saved",
    });
    expect(accepted).not.toHaveProperty("conflictServerContent");
    expect(accepted).not.toHaveProperty("conflictServerEtag");
  });

  it("retries a conflicted local version with the server ETag", () => {
    const draft = useWorkspaceComposerDraftStore
      .getState()
      .setDraft(OWNER, CONVERSATION, content("Локальная версия"));
    expect(draft).not.toBeNull();
    useWorkspaceComposerDraftStore
      .getState()
      .markDraftConflict(OWNER, draft!.draftUuid, content("Версия сервера"), "etag-server");

    const retried = useWorkspaceComposerDraftStore
      .getState()
      .retryDraftConflictWithLocalVersion(OWNER, draft!.draftUuid);

    expect(retried).toMatchObject({
      content: { text: "Локальная версия" },
      etag: "etag-server",
      syncStatus: "local",
    });
    expect(retried).not.toHaveProperty("conflictServerContent");
    expect(retried).not.toHaveProperty("conflictServerEtag");
  });

  it("deletes a conflicted draft using the current server ETag", () => {
    const draft = useWorkspaceComposerDraftStore
      .getState()
      .setDraft(OWNER, CONVERSATION, content("Локальная версия"));
    expect(draft).not.toBeNull();
    useWorkspaceComposerDraftStore
      .getState()
      .markDraftConflict(OWNER, draft!.draftUuid, content("Версия сервера"), "etag-server");

    const deleting = useWorkspaceComposerDraftStore
      .getState()
      .deleteDraftConflictWithServerVersion(OWNER, draft!.draftUuid);

    expect(deleting).toMatchObject({ etag: "etag-server", syncStatus: "deleting" });
    expect(deleting).not.toHaveProperty("conflictServerContent");
    expect(deleting).not.toHaveProperty("conflictServerEtag");
  });

  it("drops delayed owner writes after owner disposal", async () => {
    useWorkspaceComposerDraftStore.getState().setDraft(OWNER, CONVERSATION, content("Черновик"));
    await useWorkspaceComposerDraftStore.getState().disposeOwner(OWNER);

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 450);
    });

    await expect(readWorkspaceComposerDraft(OWNER, CONVERSATION)).resolves.toBeNull();
    expect(
      selectWorkspaceComposerDraft(useWorkspaceComposerDraftStore.getState(), OWNER, CONVERSATION),
    ).toBeNull();
    expect(
      selectWorkspaceComposerDraft(
        useWorkspaceComposerDraftStore.getState(),
        OTHER_OWNER,
        CONVERSATION,
      ),
    ).toBeNull();
  });
});
