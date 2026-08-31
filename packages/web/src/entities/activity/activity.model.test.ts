import { afterEach, describe, expect, it } from "vitest";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import {
  selectActivityLiveMentionMessages,
  useActivityStore,
  type ActivityUnreadMention,
} from "./activity.model";

const OWNER = "owner-1";
const RUNTIME_GENERATION = 7;

const mention = (overrides: Partial<ActivityUnreadMention> = {}): ActivityUnreadMention => ({
  uuid: "message-1",
  streamUuid: "stream-1",
  topicUuid: "topic-1",
  createdAt: "2026-08-07T10:00:00Z",
  ...overrides,
});

const liveMentionMessage = (overrides: Partial<MessengerMessage> = {}): MessengerMessage => ({
  uuid: "message-1",
  conversationId: "topic:stream-1:topic-1",
  projectId: "project-1",
  streamUuid: "stream-1",
  topicUuid: "topic-1",
  authorUuid: "user-2",
  userUuid: "user-1",
  payload: { kind: "markdown", content: "Live mention" },
  read: false,
  pinned: false,
  starred: false,
  isOwn: false,
  mentioned: true,
  sourceName: "native",
  source: { kind: "native" },
  provider: null,
  delivery: null,
  reactions: {},
  reactionUserUuidsByEmojiName: {},
  ownReactionUuidsByEmojiName: {},
  createdAt: "2026-08-07T10:00:00Z",
  updatedAt: "2026-08-07T10:00:00Z",
  ...overrides,
});

afterEach(() => {
  useActivityStore.getState().clear();
});

