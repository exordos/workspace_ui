import { afterEach, describe, expect, it } from "vitest";
import type {
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerStreamDto,
  WorkspaceMessengerTopicDto,
} from "~/shared/api/messenger.types";
import type { WorkspaceRealtimeEventContext } from "~/shared/lib/workspace-realtime/workspace-realtime-runtime.lib";
import { createActivityRealtimeApplier } from "./activity-realtime-applier.lib";
import { useActivityStore, type ActivityUnreadMention } from "./activity.model";

const OWNER_KEY = "owner-1";
const PROJECT_UUID = "11111111-1111-4111-8111-111111111111";
const STREAM_UUID = "22222222-2222-4222-8222-222222222222";
const SECOND_STREAM_UUID = "33333333-3333-4333-8333-333333333333";
const TOPIC_UUID = "44444444-4444-4444-8444-444444444444";
const SECOND_TOPIC_UUID = "55555555-5555-4555-8555-555555555555";
const USER_UUID = "66666666-6666-4666-8666-666666666666";
const MESSAGE_UUID = "77777777-7777-4777-8777-777777777777";
const DATE = "2026-08-07T10:00:00Z";

const context: WorkspaceRealtimeEventContext = {
  ownerKey: OWNER_KEY,
  owner: {
    accountId: "account-1",
    instanceId: "instance-1",
    organizationId: "organization-1",
    projectId: PROJECT_UUID,
    userUuid: USER_UUID,
    runtimeGeneration: 7,
  },
  surface: "active",
  source: "websocket",
};

function messageDto(
  overrides: Partial<WorkspaceMessengerMessageDto> = {},
): WorkspaceMessengerMessageDto {
  return {
    uuid: MESSAGE_UUID,
    project_id: PROJECT_UUID,
    stream_uuid: STREAM_UUID,
    topic_uuid: TOPIC_UUID,
    author_uuid: USER_UUID,
    payload: { kind: "markdown", content: "hello" },
    user_uuid: USER_UUID,
    read: false,
    pinned: false,
    starred: false,
    is_own: false,
    mentioned: true,
    reactions: {},
    reaction_users: {},
    created_at: DATE,
    updated_at: DATE,
    ...overrides,
  };
}

function streamDto(uuid = STREAM_UUID): WorkspaceMessengerStreamDto {
  return {
    uuid,
    name: "Stream",
    description: "",
    project_id: PROJECT_UUID,
    owner: USER_UUID,
    user_uuid: USER_UUID,
    role: "member",
    notification_mode: "all_messages",
    unread_count: 0,
    active_unread_count: 0,
    passive_unread_count: 0,
    source_name: "native",
    source: { kind: "native" },
    invite_only: false,
    announce: false,
    private: false,
    is_archived: false,
    created_at: DATE,
    updated_at: DATE,
  };
}

function topicDto(uuid = TOPIC_UUID, streamUuid = STREAM_UUID): WorkspaceMessengerTopicDto {
  return {
    uuid,
    project_id: PROJECT_UUID,
    name: "Topic",
    stream_uuid: streamUuid,
    user_uuid: USER_UUID,
    unread_count: 0,
    active_unread_count: 0,
    passive_unread_count: 0,
    is_default: false,
    is_done: false,
    notification_mode: "default",
    created_at: DATE,
    updated_at: DATE,
  };
}

function bootstrap(mentions: readonly ActivityUnreadMention[] = []): void {
  const store = useActivityStore.getState();
  const token = store.startUnreadMentionsBootstrap(OWNER_KEY, context.owner.runtimeGeneration);
  store.finishUnreadMentionsBootstrap(OWNER_KEY, context.owner.runtimeGeneration, token, mentions);
}

afterEach(() => {
  useActivityStore.getState().clear();
});

describe("activity realtime applier", () => {
  it("reconciles message snapshots and treats message.read as a topic boundary", () => {
    bootstrap([
      {
        uuid: "00000000-0000-4000-8000-000000000000",
        streamUuid: STREAM_UUID,
        topicUuid: TOPIC_UUID,
        createdAt: DATE,
      },
      {
        uuid: "message-other-topic",
        streamUuid: STREAM_UUID,
        topicUuid: SECOND_TOPIC_UUID,
        createdAt: DATE,
      },
    ]);
    const applier = createActivityRealtimeApplier();

    applier.applyEvent(
      { epoch_version: 10, type: "message", kind: "message.created", message: messageDto() },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 11,
        type: "message",
        kind: "message.read",
        message: messageDto({ read: true }),
      },
      context,
    );

    expect(useActivityStore.getState()).toMatchObject({
      unreadMentionsCount: 1,
      unreadMentionsByUuid: { "message-other-topic": expect.any(Object) },
    });
  });

  it("applies exact reads, topic reads and stream reads without double counting", () => {
    bootstrap([
      { uuid: MESSAGE_UUID, streamUuid: STREAM_UUID, topicUuid: TOPIC_UUID, createdAt: DATE },
      {
        uuid: "message-topic-2",
        streamUuid: STREAM_UUID,
        topicUuid: SECOND_TOPIC_UUID,
        createdAt: DATE,
      },
      {
        uuid: "message-stream-2",
        streamUuid: SECOND_STREAM_UUID,
        topicUuid: SECOND_TOPIC_UUID,
        createdAt: DATE,
      },
    ]);
    const applier = createActivityRealtimeApplier();

    applier.applyEvent(
      { epoch_version: 20, type: "messages", kind: "messages.read", messageUuids: [MESSAGE_UUID] },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 21,
        type: "topic",
        kind: "topic.read",
        topic: topicDto(SECOND_TOPIC_UUID),
      },
      context,
    );
    applier.applyEvent(
      {
        epoch_version: 22,
        type: "stream",
        kind: "stream.read",
        stream: streamDto(SECOND_STREAM_UUID),
      },
      context,
    );

    expect(useActivityStore.getState()).toMatchObject({
      unreadMentionsCount: 0,
      unreadMentionsByUuid: {},
    });
  });

  it("buffers catch-up events during bootstrap and ignores inactive owners", () => {
    const store = useActivityStore.getState();
    const token = store.startUnreadMentionsBootstrap(OWNER_KEY, context.owner.runtimeGeneration);
    const applier = createActivityRealtimeApplier();

    applier.applyEvent(
      { epoch_version: 30, type: "message", kind: "message.created", message: messageDto() },
      context,
    );
    applier.applyEvent(
      { epoch_version: 31, type: "message", kind: "message.created", message: messageDto() },
      { ...context, surface: "background" },
    );
    store.finishUnreadMentionsBootstrap(OWNER_KEY, context.owner.runtimeGeneration, token, []);

    expect(useActivityStore.getState()).toMatchObject({
      unreadMentionsCount: 1,
      unreadMentionsLastEpochVersion: 30,
    });
  });
});
