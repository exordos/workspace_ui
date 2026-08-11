import { beforeEach, describe, expect, it } from "vitest";
import {
  conversationIdForStream,
  conversationIdForTopic,
} from "~/entities/messenger/messenger-ids.lib";
import type {
  MessengerConversationId,
  MessengerMessage,
  MessengerUuid,
} from "~/entities/messenger/messenger.types";
import {
  selectWorkspaceConversationWindow,
  selectWorkspaceMessageById,
  selectWorkspaceMessagesForConversation,
  selectWorkspaceMessageStatusForConversation,
  useWorkspaceMessageStore,
} from "./message.model";

const PROJECT_UUID = "22222222-2222-4222-8222-222222222222";
const STREAM_UUID = "75309057-419c-4b12-a7c1-3932429ec4a6";
const TOPIC_UUID = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const AUTHOR_UUID = "11111111-1111-4111-8111-111111111111";
const USER_UUID = "44444444-4444-4444-8444-444444444444";
const MESSAGE_A = "10000000-0000-4000-8000-000000000001";
const MESSAGE_B = "10000000-0000-4000-8000-000000000002";
const MESSAGE_C = "10000000-0000-4000-8000-000000000003";
const DATE = "2026-06-22T10:10:00Z";
const DATE_LATER = "2026-06-22T10:20:00Z";
const DATE_EARLIER = "2026-06-22T10:00:00Z";
const OWNER_A = "owner-a";
const OWNER_B = "owner-b";

const TOPIC_CONVERSATION_ID = conversationIdForTopic(STREAM_UUID, TOPIC_UUID);
const STREAM_CONVERSATION_ID = conversationIdForStream(STREAM_UUID);

type MessageOverrides = Omit<Partial<MessengerMessage>, "payload"> & {
  markdown?: string;
  payload?: MessengerMessage["payload"];
};

function createMessage(overrides: MessageOverrides & { uuid: MessengerUuid }): MessengerMessage {
  const { uuid, markdown, payload, ...rest } = overrides;
  return {
    uuid,
    conversationId: TOPIC_CONVERSATION_ID,
    projectId: PROJECT_UUID,
    streamUuid: STREAM_UUID,
    topicUuid: TOPIC_UUID,
    authorUuid: AUTHOR_UUID,
    userUuid: USER_UUID,
    payload: payload ?? { kind: "markdown", content: markdown ?? "message" },
    read: false,
    pinned: false,
    starred: false,
    isOwn: false,
    reactions: {},
    reactionUserUuidsByEmojiName: {},
    ownReactionUuidsByEmojiName: {},
    createdAt: DATE,
    updatedAt: DATE,
    ...rest,
  };
}

function selectMessages(conversationId: MessengerConversationId): MessengerMessage[] {
  return selectWorkspaceMessagesForConversation(
    useWorkspaceMessageStore.getState(),
    conversationId,
  );
}

function replaceWindow(
  conversationId: MessengerConversationId,
  messages: readonly MessengerMessage[],
  options?: {
    anchorMessageUuid?: MessengerUuid | null;
    afterPageMarker?: string | null;
    beforePageMarker?: string | null;
    capturedMutationRevision?: number;
    expectedRevision?: number | null;
    mode?: "tail" | "around-anchor";
  },
): number | null {
  const state = useWorkspaceMessageStore.getState();
  const window = selectWorkspaceConversationWindow(state, conversationId);
  return state.replaceConversationWindow({
    conversationId,
    expectedRevision: options?.expectedRevision ?? window?.revision ?? null,
    capturedMutationRevision: options?.capturedMutationRevision ?? state.messageMutationRevision,
    mode: options?.mode ?? "tail",
    anchorMessageUuid: options?.anchorMessageUuid ?? null,
    messages,
    markers: {
      beforePageMarker: options?.beforePageMarker ?? null,
      afterPageMarker: options?.afterPageMarker ?? null,
    },
  });
}