describe("unread mentions activity index", () => {
  it("replays ordered compact mutations after the bootstrap snapshot", () => {
    const store = useActivityStore.getState();
    const token = store.startUnreadMentionsBootstrap(OWNER, RUNTIME_GENERATION);

    store.applyUnreadMentionMutation(OWNER, RUNTIME_GENERATION, {
      kind: "upsert",
      epochVersion: 10,
      mention: mention({ uuid: "message-2" }),
    });
    store.applyUnreadMentionMutation(OWNER, RUNTIME_GENERATION, {
      kind: "read-boundary",
      epochVersion: 11,
      streamUuid: "stream-1",
      topicUuid: "topic-1",
      createdAt: "2026-08-07T10:00:00Z",
      uuid: "message-1",
    });

    expect(useActivityStore.getState().unreadMentionsBufferedMutations).toHaveLength(2);

    expect(
      store.finishUnreadMentionsBootstrap(OWNER, RUNTIME_GENERATION, token, [
        mention(),
        mention({ uuid: "message-3", createdAt: "2026-08-07T10:01:00Z" }),
      ]),
    ).toBe(true);

    expect(useActivityStore.getState()).toMatchObject({
      unreadMentionsStatus: "ready",
      unreadMentionsCount: 2,
      unreadMentionsByUuid: {
        "message-2": expect.any(Object),
        "message-3": expect.any(Object),
      },
      unreadMentionsBufferedMutations: [],
    });
  });

  it("ignores stale owners, generations and bootstrap tokens", () => {
    const store = useActivityStore.getState();
    const firstToken = store.startUnreadMentionsBootstrap(OWNER, RUNTIME_GENERATION);
    const secondToken = store.startUnreadMentionsBootstrap(OWNER, RUNTIME_GENERATION + 1);

    expect(
      store.finishUnreadMentionsBootstrap(OWNER, RUNTIME_GENERATION, firstToken, [mention()]),
    ).toBe(false);
    expect(
      store.finishUnreadMentionsBootstrap("owner-2", RUNTIME_GENERATION + 1, secondToken, [
        mention(),
      ]),
    ).toBe(false);

    store.applyUnreadMentionMutation(OWNER, RUNTIME_GENERATION, {
      kind: "upsert",
      epochVersion: 12,
      mention: mention(),
    });
    expect(useActivityStore.getState().unreadMentionsBufferedMutations).toEqual([]);

    expect(
      store.finishUnreadMentionsBootstrap(OWNER, RUNTIME_GENERATION + 1, secondToken, [mention()]),
    ).toBe(true);
    expect(useActivityStore.getState().unreadMentionsCount).toBe(1);
  });

  it("handles all mutation kinds idempotently and never makes the count negative", () => {
    const store = useActivityStore.getState();
    const token = store.startUnreadMentionsBootstrap(OWNER, RUNTIME_GENERATION);
    store.finishUnreadMentionsBootstrap(OWNER, RUNTIME_GENERATION, token, [
      mention(),
      mention({ uuid: "message-2", createdAt: "2026-08-07T10:01:00Z" }),
      mention({ uuid: "message-3", topicUuid: "topic-2" }),
      mention({ uuid: "message-4", streamUuid: "stream-2" }),
    ]);

    store.applyUnreadMentionMutation(OWNER, RUNTIME_GENERATION, {
      kind: "read-exact",
      epochVersion: 20,
      uuids: ["message-2", "message-2", "missing"],
    });
    store.applyUnreadMentionMutation(OWNER, RUNTIME_GENERATION, {
      kind: "clear-topic",
      epochVersion: 21,
      streamUuid: "stream-1",
      topicUuid: "topic-2",
    });
    store.applyUnreadMentionMutation(OWNER, RUNTIME_GENERATION, {
      kind: "read-boundary",
      epochVersion: 22,
      streamUuid: "stream-1",
      topicUuid: "topic-1",
      createdAt: "2026-08-07T10:00:00Z",
      uuid: "message-1",
    });
    store.applyUnreadMentionMutation(OWNER, RUNTIME_GENERATION, {
      kind: "clear-stream",
      epochVersion: 23,
      streamUuid: "stream-2",
    });
    store.applyUnreadMentionMutation(OWNER, RUNTIME_GENERATION, {
      kind: "delete",
      epochVersion: 24,
      uuid: "missing",
    });

    expect(useActivityStore.getState()).toMatchObject({
      unreadMentionsCount: 0,
      unreadMentionsByUuid: {},
    });
  });

  it("adds and removes a mention without double counting", () => {
    const store = useActivityStore.getState();
    const token = store.startUnreadMentionsBootstrap(OWNER, RUNTIME_GENERATION);
    store.finishUnreadMentionsBootstrap(OWNER, RUNTIME_GENERATION, token, []);

    store.applyUnreadMentionMutation(OWNER, RUNTIME_GENERATION, {
      kind: "upsert",
      epochVersion: 30,
      mention: mention(),
    });
    store.applyUnreadMentionMutation(OWNER, RUNTIME_GENERATION, {
      kind: "delete",
      epochVersion: 31,
      uuid: mention().uuid,
    });
    store.applyUnreadMentionMutation(OWNER, RUNTIME_GENERATION, {
      kind: "delete",
      epochVersion: 32,
      uuid: "message-2",
    });

    expect(useActivityStore.getState()).toMatchObject({
      unreadMentionsCount: 0,
      unreadMentionsByUuid: {},
    });
  });

  it("deduplicates the bootstrap snapshot and keeps the latest duplicate", () => {
    const store = useActivityStore.getState();
    const token = store.startUnreadMentionsBootstrap(OWNER, RUNTIME_GENERATION);
    const latestDuplicate = mention({ createdAt: "2026-08-07T10:02:00Z" });

    store.finishUnreadMentionsBootstrap(OWNER, RUNTIME_GENERATION, token, [
      mention(),
      mention({ uuid: "message-2" }),
      latestDuplicate,
    ]);

    expect(useActivityStore.getState()).toMatchObject({
      unreadMentionsCount: 2,
      unreadMentionsByUuid: { "message-1": latestDuplicate, "message-2": expect.any(Object) },
    });
  });

  it("ignores duplicate and older epochs after the bootstrap", () => {
    const store = useActivityStore.getState();
    const token = store.startUnreadMentionsBootstrap(OWNER, RUNTIME_GENERATION);
    store.finishUnreadMentionsBootstrap(OWNER, RUNTIME_GENERATION, token, []);

    store.applyUnreadMentionMutation(OWNER, RUNTIME_GENERATION, {
      kind: "upsert",
      epochVersion: 40,
      mention: mention(),
    });
    store.applyUnreadMentionMutation(OWNER, RUNTIME_GENERATION, {
      kind: "delete",
      epochVersion: 40,
      uuid: mention().uuid,
    });
    store.applyUnreadMentionMutation(OWNER, RUNTIME_GENERATION, {
      kind: "delete",
      epochVersion: 39,
      uuid: mention().uuid,
    });

    expect(useActivityStore.getState()).toMatchObject({
      unreadMentionsCount: 1,
      unreadMentionsLastEpochVersion: 40,
      unreadMentionsByUuid: { "message-1": expect.any(Object) },
    });
  });

  it("builds a large bootstrap snapshot without losing entries", () => {
    const store = useActivityStore.getState();
    const token = store.startUnreadMentionsBootstrap(OWNER, RUNTIME_GENERATION);
    const mentions = Array.from({ length: 2_000 }, (_, index) =>
      mention({ uuid: `message-${index}` }),
    );

    store.finishUnreadMentionsBootstrap(OWNER, RUNTIME_GENERATION, token, mentions);

    expect(useActivityStore.getState()).toMatchObject({
      unreadMentionsCount: mentions.length,
      unreadMentionsStatus: "ready",
    });
  });
});

