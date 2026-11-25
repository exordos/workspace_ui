import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/platform/sessions/workspace-runtime.lib";
import "../../messenger-runtime-mutation.lib";
import { selectWorkspaceMessagesForConversation, useWorkspaceMessageStore } from "../message.model";
import {
  selectMessengerOutgoingMessagesForConversation,
  settleMessengerOutgoingMessage,
  useMessengerOutboxStore,
} from "./messenger-outbox.model";
import type { MessengerOutgoingMessage } from "./messenger-outbox.types";
import type { MessengerMessage } from "../../messenger.types";

const OWNER_A = "account-a:project-a";
const OWNER_B = "account-b:project-b";
const CONVERSATION_A = "topic:stream-a:topic-a";
const TOPIC_UUID = "00000000-0000-0000-0000-000000000001";
const CANONICAL_MESSAGE_UUID = "00000000-0000-4000-8000-000000000002";
const PLACEMENT_UUID = "d2919e10-8c62-5b88-89e6-ed7da20fc912";

function createAuthoritativeMessage(
  outgoing: MessengerOutgoingMessage,
  overrides: Partial<MessengerMessage> = {},
): MessengerMessage {
  return {
    uuid: outgoing.placementUuid,
    conversationId: outgoing.conversationId,
    projectId: outgoing.projectId,
    streamUuid: outgoing.streamUuid,
    topicUuid: outgoing.topicUuid,
    authorUuid: outgoing.authorUuid,
    userUuid: outgoing.authorUuid,
    payload: { kind: "markdown", content: outgoing.markdown },
    read: true,
    pinned: false,
    starred: false,
    isOwn: true,
    reactions: {},
    reactionUserUuidsByEmojiName: {},
    ownReactionUuidsByEmojiName: {},
    createdAt: outgoing.createdAt,
    updatedAt: outgoing.updatedAt,
    ...overrides,
  };
}

