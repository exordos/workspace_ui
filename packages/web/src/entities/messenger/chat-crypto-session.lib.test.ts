import { expect, it, vi } from "vitest";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { acquireChatCryptoSession } from "./chat-crypto-session.lib";
import type { MessengerMessage } from "./messenger.types";

const open = vi.hoisted(() => vi.fn());
vi.mock("./chat-crypto-runtime.lib", () => ({ openRealChatSession: open }));

const runtime: WorkspaceRuntimeContext = {
  accountId: "account",
  instanceId: "instance",
  organizationId: "org",
  projectId: "project",
  userUuid: "reader",
  organizationOrigin: "https://workspace.example",
  accessToken: "token",
  runtimeGeneration: 1,
};

it("ingests a delayed foreign-source grant while leased, deduplicates store synchronization and stops after release", async () => {
  const active = {
    load: vi.fn().mockResolvedValue(undefined),
    ingest: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
  };
  open.mockResolvedValue(active);
  const owner = workspaceRuntimeOwnerKey(runtime);
  useWorkspaceMessageStore.getState().setOwner(owner, false);
  const lease = acquireChatCryptoSession(runtime, "11111111-1111-4111-8111-111111111111");
  await lease.promise;
  expect(active.ingest).toHaveBeenCalledExactlyOnceWith([]);
  const grant: MessengerMessage = {
    uuid: "33333333-3333-4333-8333-333333333333",
    conversationId: "stream:11111111-1111-4111-8111-111111111111",
    projectId: "project",
    streamUuid: "11111111-1111-4111-8111-111111111111",
    topicUuid: "22222222-2222-4222-8222-222222222222",
    authorUuid: "original-author",
    userUuid: "reader",
    payload: {
      kind: "key_grant",
      keyUuid: "key",
      requestMessageUuid: "request",
      senderDeviceId: "sender",
      recipientDeviceId: "reader-device",
      content: "opaque",
    },
    read: false,
    pinned: false,
    starred: false,
    isOwn: false,
    reactions: {},
    reactionUserUuidsByEmojiName: {},
    ownReactionUuidsByEmojiName: {},
    createdAt: "2026-10-26T00:00:00Z",
    updatedAt: "2026-10-26T00:00:00Z",
  };
  useWorkspaceMessageStore.getState().applyLiveCreatedMessage(grant);
  await vi.waitFor(() => expect(active.ingest).toHaveBeenLastCalledWith([grant]));
  const publicMessage = {
    ...grant,
    uuid: "44444444-4444-4444-8444-444444444444",
    payload: { kind: "markdown" as const, content: "Public" },
  };
  useWorkspaceMessageStore.getState().applyLiveCreatedMessage(publicMessage);
  await lease.sync();
  expect(active.ingest).toHaveBeenCalledTimes(2);
  lease.release();
  useWorkspaceMessageStore
    .getState()
    .applyLiveCreatedMessage({ ...grant, uuid: "55555555-5555-4555-8555-555555555555" });
  await Promise.resolve();
  expect(active.ingest).toHaveBeenCalledTimes(2);
  expect(active.dispose).toHaveBeenCalledOnce();
});

it("does not ingest a captured store after its owner changes during session loading", async () => {
  let finishLoad: (() => void) | undefined;
  const active = {
    load: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishLoad = resolve;
        }),
    ),
    ingest: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
  };
  open.mockResolvedValue(active);
  useWorkspaceMessageStore.getState().setOwner(workspaceRuntimeOwnerKey(runtime), false);
  const lease = acquireChatCryptoSession(runtime, "11111111-1111-4111-8111-111111111111");
  const ingestion = lease.sync();
  await vi.waitFor(() => expect(finishLoad).toBeDefined());
  useWorkspaceMessageStore.getState().setOwner("another-owner", false);
  finishLoad?.();
  await ingestion;
  expect(active.ingest).not.toHaveBeenCalled();
  lease.release();
});
