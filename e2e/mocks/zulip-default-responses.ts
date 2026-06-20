/**
 * Default Zulip API JSON bodies for Playwright E2E route mocking.
 */

export const E2E_REALM = "https://zulip.test.local";
export const E2E_INSTANCE_ID = "test-1";
export const E2E_EMAIL = "test@example.com";
export const E2E_USER_ID = 1;

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
    realm_name: "E2E Zulip",
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
  return {
    result: "success",
    messages: [] as unknown[],
    found_oldest: true,
    found_newest: true,
  };
}

/** Delta after anchor 100 for reconnect E2E (stream general). */
export function reconnectSidebarDeltaMessages() {
  return {
    result: "success",
    messages: [
      {
        id: 101,
        sender_id: 1,
        sender_full_name: "E2E User",
        type: "stream",
        stream_id: 10,
        subject: "general",
        topic: "general",
        content: "<p>After reconnect sidebar</p>",
        timestamp: 1_700_000_100,
        flags: [],
        is_outgoing: false,
      },
    ],
    found_oldest: true,
    found_newest: true,
  };
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