describe("messenger outbox store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T12:00:00.000Z"));
    useMessengerOutboxStore.getState().clear();
    useWorkspaceMessageStore.getState().clear();
  });

  afterEach(() => {
    useWorkspaceAuthStore.getState().clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("keeps outgoing records across selection and releases only an ending incarnation", () => {
    const auth = useWorkspaceAuthStore.getState();
    const session = {
      accountId: "a",
      instanceId: "i-a",
      organizationId: "org",
      organizationOrigin: "https://workspace.example.test",
      projectId: "project",
      userUuid: "user-a",
      accessToken: "test-access",
      login: "A",
      profile: { uuid: "user-a", username: "A", firstName: null, lastName: null, email: null },
    };
    const accountB = { ...session, accountId: "b", instanceId: "i-b" };
    const enqueue = (owner: typeof session) =>
      useMessengerOutboxStore.getState().enqueueOutgoingMessage({
        ownerKey: workspaceRuntimeOwnerKey(owner),
        conversationId: CONVERSATION_A,
        projectId: owner.projectId,
        streamUuid: "stream-a",
        topicUuid: TOPIC_UUID,
        authorUuid: owner.userUuid,
        markdown: "draft",
        status: "sending",
        includeStreamConversation: false,
      });

    auth.setSession(session);
    const outgoingA = enqueue(session);
    auth.setSession(accountB);
    const outgoingB = enqueue(accountB);
    auth.setCurrentAccountId(session.accountId);

    const records = () => useMessengerOutboxStore.getState().outgoingMessagesByPlacementUuid;
    expect(records()[outgoingA.placementUuid]).toBe(outgoingA);
    expect(records()[outgoingB.placementUuid]).toBe(outgoingB);
    auth.removeSession(accountB.accountId);
    expect(records()[outgoingB.placementUuid]).toBeUndefined();
    expect(records()[outgoingA.placementUuid]).toBe(outgoingA);

    auth.setSession({ ...session, accessToken: "replacement-access" });
    expect(records()[outgoingA.placementUuid]).toBeUndefined();
  });

  it("keeps local outgoing messages outside the canonical Workspace message store", () => {
    const randomUuid = vi.spyOn(crypto, "randomUUID").mockReturnValue(CANONICAL_MESSAGE_UUID);
    const outgoing = useMessengerOutboxStore.getState().enqueueOutgoingMessage({
      ownerKey: OWNER_A,
      conversationId: CONVERSATION_A,
      projectId: "project-a",
      streamUuid: "stream-a",
      topicUuid: TOPIC_UUID,
      authorUuid: "user-a",
      markdown: "local text",
      sourceMarkdown: "local text",
      status: "sending",
      includeStreamConversation: false,
    });

    expect(
      selectMessengerOutgoingMessagesForConversation(
        useMessengerOutboxStore.getState(),
        OWNER_A,
        CONVERSATION_A,
      ),
    ).toEqual([outgoing]);
    expect(
      selectWorkspaceMessagesForConversation(useWorkspaceMessageStore.getState(), CONVERSATION_A),
    ).toEqual([]);
    expect(outgoing).toEqual(
      expect.objectContaining({
        canonicalMessageUuid: CANONICAL_MESSAGE_UUID,
        placementUuid: PLACEMENT_UUID,
      }),
    );
    expect(randomUuid).toHaveBeenCalledOnce();
    expect(useMessengerOutboxStore.getState().outgoingMessagesByPlacementUuid).toEqual({
      [PLACEMENT_UUID]: outgoing,
    });
  });

  it("filters outgoing messages by runtime owner", () => {
    useMessengerOutboxStore.getState().enqueueOutgoingMessage({
      ownerKey: OWNER_A,
      conversationId: CONVERSATION_A,
      projectId: "project-a",
      streamUuid: "stream-a",
      topicUuid: TOPIC_UUID,
      authorUuid: "user-a",
      markdown: "owner a text",
      sourceMarkdown: "owner a text",
      status: "sending",
      includeStreamConversation: false,
    });
    useMessengerOutboxStore.getState().enqueueOutgoingMessage({
      ownerKey: OWNER_B,
      conversationId: CONVERSATION_A,
      projectId: "project-b",
      streamUuid: "stream-a",
      topicUuid: TOPIC_UUID,
      authorUuid: "user-b",
      markdown: "owner b text",
      sourceMarkdown: "owner b text",
      status: "sending",
      includeStreamConversation: false,
    });

    expect(
      selectMessengerOutgoingMessagesForConversation(
        useMessengerOutboxStore.getState(),
        OWNER_A,
        CONVERSATION_A,
      ).map((message) => message.markdown),
    ).toEqual(["owner a text"]);
  });

  it("retains an encrypted retry envelope and settles only its exact generation", () => {
    const state = useMessengerOutboxStore.getState();
    const outgoing = state.enqueueOutgoingMessage({
      ownerKey: OWNER_A,
      conversationId: CONVERSATION_A,
      projectId: "project-a",
      streamUuid: "stream-a",
      topicUuid: TOPIC_UUID,
      authorUuid: "user-a",
      markdown: "private outgoing text",
      status: "sending",
      includeStreamConversation: false,
      encryption: { keyUuid: "key-a", deviceId: "device-a" },
    });
    const bytes = new Uint8Array([1, 2, 3]);
    state.retainEncryptedPayload(outgoing.placementUuid, {
      kind: "e2ee",
      keyUuid: "key-a",
      content: { bytes },
    });
    bytes.fill(9);
    state.markOutgoingMessageFailed(outgoing.placementUuid, "response lost");
    state.markOutgoingMessageSending(outgoing.placementUuid);
    const retry =
      useMessengerOutboxStore.getState().outgoingMessagesByPlacementUuid[outgoing.placementUuid];
    expect(retry?.encryption?.payload?.content.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(retry?.canonicalMessageUuid).toBe(outgoing.canonicalMessageUuid);
    expect(settleMessengerOutgoingMessage(OWNER_A, createAuthoritativeMessage(outgoing))).toBe(
      false,
    );
    expect(
      settleMessengerOutgoingMessage(
        OWNER_A,
        createAuthoritativeMessage(outgoing, {
          payload: { kind: "e2ee", keyUuid: "key-b", content: "encrypted" },
        }),
      ),
    ).toBe(false);
    expect(
      settleMessengerOutgoingMessage(
        OWNER_A,
        createAuthoritativeMessage(outgoing, {
          payload: { kind: "e2ee", keyUuid: "key-a", content: "different-envelope" },
        }),
      ),
    ).toBe(false);
    expect(
      settleMessengerOutgoingMessage(
        OWNER_A,
        createAuthoritativeMessage(outgoing, {
          payload: { kind: "e2ee", keyUuid: "key-a", content: "AQID" },
        }),
      ),
    ).toBe(true);
    expect(useWorkspaceMessageStore.getState().messagesById).toEqual({});
  });

  it("retries the same placement row without changing its identity", () => {
    const outgoing = useMessengerOutboxStore.getState().enqueueOutgoingMessage({
      ownerKey: OWNER_A,
      conversationId: CONVERSATION_A,
      projectId: "project-a",
      streamUuid: "stream-a",
      topicUuid: TOPIC_UUID,
      authorUuid: "user-a",
      markdown: "local text",
      sourceMarkdown: "local text",
      status: "sending",
      includeStreamConversation: false,
    });

    useMessengerOutboxStore.getState().markOutgoingMessageFailed(outgoing.placementUuid, "failed");
    useMessengerOutboxStore.getState().markOutgoingMessageSending(outgoing.placementUuid);

    const messages = selectMessengerOutgoingMessagesForConversation(
      useMessengerOutboxStore.getState(),
      OWNER_A,
      CONVERSATION_A,
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual(
      expect.objectContaining({
        canonicalMessageUuid: outgoing.canonicalMessageUuid,
        placementUuid: outgoing.placementUuid,
        status: "sending",
        attempt: 2,
        error: null,
      }),
    );
  });

  it("removes a placement row after the server confirms delivery", () => {
    const outgoing = useMessengerOutboxStore.getState().enqueueOutgoingMessage({
      ownerKey: OWNER_A,
      conversationId: CONVERSATION_A,
      projectId: "project-a",
      streamUuid: "stream-a",
      topicUuid: TOPIC_UUID,
      authorUuid: "user-a",
      markdown: "local text",
      sourceMarkdown: "local text",
      status: "sending",
      includeStreamConversation: false,
    });

    useMessengerOutboxStore.getState().removeOutgoingMessage(outgoing.placementUuid);

    expect(
      selectMessengerOutgoingMessagesForConversation(
        useMessengerOutboxStore.getState(),
        OWNER_A,
        CONVERSATION_A,
      ),
    ).toEqual([]);
  });

  it("settles an outgoing row only after its exact authoritative message arrives", () => {
    const outgoing = useMessengerOutboxStore.getState().enqueueOutgoingMessage({
      ownerKey: OWNER_A,
      conversationId: CONVERSATION_A,
      projectId: "project-a",
      streamUuid: "stream-a",
      topicUuid: TOPIC_UUID,
      authorUuid: "user-a",
      markdown: "local text",
      status: "sending",
      includeStreamConversation: false,
    });

    expect(settleMessengerOutgoingMessage(OWNER_A, createAuthoritativeMessage(outgoing))).toBe(
      true,
    );
    expect(
      useMessengerOutboxStore.getState().outgoingMessagesByPlacementUuid[outgoing.placementUuid],
    ).toBeUndefined();
  });

  it("registers confirmation before publishing and isolates a failing completion effect", () => {
    const store = useMessengerOutboxStore;
    const onConfirmed = vi.fn(() => {
      throw new Error("Secondary completion failed");
    });
    let accepted: boolean | undefined;
    const unsubscribe = store.subscribe((state) => {
      const row = Object.values(state.outgoingMessagesByPlacementUuid)[0];
      if (row == null) return;
      accepted = settleMessengerOutgoingMessage(OWNER_A, createAuthoritativeMessage(row));
    });
    try {
      const outgoing = store.getState().enqueueOutgoingMessage(
        {
          ownerKey: OWNER_A,
          conversationId: CONVERSATION_A,
          projectId: "project-a",
          streamUuid: "stream-a",
          topicUuid: TOPIC_UUID,
          authorUuid: "user-a",
          markdown: "accepted text",
          status: "sending",
          includeStreamConversation: false,
        },
        onConfirmed,
      );
      expect(accepted).toBe(true);
      expect(onConfirmed).toHaveBeenCalledOnce();
      expect(settleMessengerOutgoingMessage(OWNER_A, createAuthoritativeMessage(outgoing))).toBe(
        false,
      );
      expect(onConfirmed).toHaveBeenCalledOnce();
    } finally {
      unsubscribe();
    }
  });

  it.each(["dismiss", "clear owner"] as const)(
    "discards the owner-scoped confirmation when an outgoing row is removed by %s",
    (removal) => {
      vi.spyOn(crypto, "randomUUID").mockReturnValue(CANONICAL_MESSAGE_UUID);
      const store = useMessengerOutboxStore.getState();
      const onConfirmed = vi.fn();
      const draft = {
        ownerKey: OWNER_A,
        conversationId: CONVERSATION_A,
        projectId: "project-a",
        streamUuid: "stream-a",
        topicUuid: TOPIC_UUID,
        authorUuid: "user-a",
        markdown: "accepted text",
        status: "sending" as const,
        includeStreamConversation: false,
      };
      const outgoing = store.enqueueOutgoingMessage(draft, onConfirmed);
      if (removal === "dismiss") store.removeOutgoingMessage(outgoing.placementUuid);
      else store.clearOwner(OWNER_A);
      const replacement = store.enqueueOutgoingMessage(draft);
      expect(replacement.placementUuid).toBe(outgoing.placementUuid);
      expect(settleMessengerOutgoingMessage(OWNER_B, createAuthoritativeMessage(replacement))).toBe(
        false,
      );
      expect(settleMessengerOutgoingMessage(OWNER_A, createAuthoritativeMessage(replacement))).toBe(
        true,
      );
      expect(onConfirmed).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["owner", OWNER_B],
    ["projectId", "project-b"],
    ["streamUuid", "stream-b"],
    ["topicUuid", "00000000-0000-0000-0000-000000000009"],
    ["authorUuid", "user-b"],
  ] as const)("does not settle when %s does not match", (field, value) => {
    const outgoing = useMessengerOutboxStore.getState().enqueueOutgoingMessage({
      ownerKey: OWNER_A,
      conversationId: CONVERSATION_A,
      projectId: "project-a",
      streamUuid: "stream-a",
      topicUuid: TOPIC_UUID,
      authorUuid: "user-a",
      markdown: "local text",
      status: "sending",
      includeStreamConversation: false,
    });
    const message = createAuthoritativeMessage(
      outgoing,
      field === "owner" ? {} : { [field]: value },
    );

    expect(settleMessengerOutgoingMessage(field === "owner" ? value : OWNER_A, message)).toBe(
      false,
    );
    expect(
      useMessengerOutboxStore.getState().outgoingMessagesByPlacementUuid[outgoing.placementUuid],
    ).toBe(outgoing);
  });
});
