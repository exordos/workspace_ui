/** Default Workspace REST JSON bodies for Playwright E2E route mocking. */

export const E2E_ORGANIZATION_ORIGIN = "http://localhost:5173";
export const E2E_ORGANIZATION_ID = "e2e-org";
export const E2E_PROJECT_ID = "11111111-1111-4111-8111-111111111111";
export const E2E_ACCOUNT_ID = "e2e-account";
export const E2E_INSTANCE_ID = "e2e-instance";
export const E2E_USER_UUID = "22222222-2222-4222-8222-222222222222";
export const E2E_STREAM_UUID = "33333333-3333-4333-8333-333333333333";
export const E2E_TOPIC_UUID = "44444444-4444-4444-8444-444444444444";
export const E2E_MESSAGE_UUID = "55555555-5555-4555-8555-555555555555";

const CREATED_AT = "2026-07-16T10:00:00.000Z";

export function serverSettingsSuccess() {
  return {
    result: "success" as const,
    msg: "",
    authentication_methods: {
      password: true,
      email: true,
      dev: false,
      remoteuser: false,
      google: false,
      github: false,
      azuread: false,
      gitlab: false,
      apple: false,
      ldap: false,
      saml: false,
      "openid connect": false,
    },
    push_notifications_enabled: false,
    email_auth_enabled: true,
    require_email_format_usernames: true,
    realm_url: E2E_ORGANIZATION_ORIGIN,
    realm_name: "E2E Workspace",
    realm_icon: "",
    realm_description: "",
    realm_web_public_access_enabled: false,
    meet_url: "",
    external_authentication_methods: [],
    realm_uri: E2E_ORGANIZATION_ORIGIN,
  };
}

export function streamsSuccess() {
  return [
    {
      uuid: E2E_STREAM_UUID,
      name: "General",
      description: "E2E stream",
      project_id: E2E_PROJECT_ID,
      owner: E2E_USER_UUID,
      user_uuid: E2E_USER_UUID,
      role: "owner",
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
      last_message_uuid: E2E_MESSAGE_UUID,
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
    },
  ];
}

export function topicsSuccess() {
  return [
    {
      uuid: E2E_TOPIC_UUID,
      project_id: E2E_PROJECT_ID,
      name: "General",
      stream_uuid: E2E_STREAM_UUID,
      user_uuid: E2E_USER_UUID,
      unread_count: 0,
      active_unread_count: 0,
      passive_unread_count: 0,
      is_default: true,
      is_done: false,
      notification_mode: "default",
      last_message_uuid: E2E_MESSAGE_UUID,
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
    },
  ];
}

export function usersSuccess() {
  return [
    {
      uuid: E2E_USER_UUID,
      username: "e2e-user",
      source: "iam",
      avatar: null,
      status: "active",
      status_emoji: null,
      status_text: null,
      first_name: "E2E",
      last_name: "User",
      email: "e2e@example.test",
      last_ping_at: CREATED_AT,
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
    },
  ];
}

export function messagesSuccess() {
  return [messageSuccess("E2E initial message")];
}

export function messageSuccess(content: string) {
  return {
    uuid: E2E_MESSAGE_UUID,
    project_id: E2E_PROJECT_ID,
    stream_uuid: E2E_STREAM_UUID,
    topic_uuid: E2E_TOPIC_UUID,
    author_uuid: E2E_USER_UUID,
    payload: { kind: "markdown", content },
    user_uuid: E2E_USER_UUID,
    read: true,
    pinned: false,
    starred: false,
    is_own: true,
    reactions: {},
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
  };
}

export function foldersSuccess() {
  return [
    {
      uuid: "e2e-folder-all",
      title: "All",
      project_id: E2E_PROJECT_ID,
      user_uuid: E2E_USER_UUID,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      background_color_value: 0,
      system_type: "all",
      unread_count: 0,
      folder_items: [],
    },
    {
      uuid: "e2e-folder-created",
      title: "Personal",
      project_id: E2E_PROJECT_ID,
      user_uuid: E2E_USER_UUID,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      background_color_value: 0,
      system_type: "created",
      unread_count: 0,
      folder_items: [],
    },
  ];
}

export function folderItemsSuccess() {
  return [];
}

export function servicesSuccess() {
  return [];
}