describe("live mention messages", () => {
  it("keeps full messages in the current owner runtime and ignores stale writes", () => {
    const store = useActivityStore.getState();
    store.startUnreadMentionsBootstrap(OWNER, RUNTIME_GENERATION);

    store.applyLiveMentionMessageMutation(OWNER, RUNTIME_GENERATION, {
      kind: "upsert",
      epochVersion: 50,
      message: liveMentionMessage(),
    });
    store.applyLiveMentionMessageMutation("owner-2", RUNTIME_GENERATION, {
      kind: "delete",
      epochVersion: 51,
      uuid: "message-1",
    });
    store.applyLiveMentionMessageMutation(OWNER, RUNTIME_GENERATION + 1, {
      kind: "delete",
      epochVersion: 51,
      uuid: "message-1",
    });
    store.applyLiveMentionMessageMutation(OWNER, RUNTIME_GENERATION, {
      kind: "delete",
      epochVersion: 49,
      uuid: "message-1",
    });

    expect(
      selectActivityLiveMentionMessages(useActivityStore.getState(), OWNER, RUNTIME_GENERATION),
    ).toEqual({ "message-1": liveMentionMessage() });
    expect(
      selectActivityLiveMentionMessages(useActivityStore.getState(), "owner-2", RUNTIME_GENERATION),
    ).toEqual({});
  });

  it("preserves a live overlay for the same runtime and resets it for the next runtime", () => {
    const store = useActivityStore.getState();
    store.startUnreadMentionsBootstrap(OWNER, RUNTIME_GENERATION);
    store.applyLiveMentionMessageMutation(OWNER, RUNTIME_GENERATION, {
      kind: "upsert",
      epochVersion: 60,
      message: liveMentionMessage(),
    });

    store.startUnreadMentionsBootstrap(OWNER, RUNTIME_GENERATION);
    expect(useActivityStore.getState().liveMentionMessagesByUuid).toEqual({
      "message-1": liveMentionMessage(),
    });

    store.startUnreadMentionsBootstrap(OWNER, RUNTIME_GENERATION + 1);
    expect(useActivityStore.getState()).toMatchObject({
      liveMentionMessagesByUuid: {},
      liveMentionMessagesOwnerKey: OWNER,
      liveMentionMessagesRuntimeGeneration: RUNTIME_GENERATION + 1,
      liveMentionMessagesLastEpochVersion: null,
    });
  });
});
