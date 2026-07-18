/**
 * Default Messenger API JSON bodies for Playwright E2E route mocking.
 */

export const E2E_REALM = "https://messenger.test.local";
export const E2E_INSTANCE_ID = "test-1";
export const E2E_EMAIL = "test@example.com";
export const E2E_USER_ID = 1;
export const E2E_PROJECT_ID = "fe02e55d-4548-4b3e-a175-fcae928f41b2";
export const E2E_USER_UUID = "22222222-2222-4222-8222-222222222222";
export const E2E_OTHER_USER_UUID = "22222222-2222-4222-8222-222222222223";
export const E2E_STREAM_UUID = "33333333-3333-4333-8333-333333333333";
export const E2E_TOPIC_UUID = "44444444-4444-4444-8444-444444444444";
export const E2E_MESSAGE_UUID = "55555555-5555-4555-8555-555555555555";
export const E2E_STREAM_BINDING_UUID = "66666666-6666-4666-8666-666666666666";

const CREATED_AT = "2026-07-16T10:00:00.000Z";

let queueIdSeq = 0;

export function resetE2eQueueIdSequence(): void {
  queueIdSeq = 0;
}

export function nextE2eQueueId(): string {
  queueIdSeq += 1;
  return `e2e-queue-${queueIdSeq}`;
}

export function usersMeSuccess() {
  return {
    result: "success",
    user_id: E2E_USER_ID,
    full_name: "Test User",
    email: E2E_EMAIL,
  };
}

export function serverSettingsSuccess() {
  return {
    realm_name: "E2E Workspace",
    realm_uri: E2E_REALM,
    realm_url: E2E_REALM,
    realm_icon: "",
    external_authentication_methods: [],
  };
}

export function usersSuccess() {
  return {
    result: "success",
    members: [
      {
        user_id: E2E_USER_ID,
        full_name: "Test User",
        email: E2E_EMAIL,
        avatar_url: null,
        is_bot: false,
        is_active: true,
      },
      {
        user_id: 2,
        full_name: "Other User",
        email: "other@example.com",
        avatar_url: null,
        is_bot: false,
        is_active: true,
      },
    ],
  };
}

export function subscriptionsSuccess() {
  return {
    result: "success",
    subscriptions: [
      {
        stream_id: 10,
        name: "general",
        description: "General",
        is_muted: false,
        desktop_notifications: false,
        audible_notifications: false,
        is_archived: false,
        in_home_view: true,
      },
    ],
  };
}

export function registerSuccess(queueId?: string) {
  return {
    result: "success",
    queue_id: queueId ?? nextE2eQueueId(),
    last_event_id: -1,
    event_queue_longpoll_timeout_seconds: 90,
    subscriptions: [],
  };
}

export function eventsSuccess() {
  return {
    result: "success",
    events: [] as unknown[],
  };
}

export function messagesSuccess() {
  return [] as unknown[];
}

/** Canonical event catch-up row used to verify reconnect sidebar refresh. */
export function reconnectSidebarDeltaEvents() {
  return [
    {
      schema_version: 1,
      uuid: "77777777-7777-4777-8777-777777777777",
      epoch_version: 1,
      project_id: E2E_PROJECT_ID,
      user_uuid: E2E_USER_UUID,
      object_type: "message",
      action: "created",
      created_at: "2026-07-16T10:01:00.000Z",
      updated_at: "2026-07-16T10:01:00.000Z",
      payload: {
        kind: "message.created",
        uuid: "55555555-5555-4555-8555-555555555556",
        stream_uuid: E2E_STREAM_UUID,
        topic_uuid: E2E_TOPIC_UUID,
        author_uuid: E2E_OTHER_USER_UUID,
        payload: { kind: "markdown", content: "After reconnect sidebar" },
        is_own: false,
        read: true,
        pinned: false,
        starred: false,
        reactions: {},
        created_at: "2026-07-16T10:01:00.000Z",
        updated_at: "2026-07-16T10:01:00.000Z",
      },
    },
  ];
}