describe("workspace message store", () => {
  beforeEach(() => {
    useWorkspaceMessageStore.getState().clear();
  });

  it("strictly replaces a window atomically and preserves bodies outside membership", () => {
    const store = useWorkspaceMessageStore.getState();
    store.upsertMessageBodyFromSnapshot(
      createMessage({ uuid: MESSAGE_C, markdown: "known body" }),
      store.messageMutationRevision,
    );
    store.setMessagesLoading(TOPIC_CONVERSATION_ID, true);
    store.setMessagesError(TOPIC_CONVERSATION_ID, "old error");
    const snapshots: ReturnType<typeof useWorkspaceMessageStore.getState>[] = [];
    const unsubscribe = useWorkspaceMessageStore.subscribe((state) => snapshots.push(state));

    const revision = replaceWindow(
      TOPIC_CONVERSATION_ID,
      [
        createMessage({ uuid: MESSAGE_B, createdAt: DATE, markdown: "b" }),
        createMessage({ uuid: MESSAGE_A, createdAt: DATE_EARLIER, markdown: "a" }),
      ],
      { beforePageMarker: "older", afterPageMarker: "newer" },
    );
    unsubscribe();

    expect(revision).toBe(1);
    expect(snapshots).toHaveLength(1);
    expect(selectMessages(TOPIC_CONVERSATION_ID).map((message) => message.uuid)).toEqual([
      MESSAGE_A,
      MESSAGE_B,
    ]);
    expect(
      selectWorkspaceConversationWindow(useWorkspaceMessageStore.getState(), TOPIC_CONVERSATION_ID),
    ).toEqual(
      expect.objectContaining({
        mode: "tail",
        anchorMessageUuid: null,
        beforePageMarker: "older",
        afterPageMarker: "newer",
        revision: 1,
      }),
    );
    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_C]?.payload.content).toBe(
      "known body",
    );
    expect(
      useWorkspaceMessageStore.getState().messagesLoadingByConversationId[TOPIC_CONVERSATION_ID],
    ).toBe(false);
    expect(
      useWorkspaceMessageStore.getState().messagesErrorByConversationId[TOPIC_CONVERSATION_ID],
    ).toBeNull();
  });

  it("rejects a stale strict replacement without writes", () => {
    const firstRevision = replaceWindow(TOPIC_CONVERSATION_ID, [
      createMessage({ uuid: MESSAGE_A }),
    ]);
    expect(firstRevision).toBe(1);
    const stateBefore = useWorkspaceMessageStore.getState();

    const applied = stateBefore.replaceConversationWindow({
      conversationId: TOPIC_CONVERSATION_ID,
      expectedRevision: 0,
      capturedMutationRevision: stateBefore.messageMutationRevision,
      mode: "around-anchor",
      anchorMessageUuid: MESSAGE_B,
      messages: [createMessage({ uuid: MESSAGE_B })],
      markers: { beforePageMarker: null, afterPageMarker: null },
    });

    expect(applied).toBeNull();
    expect(useWorkspaceMessageStore.getState()).toBe(stateBefore);
  });

  it("keeps an admissible live member when a stale window retry succeeds", () => {
    replaceWindow(
      TOPIC_CONVERSATION_ID,
      [
        createMessage({ uuid: MESSAGE_A, createdAt: DATE_EARLIER }),
        createMessage({ uuid: MESSAGE_C, createdAt: DATE_LATER }),
      ],
      { beforePageMarker: "older", afterPageMarker: "newer" },
    );
    const beforeLive = useWorkspaceMessageStore.getState();

    useWorkspaceMessageStore
      .getState()
      .applyLiveCreatedMessage(createMessage({ uuid: MESSAGE_B, createdAt: DATE }));

    expect(
      beforeLive.replaceConversationWindow({
        conversationId: TOPIC_CONVERSATION_ID,
        expectedRevision: 1,
        capturedMutationRevision: beforeLive.messageMutationRevision,
        mode: "around-anchor",
        anchorMessageUuid: MESSAGE_A,
        messages: [
          createMessage({ uuid: MESSAGE_A, createdAt: DATE_EARLIER }),
          createMessage({ uuid: MESSAGE_C, createdAt: DATE_LATER }),
        ],
        markers: { beforePageMarker: "older", afterPageMarker: "newer" },
      }),
    ).toBeNull();

    const retryState = useWorkspaceMessageStore.getState();
    expect(
      retryState.replaceConversationWindow({
        conversationId: TOPIC_CONVERSATION_ID,
        expectedRevision: 2,
        capturedMutationRevision: retryState.messageMutationRevision,
        mode: "around-anchor",
        anchorMessageUuid: MESSAGE_A,
        messages: [
          createMessage({ uuid: MESSAGE_A, createdAt: DATE_EARLIER }),
          createMessage({ uuid: MESSAGE_C, createdAt: DATE_LATER }),
        ],
        markers: { beforePageMarker: "older", afterPageMarker: "newer" },
      }),
    ).toBe(3);

    expect(selectMessages(TOPIC_CONVERSATION_ID).map((message) => message.uuid)).toEqual([
      MESSAGE_A,
      MESSAGE_B,
      MESSAGE_C,
    ]);
  });

  it.each(["tail", "around-anchor"] as const)(
    "replays a live-created body into a cold %s window when it fits the fetched bounds",
    (mode) => {
      const capturedMutationRevision = useWorkspaceMessageStore.getState().messageMutationRevision;
      useWorkspaceMessageStore
        .getState()
        .applyLiveCreatedMessage(createMessage({ uuid: MESSAGE_B, createdAt: DATE }));

      replaceWindow(
        TOPIC_CONVERSATION_ID,
        [
          createMessage({ uuid: MESSAGE_A, createdAt: DATE_EARLIER }),
          createMessage({ uuid: MESSAGE_C, createdAt: DATE_LATER }),
        ],
        {
          expectedRevision: null,
          capturedMutationRevision,
          mode,
          anchorMessageUuid: mode === "around-anchor" ? MESSAGE_A : null,
          beforePageMarker: "older",
          afterPageMarker: "newer",
        },
      );

      expect(selectMessages(TOPIC_CONVERSATION_ID).map((message) => message.uuid)).toEqual([
        MESSAGE_A,
        MESSAGE_B,
        MESSAGE_C,
      ]);
    },
  );

  it("keeps a cold-window live body outside a closed boundary out of membership", () => {
    const capturedMutationRevision = useWorkspaceMessageStore.getState().messageMutationRevision;
    useWorkspaceMessageStore
      .getState()
      .applyLiveCreatedMessage(createMessage({ uuid: MESSAGE_B, createdAt: DATE_LATER }));

    replaceWindow(TOPIC_CONVERSATION_ID, [createMessage({ uuid: MESSAGE_A })], {
      expectedRevision: null,
      capturedMutationRevision,
      mode: "around-anchor",
      anchorMessageUuid: MESSAGE_A,
      afterPageMarker: "newer",
    });

    expect(selectMessages(TOPIC_CONVERSATION_ID).map((message) => message.uuid)).toEqual([
      MESSAGE_A,
    ]);
    expect(
      selectWorkspaceMessageById(useWorkspaceMessageStore.getState(), MESSAGE_B),
    ).not.toBeNull();
  });

  it("drops a prior live member behind a newly closed boundary but keeps its body", () => {
    replaceWindow(TOPIC_CONVERSATION_ID, [createMessage({ uuid: MESSAGE_A })]);
    useWorkspaceMessageStore
      .getState()
      .applyLiveCreatedMessage(createMessage({ uuid: MESSAGE_B, createdAt: DATE_LATER }));
    const retryState = useWorkspaceMessageStore.getState();

    retryState.replaceConversationWindow({
      conversationId: TOPIC_CONVERSATION_ID,
      expectedRevision: 2,
      capturedMutationRevision: retryState.messageMutationRevision,
      mode: "around-anchor",
      anchorMessageUuid: MESSAGE_A,
      messages: [createMessage({ uuid: MESSAGE_A })],
      markers: { beforePageMarker: null, afterPageMarker: "newer" },
    });

    expect(selectMessages(TOPIC_CONVERSATION_ID).map((message) => message.uuid)).toEqual([
      MESSAGE_A,
    ]);
    expect(
      selectWorkspaceMessageById(useWorkspaceMessageStore.getState(), MESSAGE_B),
    ).not.toBeNull();
  });

  it("merges a page only when both revision and page marker still match", () => {
    replaceWindow(TOPIC_CONVERSATION_ID, [createMessage({ uuid: MESSAGE_B })], {
      beforePageMarker: "older-1",
    });
    const state = useWorkspaceMessageStore.getState();
    const window = selectWorkspaceConversationWindow(state, TOPIC_CONVERSATION_ID)!;

    const merged = state.mergeConversationWindowPage({
      conversationId: TOPIC_CONVERSATION_ID,
      expectedRevision: window.revision,
      expectedPageMarker: "older-1",
      capturedMutationRevision: state.messageMutationRevision,
      direction: "before",
      messages: [createMessage({ uuid: MESSAGE_A, createdAt: DATE_EARLIER })],
      pageMarker: "older-2",
    });

    expect(merged).toBe(2);
    expect(selectMessages(TOPIC_CONVERSATION_ID).map((message) => message.uuid)).toEqual([
      MESSAGE_A,
      MESSAGE_B,
    ]);
    const afterMerge = useWorkspaceMessageStore.getState();
    expect(
      afterMerge.mergeConversationWindowPage({
        conversationId: TOPIC_CONVERSATION_ID,
        expectedRevision: window.revision,
        expectedPageMarker: "older-1",
        capturedMutationRevision: afterMerge.messageMutationRevision,
        direction: "before",
        messages: [createMessage({ uuid: MESSAGE_C })],
        pageMarker: null,
      }),
    ).toBeNull();
    expect(useWorkspaceMessageStore.getState()).toBe(afterMerge);
  });

  it("does not let an older snapshot overwrite a newer live body", () => {
    const initialState = useWorkspaceMessageStore.getState();
    initialState.upsertMessageBodyFromSnapshot(
      createMessage({ uuid: MESSAGE_A, markdown: "initial" }),
      initialState.messageMutationRevision,
    );
    const capturedMutationRevision = useWorkspaceMessageStore.getState().messageMutationRevision;
    useWorkspaceMessageStore
      .getState()
      .applyLiveKnownBodyMutation(createMessage({ uuid: MESSAGE_A, markdown: "live" }));

    expect(
      useWorkspaceMessageStore
        .getState()
        .upsertMessageBodyFromSnapshot(
          createMessage({ uuid: MESSAGE_A, markdown: "snapshot" }),
          capturedMutationRevision,
        ),
    ).toBe(false);
    expect(
      selectWorkspaceMessageById(useWorkspaceMessageStore.getState(), MESSAGE_A)?.payload.content,
    ).toBe("live");
  });

  it("bumps the fence without creating a body for an unknown live update", () => {
    const before = useWorkspaceMessageStore.getState().messageMutationRevision;

    useWorkspaceMessageStore
      .getState()
      .applyLiveKnownBodyMutation(createMessage({ uuid: MESSAGE_A, markdown: "unknown update" }));

    const state = useWorkspaceMessageStore.getState();
    expect(state.messagesById[MESSAGE_A]).toBeUndefined();
    expect(state.messageMutationRevision).toBe(before + 1);
    expect(state.messageMutationRevisionById[MESSAGE_A]).toBe(before + 1);
  });

  it("does not let a fetched snapshot undo an optimistic read", () => {
    replaceWindow(TOPIC_CONVERSATION_ID, [createMessage({ uuid: MESSAGE_A, read: false })]);
    const beforeOptimisticRead = useWorkspaceMessageStore.getState();

    beforeOptimisticRead.beginOptimisticMessagesRead({
      streamUuid: STREAM_UUID,
      topicUuid: TOPIC_UUID,
    });
    replaceWindow(TOPIC_CONVERSATION_ID, [createMessage({ uuid: MESSAGE_A, read: false })], {
      capturedMutationRevision: beforeOptimisticRead.messageMutationRevision,
    });

    expect(useWorkspaceMessageStore.getState().messagesById[MESSAGE_A]?.read).toBe(true);
  });

  it("filters a tombstoned message out of an older strict snapshot", () => {
    const capturedMutationRevision = useWorkspaceMessageStore.getState().messageMutationRevision;
    useWorkspaceMessageStore.getState().removeMessage(MESSAGE_A);

    replaceWindow(TOPIC_CONVERSATION_ID, [createMessage({ uuid: MESSAGE_A })], {
      capturedMutationRevision,
    });

    expect(selectWorkspaceMessageById(useWorkspaceMessageStore.getState(), MESSAGE_A)).toBeNull();
    expect(selectMessages(TOPIC_CONVERSATION_ID)).toEqual([]);
  });

  it("keeps realtime outside an anchor window as body-only data", () => {
    replaceWindow(TOPIC_CONVERSATION_ID, [createMessage({ uuid: MESSAGE_A })], {
      mode: "around-anchor",
      anchorMessageUuid: MESSAGE_A,
      afterPageMarker: "newer",
    });
    const revision = selectWorkspaceConversationWindow(
      useWorkspaceMessageStore.getState(),
      TOPIC_CONVERSATION_ID,
    )!.revision;

    useWorkspaceMessageStore
      .getState()
      .applyLiveCreatedMessage(createMessage({ uuid: MESSAGE_B, createdAt: DATE_LATER }));

    expect(selectMessages(TOPIC_CONVERSATION_ID).map((message) => message.uuid)).toEqual([
      MESSAGE_A,
    ]);
    expect(
      selectWorkspaceMessageById(useWorkspaceMessageStore.getState(), MESSAGE_B),
    ).not.toBeNull();
    expect(
      selectWorkspaceConversationWindow(useWorkspaceMessageStore.getState(), TOPIC_CONVERSATION_ID)
        ?.revision,
    ).toBe(revision);
  });

  it("adds realtime to a tail only when the window reaches its after boundary", () => {
    replaceWindow(TOPIC_CONVERSATION_ID, [createMessage({ uuid: MESSAGE_A })]);
    useWorkspaceMessageStore
      .getState()
      .applyLiveCreatedMessage(createMessage({ uuid: MESSAGE_B, createdAt: DATE_LATER }));

    expect(selectMessages(TOPIC_CONVERSATION_ID).map((message) => message.uuid)).toEqual([
      MESSAGE_A,
      MESSAGE_B,
    ]);
    expect(
      selectWorkspaceConversationWindow(useWorkspaceMessageStore.getState(), TOPIC_CONVERSATION_ID)
        ?.revision,
    ).toBe(2);

    replaceWindow(TOPIC_CONVERSATION_ID, [createMessage({ uuid: MESSAGE_A })], {
      afterPageMarker: "newer",
    });
    useWorkspaceMessageStore
      .getState()
      .applyLiveCreatedMessage(createMessage({ uuid: MESSAGE_C, createdAt: DATE_LATER }));
    expect(selectMessages(TOPIC_CONVERSATION_ID).map((message) => message.uuid)).toEqual([
      MESSAGE_A,
    ]);
  });

  it("applies stream and topic window membership independently", () => {
    replaceWindow(TOPIC_CONVERSATION_ID, [createMessage({ uuid: MESSAGE_A })]);
    replaceWindow(STREAM_CONVERSATION_ID, [createMessage({ uuid: MESSAGE_A })], {
      afterPageMarker: "newer",
    });

    useWorkspaceMessageStore
      .getState()
      .applyLiveCreatedMessage(createMessage({ uuid: MESSAGE_B, createdAt: DATE_LATER }));

    expect(selectMessages(TOPIC_CONVERSATION_ID).map((message) => message.uuid)).toEqual([
      MESSAGE_A,
      MESSAGE_B,
    ]);
    expect(selectMessages(STREAM_CONVERSATION_ID).map((message) => message.uuid)).toEqual([
      MESSAGE_A,
    ]);
  });

  it("applies the same bounded membership rule for tail and anchor windows", () => {
    const cases = [
      {
        name: "around-anchor inserts a message between loaded bounds",
        mode: "around-anchor" as const,
        messages: [
          createMessage({ uuid: MESSAGE_A, createdAt: DATE_EARLIER }),
          createMessage({ uuid: MESSAGE_C, createdAt: DATE_LATER }),
        ],
        incoming: createMessage({ uuid: MESSAGE_B }),
        markers: { beforePageMarker: "older", afterPageMarker: "newer" },
        expectedUuids: [MESSAGE_A, MESSAGE_B, MESSAGE_C],
      },
      {
        name: "around-anchor keeps a newer message body-only behind an after marker",
        mode: "around-anchor" as const,
        messages: [createMessage({ uuid: MESSAGE_A })],
        incoming: createMessage({ uuid: MESSAGE_B, createdAt: DATE_LATER }),
        markers: { beforePageMarker: "older", afterPageMarker: "newer" },
        expectedUuids: [MESSAGE_A],
      },
      {
        name: "around-anchor extends through an open before boundary",
        mode: "around-anchor" as const,
        messages: [createMessage({ uuid: MESSAGE_A })],
        incoming: createMessage({ uuid: MESSAGE_B, createdAt: DATE_EARLIER }),
        markers: { beforePageMarker: null, afterPageMarker: "newer" },
        expectedUuids: [MESSAGE_B, MESSAGE_A],
      },
      {
        name: "tail inserts a message between loaded bounds",
        mode: "tail" as const,
        messages: [
          createMessage({ uuid: MESSAGE_A, createdAt: DATE_EARLIER }),
          createMessage({ uuid: MESSAGE_C, createdAt: DATE_LATER }),
        ],
        incoming: createMessage({ uuid: MESSAGE_B }),
        markers: { beforePageMarker: "older", afterPageMarker: "newer" },
        expectedUuids: [MESSAGE_A, MESSAGE_B, MESSAGE_C],
      },
      {
        name: "tail keeps an older message body-only behind a before marker",
        mode: "tail" as const,
        messages: [createMessage({ uuid: MESSAGE_A })],
        incoming: createMessage({ uuid: MESSAGE_B, createdAt: DATE_EARLIER }),
        markers: { beforePageMarker: "older", afterPageMarker: null },
        expectedUuids: [MESSAGE_A],
      },
      {
        name: "tail extends through an open before boundary",
        mode: "tail" as const,
        messages: [createMessage({ uuid: MESSAGE_A })],
        incoming: createMessage({ uuid: MESSAGE_B, createdAt: DATE_EARLIER }),
        markers: { beforePageMarker: null, afterPageMarker: "newer" },
        expectedUuids: [MESSAGE_B, MESSAGE_A],
      },
    ];

    for (const testCase of cases) {
      useWorkspaceMessageStore.getState().clear();
      replaceWindow(TOPIC_CONVERSATION_ID, testCase.messages, {
        mode: testCase.mode,
        anchorMessageUuid: testCase.mode === "around-anchor" ? MESSAGE_A : null,
        ...testCase.markers,
      });
      useWorkspaceMessageStore.getState().applyLiveCreatedMessage(testCase.incoming);

      expect(
        selectMessages(TOPIC_CONVERSATION_ID).map((message) => message.uuid),
        testCase.name,
      ).toEqual(testCase.expectedUuids);
      expect(
        selectWorkspaceMessageById(useWorkspaceMessageStore.getState(), testCase.incoming.uuid),
        testCase.name,
      ).not.toBeNull();
    }
  });

  it("keeps a realtime update body-only and ignores duplicate created membership", () => {
    replaceWindow(TOPIC_CONVERSATION_ID, []);
    const update = createMessage({ uuid: MESSAGE_A, markdown: "update" });
    const state = useWorkspaceMessageStore.getState();
    state.upsertMessageBodyFromSnapshot(
      createMessage({ uuid: MESSAGE_A, markdown: "initial" }),
      state.messageMutationRevision,
    );
    useWorkspaceMessageStore.getState().applyLiveKnownBodyMutation(update);
    expect(selectMessages(TOPIC_CONVERSATION_ID)).toEqual([]);
    expect(
      selectWorkspaceMessageById(useWorkspaceMessageStore.getState(), MESSAGE_A)?.payload.content,
    ).toBe("update");

    useWorkspaceMessageStore.getState().applyLiveCreatedMessage(update);
    const revision = selectWorkspaceConversationWindow(
      useWorkspaceMessageStore.getState(),
      TOPIC_CONVERSATION_ID,
    )!.revision;
    useWorkspaceMessageStore.getState().applyLiveCreatedMessage(update);

    expect(selectMessages(TOPIC_CONVERSATION_ID).map((message) => message.uuid)).toEqual([
      MESSAGE_A,
    ]);
    expect(
      selectWorkspaceConversationWindow(useWorkspaceMessageStore.getState(), TOPIC_CONVERSATION_ID)
        ?.revision,
    ).toBe(revision);
  });

  it("deletes the body and membership, records a tombstone, and advances touched windows", () => {
    replaceWindow(TOPIC_CONVERSATION_ID, [createMessage({ uuid: MESSAGE_A })]);
    replaceWindow(STREAM_CONVERSATION_ID, [createMessage({ uuid: MESSAGE_A })]);
    const topicRevision = selectWorkspaceConversationWindow(
      useWorkspaceMessageStore.getState(),
      TOPIC_CONVERSATION_ID,
    )!.revision;
    const streamRevision = selectWorkspaceConversationWindow(
      useWorkspaceMessageStore.getState(),
      STREAM_CONVERSATION_ID,
    )!.revision;

    useWorkspaceMessageStore.getState().removeMessage(MESSAGE_A);

    const state = useWorkspaceMessageStore.getState();
    expect(state.messagesById[MESSAGE_A]).toBeUndefined();
    expect(selectMessages(TOPIC_CONVERSATION_ID)).toEqual([]);
    expect(selectMessages(STREAM_CONVERSATION_ID)).toEqual([]);
    expect(state.deletedMessageRevisionById[MESSAGE_A]).toBe(state.messageMutationRevision);
    expect(selectWorkspaceConversationWindow(state, TOPIC_CONVERSATION_ID)?.revision).toBe(
      topicRevision + 1,
    );
    expect(selectWorkspaceConversationWindow(state, STREAM_CONVERSATION_ID)?.revision).toBe(
      streamRevision + 1,
    );
  });

  it("keeps a newer live body in strict replacement membership", () => {
    replaceWindow(TOPIC_CONVERSATION_ID, [createMessage({ uuid: MESSAGE_A })], {
      mode: "around-anchor",
      anchorMessageUuid: MESSAGE_A,
    });
    const beforeLiveUpdate = useWorkspaceMessageStore.getState();
    useWorkspaceMessageStore
      .getState()
      .applyLiveKnownBodyMutation(createMessage({ uuid: MESSAGE_A, markdown: "live" }));

    const replacementRevision = useWorkspaceMessageStore.getState().replaceConversationWindow({
      conversationId: TOPIC_CONVERSATION_ID,
      expectedRevision: 1,
      capturedMutationRevision: beforeLiveUpdate.messageMutationRevision,
      mode: "around-anchor",
      anchorMessageUuid: MESSAGE_A,
      messages: [createMessage({ uuid: MESSAGE_A, markdown: "snapshot" })],
      markers: { beforePageMarker: "older", afterPageMarker: "newer" },
    });

    expect(replacementRevision).toBe(2);
    expect(selectMessages(TOPIC_CONVERSATION_ID)).toEqual([
      expect.objectContaining({ uuid: MESSAGE_A, payload: { kind: "markdown", content: "live" } }),
    ]);
  });

  it("keeps selector fallbacks stable and derives pagination from the descriptor", () => {
    const firstMessages = selectWorkspaceMessagesForConversation(
      useWorkspaceMessageStore.getState(),
      "topic:missing:missing",
    );
    const firstStatus = selectWorkspaceMessageStatusForConversation(
      useWorkspaceMessageStore.getState(),
      "topic:missing:missing",
    );
    expect(
      selectWorkspaceMessagesForConversation(
        useWorkspaceMessageStore.getState(),
        "topic:missing:missing",
      ),
    ).toBe(firstMessages);
    expect(
      selectWorkspaceMessageStatusForConversation(
        useWorkspaceMessageStore.getState(),
        "topic:missing:missing",
      ),
    ).toBe(firstStatus);

    replaceWindow(TOPIC_CONVERSATION_ID, [], { beforePageMarker: "older" });
    expect(
      selectWorkspaceMessageStatusForConversation(
        useWorkspaceMessageStore.getState(),
        TOPIC_CONVERSATION_ID,
      ),
    ).toEqual(expect.objectContaining({ nextPageMarker: "older", hasMore: true }));
  });

  it("clears all window data when its stream is removed and starts clean after an owner switch", () => {
    const store = useWorkspaceMessageStore.getState();
    store.setOwner(OWNER_A, false);
    replaceWindow(TOPIC_CONVERSATION_ID, [createMessage({ uuid: MESSAGE_A })]);
    replaceWindow(STREAM_CONVERSATION_ID, [createMessage({ uuid: MESSAGE_A })]);
    store.removeMessagesForStream(STREAM_UUID);

    expect(
      selectWorkspaceConversationWindow(useWorkspaceMessageStore.getState(), TOPIC_CONVERSATION_ID),
    ).toBeNull();
    expect(
      selectWorkspaceConversationWindow(
        useWorkspaceMessageStore.getState(),
        STREAM_CONVERSATION_ID,
      ),
    ).toBeNull();
    expect(selectWorkspaceMessageById(useWorkspaceMessageStore.getState(), MESSAGE_A)).toBeNull();

    store.setOwner(OWNER_B, false);
    store.applyLiveCreatedMessage(createMessage({ uuid: MESSAGE_B }));
    expect(
      selectWorkspaceMessageById(useWorkspaceMessageStore.getState(), MESSAGE_B),
    ).not.toBeNull();
  });
});