/** Canonical unread message event used to verify sidebar realtime projection. */
export function unreadSidebarDeltaEvents() {
  return [
    {
      schema_version: 1,
      uuid: "77777777-7777-4777-8777-777777777778",
      epoch_version: 1,
      project_id: E2E_PROJECT_ID,
      user_uuid: E2E_USER_UUID,
      object_type: "message",
      action: "created",
      created_at: "2026-07-16T10:02:00.000Z",
      updated_at: "2026-07-16T10:02:00.000Z",
      payload: {
        kind: "message.created",
        uuid: "55555555-5555-4555-8555-555555555557",
        stream_uuid: E2E_STREAM_UUID,
        topic_uuid: E2E_TOPIC_UUID,
        author_uuid: E2E_OTHER_USER_UUID,
        payload: { kind: "markdown", content: "Unread from E2E" },
        is_own: false,
        read: false,
        pinned: false,
        starred: false,
        reactions: {},
        created_at: "2026-07-16T10:02:00.000Z",
        updated_at: "2026-07-16T10:02:00.000Z",
      },
    },
    {
      schema_version: 1,
      uuid: "77777777-7777-4777-8777-777777777779",
      epoch_version: 2,
      project_id: E2E_PROJECT_ID,
      user_uuid: E2E_USER_UUID,
      object_type: "stream",
      action: "updated",
      created_at: "2026-07-16T10:02:00.000Z",
      updated_at: "2026-07-16T10:02:00.000Z",
      payload: {
        kind: "stream.updated",
        uuid: E2E_STREAM_UUID,
        name: "general",
        unread_count: 1,
      },
    },
    {
      schema_version: 1,
      uuid: "77777777-7777-4777-8777-777777777780",
      epoch_version: 3,
      project_id: E2E_PROJECT_ID,
      user_uuid: E2E_USER_UUID,
      object_type: "topic",
      action: "updated",
      created_at: "2026-07-16T10:02:00.000Z",
      updated_at: "2026-07-16T10:02:00.000Z",
      payload: {
        kind: "topic.updated",
        uuid: E2E_TOPIC_UUID,
        stream_uuid: E2E_STREAM_UUID,
        name: "general",
        unread_count: 1,
      },
    },
  ];
}

export function workspaceUsersSuccess() {
  return [
    {
      uuid: E2E_USER_UUID,
      username: "test",
      status: "active",
      first_name: "Test",
      last_name: "User",
      email: E2E_EMAIL,
      avatar: null,
      last_ping_at: CREATED_AT,
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
    },
    {
      uuid: E2E_OTHER_USER_UUID,
      username: "other",
      status: "active",
      first_name: "Other",
      last_name: "User",
      email: "other@example.com",
      avatar: null,
      last_ping_at: CREATED_AT,
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
    },
  ];
}

export function workspaceStreamsSuccess() {
  return [
    {
      uuid: E2E_STREAM_UUID,
      name: "general",
      description: "General",
      project_id: E2E_PROJECT_ID,
      owner: E2E_USER_UUID,
      user_uuid: E2E_USER_UUID,
      default_topic_uuid: E2E_TOPIC_UUID,
      source_name: "native",
      source: { kind: "native" },
      invite_only: false,
      announce: false,
      private: false,
      is_archived: false,
      unread_count: 0,
      notification_mode: "all_messages",
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
    },
  ];
}

export function workspaceTopicsSuccess() {
  return [
    {
      uuid: E2E_TOPIC_UUID,
      name: "general",
      stream_uuid: E2E_STREAM_UUID,
      project_id: E2E_PROJECT_ID,
      user_uuid: E2E_USER_UUID,
      source_name: "native",
      source: { kind: "native" },
      unread_count: 0,
      is_default: true,
      is_done: false,
      notification_mode: "default",
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
    },
  ];
}

export function workspaceStreamBindingsSuccess() {
  return [
    {
      uuid: E2E_STREAM_BINDING_UUID,
      stream_uuid: E2E_STREAM_UUID,
      user_uuid: E2E_USER_UUID,
      role: "owner",
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
    },
  ];
}

export function flagsSuccess() {
  return {
    result: "success",
    messages: [] as unknown[],
  };
}

export function genericSuccess() {
  return { result: "success" };
}

export function badEventQueueIdError(queueId = "e2e-queue-stale") {
  return {
    result: "error",
    code: "BAD_EVENT_QUEUE_ID",
    msg: "Bad event queue id",
    queue_id: queueId,
  };
}
