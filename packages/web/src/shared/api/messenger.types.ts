export type WorkspaceMessengerUuid = string;
export type WorkspaceMessengerDateTime = string;
export type WorkspaceMessengerEpochVersion = number;
export type WorkspaceMessengerRole = "guest" | "member" | "moderator" | "administrator" | "owner";

// DTO в этом файле повторяют JSON от сервера как есть.
// В UI их не тащим: сначала переводим в доменные типы из entities/messenger.
export type WorkspaceMessengerSourceName = "native" | "zulip";
export type WorkspaceMessengerStreamNotificationMode = "mentions_only" | "muted" | "all_messages";
export type WorkspaceMessengerTopicNotificationMode = "mute" | "default" | "unmute" | "follow";
export type WorkspaceMessengerFolderSystemType = "all" | "created" | "personal" | "channels" | null;
export type WorkspaceMessengerFolderItemChatType = "stream" | "group" | "private";
export type WorkspaceMessengerUserStatus = "active" | "idle" | "offline" | "do_not_disturb";

export interface WorkspaceMessengerNativeSourceDto {
  kind: "native";
}

export interface WorkspaceMessengerZulipSourceDto {
  kind: "zulip";
  stream_id: number;
}

export type WorkspaceMessengerSourceDto =
  | WorkspaceMessengerNativeSourceDto
  | WorkspaceMessengerZulipSourceDto;

export interface WorkspaceMessengerStreamDto {
  uuid: WorkspaceMessengerUuid;
  name: string;
  description: string;
  project_id: WorkspaceMessengerUuid;
  owner: WorkspaceMessengerUuid;
  user_uuid: WorkspaceMessengerUuid;
  role: WorkspaceMessengerRole;
  notification_mode: WorkspaceMessengerStreamNotificationMode;
  unread_count: number;
  source_name: WorkspaceMessengerSourceName;
  source: WorkspaceMessengerSourceDto;
  invite_only: boolean;
  announce: boolean;
  private: boolean;
  is_archived: boolean;
  direct_user_uuid?: WorkspaceMessengerUuid | null;
  last_message_uuid?: WorkspaceMessengerUuid | null;
  created_at: WorkspaceMessengerDateTime;
  updated_at: WorkspaceMessengerDateTime;
}

// A binding is a user's membership record inside a stream.
export interface WorkspaceMessengerStreamBindingDto {
  uuid: WorkspaceMessengerUuid;
  project_id: WorkspaceMessengerUuid;
  stream_uuid: WorkspaceMessengerUuid;
  user_uuid: WorkspaceMessengerUuid;
  who_uuid: WorkspaceMessengerUuid;
  role: WorkspaceMessengerRole;
  notification_mode: WorkspaceMessengerStreamNotificationMode;
  created_at: WorkspaceMessengerDateTime;
  updated_at: WorkspaceMessengerDateTime;
}

export interface WorkspaceMessengerTopicDto {
  uuid: WorkspaceMessengerUuid;
  project_id: WorkspaceMessengerUuid;
  name: string;
  stream_uuid: WorkspaceMessengerUuid;
  user_uuid: WorkspaceMessengerUuid;
  unread_count: number;
  is_default: boolean;
  is_done: boolean;
  notification_mode: WorkspaceMessengerTopicNotificationMode;
  last_message_uuid?: WorkspaceMessengerUuid | null;
  created_at: WorkspaceMessengerDateTime;
  updated_at: WorkspaceMessengerDateTime;
}

export interface WorkspaceMessengerMarkdownPayloadDto {
  kind: "markdown";
  content: string;
}

export interface WorkspaceMessengerMessageDto {
  uuid: WorkspaceMessengerUuid;
  project_id: WorkspaceMessengerUuid;
  stream_uuid: WorkspaceMessengerUuid;
  topic_uuid: WorkspaceMessengerUuid;
  author_uuid: WorkspaceMessengerUuid;
  payload: WorkspaceMessengerMarkdownPayloadDto;
  user_uuid: WorkspaceMessengerUuid;
  read: boolean;
  pinned: boolean;
  starred: boolean;
  is_own: boolean;
  created_at: WorkspaceMessengerDateTime;
  updated_at: WorkspaceMessengerDateTime;
}

export interface WorkspaceMessengerFolderItemDto {
  uuid: WorkspaceMessengerUuid;
  project_id: WorkspaceMessengerUuid;
  folder_uuid?: WorkspaceMessengerUuid;
  folder?: WorkspaceMessengerUuid;
  user_uuid: WorkspaceMessengerUuid;
  stream_uuid: WorkspaceMessengerUuid;
  chat_type: WorkspaceMessengerFolderItemChatType;
  order_index?: number | null;
  pinned_at?: WorkspaceMessengerDateTime | null;
  unread_count: number;
  created_at: WorkspaceMessengerDateTime;
  updated_at: WorkspaceMessengerDateTime;
}

export interface WorkspaceMessengerFolderDto {
  uuid: WorkspaceMessengerUuid;
  project_id?: WorkspaceMessengerUuid;
  user_uuid?: WorkspaceMessengerUuid;
  title: string;
  background_color_value?: number | null;
  unread_count: number;
  system_type: WorkspaceMessengerFolderSystemType;
  folder_items: WorkspaceMessengerFolderItemDto[];
  created_at: WorkspaceMessengerDateTime;
  updated_at: WorkspaceMessengerDateTime;
}

export interface WorkspaceMessengerUserDto {
  uuid: WorkspaceMessengerUuid;
  username: string;
  source: "iam";
  status: WorkspaceMessengerUserStatus;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  last_ping_at: WorkspaceMessengerDateTime | null;
  created_at: WorkspaceMessengerDateTime;
  updated_at: WorkspaceMessengerDateTime;
}

export interface WorkspaceMessengerEpochDto {
  epoch_version: WorkspaceMessengerEpochVersion;
}

export interface WorkspaceMessengerCreateFolderRequestBody {
  title: string;
  background_color_value?: number | null;
}

export interface WorkspaceMessengerUpdateFolderRequestBody {
  title?: string;
  background_color_value?: number | null;
}

export interface WorkspaceMessengerCreateFolderItemRequestBody {
  folder_uuid: WorkspaceMessengerUuid;
  stream_uuid: WorkspaceMessengerUuid;
  chat_type: WorkspaceMessengerFolderItemChatType;
  order_index?: number | null;
}

export interface WorkspaceMessengerUpdateFolderItemRequestBody {
  order_index?: number | null;
}

export interface WorkspaceMessengerCreateStreamRequestBody {
  name: string;
  description: string;
  source_name: WorkspaceMessengerSourceName;
  source: WorkspaceMessengerSourceDto;
  invite_only?: boolean;
  announce?: boolean;
  direct_user_uuid?: WorkspaceMessengerUuid;
}

export interface WorkspaceMessengerUpdateStreamRequestBody {
  name?: string;
  description?: string;
  source_name?: WorkspaceMessengerSourceName;
  source?: WorkspaceMessengerSourceDto;
  invite_only?: boolean;
  announce?: boolean;
}

export interface WorkspaceMessengerStreamNotificationRequestBody {
  notification_mode: WorkspaceMessengerStreamNotificationMode;
}

export type WorkspaceMessengerAddStreamBindingsRequestBody = Partial<
  Record<WorkspaceMessengerRole, WorkspaceMessengerUuid[]>
>;

export interface WorkspaceMessengerCreateStreamBindingRequestBody {
  project_id: WorkspaceMessengerUuid;
  stream_uuid: WorkspaceMessengerUuid;
  user_uuid: WorkspaceMessengerUuid;
  role?: WorkspaceMessengerRole;
  notification_mode?: WorkspaceMessengerStreamNotificationMode;
}

export interface WorkspaceMessengerUpdateStreamBindingRequestBody {
  role?: WorkspaceMessengerRole;
  notification_mode?: WorkspaceMessengerStreamNotificationMode;
}

export interface WorkspaceMessengerCreateTopicRequestBody {
  name: string;
  stream_uuid: WorkspaceMessengerUuid;
}

export interface WorkspaceMessengerUpdateTopicRequestBody {
  name: string;
}

export interface WorkspaceMessengerTopicNotificationRequestBody {
  notification_mode: WorkspaceMessengerTopicNotificationMode;
}

export interface WorkspaceMessengerCreateMessageRequestBody {
  stream_uuid: WorkspaceMessengerUuid;
  topic_uuid: WorkspaceMessengerUuid;
  payload: WorkspaceMessengerMarkdownPayloadDto;
}

export interface WorkspaceMessengerUpdateMessageRequestBody {
  payload: WorkspaceMessengerMarkdownPayloadDto;
}

export interface WorkspaceMessengerStreamDeletedPayloadDto {
  kind: "stream.deleted";
  uuid: WorkspaceMessengerUuid;
}

export interface WorkspaceMessengerStreamBindingsCreatedPayloadDto {
  kind: "stream_bindings.created";
  stream_uuid: WorkspaceMessengerUuid;
  stream_bindings: WorkspaceMessengerStreamBindingDto[];
}

export interface WorkspaceMessengerTopicDeletedPayloadDto {
  kind: "topic.deleted";
  uuid: WorkspaceMessengerUuid;
  stream_uuid: WorkspaceMessengerUuid;
}

export interface WorkspaceMessengerMessageDeletedPayloadDto {
  kind: "message.deleted";
  uuid: WorkspaceMessengerUuid;
  stream_uuid: WorkspaceMessengerUuid;
  topic_uuid: WorkspaceMessengerUuid;
}

export interface WorkspaceMessengerUuidDeletedPayloadDto {
  kind: "folder.deleted" | "folder_item.deleted";
  uuid: WorkspaceMessengerUuid;
}

// REST-события - это долговечные строки серверного outbox для догонки и reconnect.
export type WorkspaceMessengerEventPayloadDto =
  | ({ kind: "stream.created" | "stream.updated" } & WorkspaceMessengerStreamDto)
  | WorkspaceMessengerStreamDeletedPayloadDto
  | WorkspaceMessengerStreamBindingsCreatedPayloadDto
  | ({ kind: "topic.created" | "topic.updated" } & WorkspaceMessengerTopicDto)
  | WorkspaceMessengerTopicDeletedPayloadDto
  | ({ kind: "message.created" | "message.updated" } & WorkspaceMessengerMessageDto)
  | WorkspaceMessengerMessageDeletedPayloadDto
  | ({ kind: "folder.created" | "folder.updated" } & WorkspaceMessengerFolderDto)
  | WorkspaceMessengerUuidDeletedPayloadDto;

export interface WorkspaceMessengerEventDto {
  epoch_version: WorkspaceMessengerEpochVersion;
  uuid: WorkspaceMessengerUuid;
  project_id: WorkspaceMessengerUuid;
  user_uuid: WorkspaceMessengerUuid;
  payload: WorkspaceMessengerEventPayloadDto;
  created_at: WorkspaceMessengerDateTime;
  updated_at: WorkspaceMessengerDateTime;
}

export interface WorkspaceMessengerAuthenticationMethodsDto {
  password: boolean;
  dev: boolean;
  email: boolean;
  ldap: boolean;
  remoteuser: boolean;
  github: boolean;
  azuread: boolean;
  gitlab: boolean;
  google: boolean;
  apple: boolean;
  saml: boolean;
  "openid connect": boolean;
}

export interface WorkspaceMessengerServerSettingsDto {
  result: "success";
  msg: string;
  authentication_methods: WorkspaceMessengerAuthenticationMethodsDto;
  push_notifications_enabled: boolean;
  email_auth_enabled: boolean;
  require_email_format_usernames: boolean;
  realm_url: string;
  realm_name: string;
  realm_icon: string;
  realm_description: string;
  realm_web_public_access_enabled: boolean;
  external_authentication_methods: unknown[];
  realm_uri: string;
  ignored_parameters_unsupported?: string[];
}

// Это уже не REST-модель, а нормализованное realtime-событие.
// Его получают и из REST-догонки, и из WebSocket, чтобы дальше использовать один applier.
export type WorkspaceRealtimeEvent =
  | ({
      epoch_version: WorkspaceMessengerEpochVersion;
      type: "message";
      kind?: "message.updated";
      message: WorkspaceMessengerMessageDto;
    } & Record<string, unknown>)
  | {
      epoch_version: WorkspaceMessengerEpochVersion;
      type: "message";
      kind: "message.deleted";
      message: WorkspaceMessengerMessageDeletedPayloadDtoWithoutKind;
    }
  | {
      epoch_version: WorkspaceMessengerEpochVersion;
      type: "stream";
      kind: "stream.created" | "stream.updated";
      stream: WorkspaceMessengerStreamDto;
    }
  | {
      epoch_version: WorkspaceMessengerEpochVersion;
      type: "stream";
      kind: "stream.deleted";
      stream: { uuid: WorkspaceMessengerUuid };
    }
  | {
      epoch_version: WorkspaceMessengerEpochVersion;
      type: "stream_binding";
      kind: "stream_bindings.created";
      stream_uuid: WorkspaceMessengerUuid;
      stream_bindings: WorkspaceMessengerStreamBindingDto[];
    }
  | {
      epoch_version: WorkspaceMessengerEpochVersion;
      type: "topic";
      kind: "topic.created" | "topic.updated";
      topic: WorkspaceMessengerTopicDto;
    }
  | {
      epoch_version: WorkspaceMessengerEpochVersion;
      type: "topic";
      kind: "topic.deleted";
      topic: { uuid: WorkspaceMessengerUuid; stream_uuid: WorkspaceMessengerUuid };
    }
  | {
      epoch_version: WorkspaceMessengerEpochVersion;
      type: "folder";
      kind: "folder.created" | "folder.updated";
      folder: WorkspaceMessengerFolderDto;
    }
  | {
      epoch_version: WorkspaceMessengerEpochVersion;
      type: "folder";
      kind: "folder.deleted";
      folder: { uuid: WorkspaceMessengerUuid };
    }
  | {
      epoch_version: WorkspaceMessengerEpochVersion;
      type: "folder_item";
      kind: "folder_item.deleted";
      folder_item: { uuid: WorkspaceMessengerUuid };
    };

export interface WorkspaceMessengerMessageDeletedPayloadDtoWithoutKind {
  uuid: WorkspaceMessengerUuid;
  stream_uuid: WorkspaceMessengerUuid;
  topic_uuid: WorkspaceMessengerUuid;
}

export interface WorkspaceMessengerWebSocketHelloFrameDto {
  type: "hello";
  user_uuid: WorkspaceMessengerUuid;
  project_id: WorkspaceMessengerUuid;
  epoch_version: WorkspaceMessengerEpochVersion;
}

export interface WorkspaceMessengerWebSocketConnectedFrameDto {
  // connected - служебное приветствие от шлюза. Оно может дать только epoch_version,
  // поэтому поля owner-а здесь optional и не должны ломать соединение.
  type: "connected";
  user_uuid?: WorkspaceMessengerUuid;
  project_id?: WorkspaceMessengerUuid;
  epoch_version?: WorkspaceMessengerEpochVersion;
}

export interface WorkspaceMessengerWebSocketPingFrameDto {
  // ts optional: часть серверных сборок присылает просто { type: "ping" }.
  // Runtime отвечает тем же JSON pong и не пропускает ping в доменный слой.
  type: "ping";
  ts?: WorkspaceMessengerDateTime;
}

export interface WorkspaceMessengerWebSocketErrorFrameDto {
  type: "error";
  code: string;
  message: string;
}

export interface WorkspaceMessengerWebSocketEventFrameDto {
  type: "event";
  event: WorkspaceRealtimeEvent;
}

export type WorkspaceMessengerWebSocketFrameDto =
  | WorkspaceMessengerWebSocketHelloFrameDto
  | WorkspaceMessengerWebSocketConnectedFrameDto
  | WorkspaceMessengerWebSocketPingFrameDto
  | WorkspaceMessengerWebSocketErrorFrameDto
  | WorkspaceMessengerWebSocketEventFrameDto;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is WorkspaceMessengerUuid {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isNullableUuid(value: unknown): value is WorkspaceMessengerUuid | null {
  return value === null || isUuid(value);
}

function isDateTime(value: unknown): value is WorkspaceMessengerDateTime {
  return typeof value === "string" && value.trim().length > 0;
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return isInteger(value) && value >= 0;
}

function isNullableDateTime(value: unknown): value is WorkspaceMessengerDateTime | null {
  return value === null || isDateTime(value);
}

function isRole(value: unknown): value is WorkspaceMessengerRole {
  return (
    value === "guest" ||
    value === "member" ||
    value === "moderator" ||
    value === "administrator" ||
    value === "owner"
  );
}

function isSourceName(value: unknown): value is WorkspaceMessengerSourceName {
  return value === "native" || value === "zulip";
}

function isStreamNotificationMode(
  value: unknown,
): value is WorkspaceMessengerStreamNotificationMode {
  return value === "mentions_only" || value === "muted" || value === "all_messages";
}

function isTopicNotificationMode(value: unknown): value is WorkspaceMessengerTopicNotificationMode {
  return value === "mute" || value === "default" || value === "unmute" || value === "follow";
}

function isFolderSystemType(value: unknown): value is WorkspaceMessengerFolderSystemType {
  return (
    value === "all" ||
    value === "created" ||
    value === "personal" ||
    value === "channels" ||
    value === null
  );
}

function isFolderItemChatType(value: unknown): value is WorkspaceMessengerFolderItemChatType {
  return value === "stream" || value === "group" || value === "private";
}

function isUserStatus(value: unknown): value is WorkspaceMessengerUserStatus {
  return (
    value === "active" || value === "idle" || value === "offline" || value === "do_not_disturb"
  );
}

function isUuidOnlyDto(value: unknown): value is { uuid: WorkspaceMessengerUuid } {
  return isRecord(value) && isUuid(value.uuid);
}

function isTopicDeleteDto(
  value: unknown,
): value is { uuid: WorkspaceMessengerUuid; stream_uuid: WorkspaceMessengerUuid } {
  return isRecord(value) && isUuid(value.uuid) && isUuid(value.stream_uuid);
}

function isMessageDeleteDto(
  value: unknown,
): value is WorkspaceMessengerMessageDeletedPayloadDtoWithoutKind {
  return (
    isRecord(value) && isUuid(value.uuid) && isUuid(value.stream_uuid) && isUuid(value.topic_uuid)
  );
}

function isOptionalStringArray(value: unknown): value is string[] | undefined {
  return (
    value === undefined || (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}

export function isWorkspaceMessengerSourceDto(
  value: unknown,
): value is WorkspaceMessengerSourceDto {
  return (
    (isRecord(value) && value.kind === "native") ||
    (isRecord(value) && value.kind === "zulip" && isNonNegativeInteger(value.stream_id))
  );
}

export function isWorkspaceMessengerMarkdownPayloadDto(
  value: unknown,
): value is WorkspaceMessengerMarkdownPayloadDto {
  return isRecord(value) && value.kind === "markdown" && typeof value.content === "string";
}

export function isWorkspaceMessengerStreamDto(
  value: unknown,
): value is WorkspaceMessengerStreamDto {
  return (
    isRecord(value) &&
    isUuid(value.uuid) &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    isUuid(value.project_id) &&
    isUuid(value.owner) &&
    isUuid(value.user_uuid) &&
    isRole(value.role) &&
    isStreamNotificationMode(value.notification_mode) &&
    isNonNegativeInteger(value.unread_count) &&
    isSourceName(value.source_name) &&
    isWorkspaceMessengerSourceDto(value.source) &&
    typeof value.invite_only === "boolean" &&
    typeof value.announce === "boolean" &&
    typeof value.private === "boolean" &&
    typeof value.is_archived === "boolean" &&
    (value.direct_user_uuid === undefined || isNullableUuid(value.direct_user_uuid)) &&
    (value.last_message_uuid === undefined || isNullableUuid(value.last_message_uuid)) &&
    isDateTime(value.created_at) &&
    isDateTime(value.updated_at)
  );
}

export function isWorkspaceMessengerStreamBindingDto(
  value: unknown,
): value is WorkspaceMessengerStreamBindingDto {
  return (
    isRecord(value) &&
    isUuid(value.uuid) &&
    isUuid(value.project_id) &&
    isUuid(value.stream_uuid) &&
    isUuid(value.user_uuid) &&
    isUuid(value.who_uuid) &&
    isRole(value.role) &&
    isStreamNotificationMode(value.notification_mode) &&
    isDateTime(value.created_at) &&
    isDateTime(value.updated_at)
  );
}

export function isWorkspaceMessengerTopicDto(value: unknown): value is WorkspaceMessengerTopicDto {
  return (
    isRecord(value) &&
    isUuid(value.uuid) &&
    isUuid(value.project_id) &&
    typeof value.name === "string" &&
    isUuid(value.stream_uuid) &&
    isUuid(value.user_uuid) &&
    isNonNegativeInteger(value.unread_count) &&
    typeof value.is_default === "boolean" &&
    typeof value.is_done === "boolean" &&
    isTopicNotificationMode(value.notification_mode) &&
    (value.last_message_uuid === undefined || isNullableUuid(value.last_message_uuid)) &&
    isDateTime(value.created_at) &&
    isDateTime(value.updated_at)
  );
}

export function isWorkspaceMessengerMessageDto(
  value: unknown,
): value is WorkspaceMessengerMessageDto {
  return (
    isRecord(value) &&
    isUuid(value.uuid) &&
    isUuid(value.project_id) &&
    isUuid(value.stream_uuid) &&
    isUuid(value.topic_uuid) &&
    isUuid(value.author_uuid) &&
    isWorkspaceMessengerMarkdownPayloadDto(value.payload) &&
    isUuid(value.user_uuid) &&
    typeof value.read === "boolean" &&
    typeof value.pinned === "boolean" &&
    typeof value.starred === "boolean" &&
    typeof value.is_own === "boolean" &&
    isDateTime(value.created_at) &&
    isDateTime(value.updated_at)
  );
}

export function isWorkspaceMessengerFolderItemDto(
  value: unknown,
): value is WorkspaceMessengerFolderItemDto {
  return (
    isRecord(value) &&
    isUuid(value.uuid) &&
    isUuid(value.project_id) &&
    (isUuid(value.folder_uuid) || isUuid(value.folder)) &&
    isUuid(value.user_uuid) &&
    isUuid(value.stream_uuid) &&
    isFolderItemChatType(value.chat_type) &&
    (value.order_index === undefined ||
      value.order_index === null ||
      isNonNegativeInteger(value.order_index)) &&
    (value.pinned_at === undefined || isNullableDateTime(value.pinned_at)) &&
    isNonNegativeInteger(value.unread_count) &&
    isDateTime(value.created_at) &&
    isDateTime(value.updated_at)
  );
}

export function isWorkspaceMessengerFolderDto(
  value: unknown,
): value is WorkspaceMessengerFolderDto {
  return (
    isRecord(value) &&
    isUuid(value.uuid) &&
    (value.project_id === undefined || isUuid(value.project_id)) &&
    (value.user_uuid === undefined || isUuid(value.user_uuid)) &&
    typeof value.title === "string" &&
    (value.background_color_value === undefined ||
      value.background_color_value === null ||
      isNonNegativeInteger(value.background_color_value)) &&
    isNonNegativeInteger(value.unread_count) &&
    isFolderSystemType(value.system_type) &&
    Array.isArray(value.folder_items) &&
    value.folder_items.every(isWorkspaceMessengerFolderItemDto) &&
    isDateTime(value.created_at) &&
    isDateTime(value.updated_at)
  );
}

export function isWorkspaceMessengerUserDto(value: unknown): value is WorkspaceMessengerUserDto {
  return (
    isRecord(value) &&
    isUuid(value.uuid) &&
    typeof value.username === "string" &&
    value.source === "iam" &&
    isUserStatus(value.status) &&
    (value.first_name === null || typeof value.first_name === "string") &&
    (value.last_name === null || typeof value.last_name === "string") &&
    (value.email === null || typeof value.email === "string") &&
    isNullableDateTime(value.last_ping_at) &&
    isDateTime(value.created_at) &&
    isDateTime(value.updated_at)
  );
}

export function isWorkspaceMessengerEpochDto(value: unknown): value is WorkspaceMessengerEpochDto {
  return isRecord(value) && isNonNegativeInteger(value.epoch_version);
}

export function isWorkspaceMessengerEventPayloadDto(
  value: unknown,
): value is WorkspaceMessengerEventPayloadDto {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return false;
  }

  switch (value.kind) {
    case "stream.created":
    case "stream.updated":
      return isWorkspaceMessengerStreamDto(value);
    case "stream.deleted":
      return isUuid(value.uuid);
    case "stream_bindings.created":
      return (
        isUuid(value.stream_uuid) &&
        Array.isArray(value.stream_bindings) &&
        value.stream_bindings.every(isWorkspaceMessengerStreamBindingDto)
      );
    case "topic.created":
    case "topic.updated":
      return isWorkspaceMessengerTopicDto(value);
    case "topic.deleted":
      return isUuid(value.uuid) && isUuid(value.stream_uuid);
    case "message.created":
    case "message.updated":
      return isWorkspaceMessengerMessageDto(value);
    case "message.deleted":
      return isUuid(value.uuid) && isUuid(value.stream_uuid) && isUuid(value.topic_uuid);
    case "folder.created":
    case "folder.updated":
      return isWorkspaceMessengerFolderDto(value);
    case "folder.deleted":
    case "folder_item.deleted":
      return isUuid(value.uuid);
    default:
      return false;
  }
}

export function isWorkspaceMessengerEventDto(value: unknown): value is WorkspaceMessengerEventDto {
  return (
    isRecord(value) &&
    isNonNegativeInteger(value.epoch_version) &&
    isUuid(value.uuid) &&
    isUuid(value.project_id) &&
    isUuid(value.user_uuid) &&
    isWorkspaceMessengerEventPayloadDto(value.payload) &&
    isDateTime(value.created_at) &&
    isDateTime(value.updated_at)
  );
}

export function isWorkspaceMessengerAuthenticationMethodsDto(
  value: unknown,
): value is WorkspaceMessengerAuthenticationMethodsDto {
  return (
    isRecord(value) &&
    typeof value.password === "boolean" &&
    typeof value.dev === "boolean" &&
    typeof value.email === "boolean" &&
    typeof value.ldap === "boolean" &&
    typeof value.remoteuser === "boolean" &&
    typeof value.github === "boolean" &&
    typeof value.azuread === "boolean" &&
    typeof value.gitlab === "boolean" &&
    typeof value.google === "boolean" &&
    typeof value.apple === "boolean" &&
    typeof value.saml === "boolean" &&
    typeof value["openid connect"] === "boolean"
  );
}

export function isWorkspaceMessengerServerSettingsDto(
  value: unknown,
): value is WorkspaceMessengerServerSettingsDto {
  return (
    isRecord(value) &&
    value.result === "success" &&
    typeof value.msg === "string" &&
    isWorkspaceMessengerAuthenticationMethodsDto(value.authentication_methods) &&
    typeof value.push_notifications_enabled === "boolean" &&
    typeof value.email_auth_enabled === "boolean" &&
    typeof value.require_email_format_usernames === "boolean" &&
    typeof value.realm_url === "string" &&
    typeof value.realm_name === "string" &&
    typeof value.realm_icon === "string" &&
    typeof value.realm_description === "string" &&
    typeof value.realm_web_public_access_enabled === "boolean" &&
    Array.isArray(value.external_authentication_methods) &&
    typeof value.realm_uri === "string" &&
    isOptionalStringArray(value.ignored_parameters_unsupported)
  );
}

export function isWorkspaceRealtimeEvent(value: unknown): value is WorkspaceRealtimeEvent {
  if (!isRecord(value) || !isNonNegativeInteger(value.epoch_version)) {
    return false;
  }

  switch (value.type) {
    case "message":
      return value.kind === "message.deleted"
        ? isMessageDeleteDto(value.message)
        : (value.kind === undefined || value.kind === "message.updated") &&
            isWorkspaceMessengerMessageDto(value.message);
    case "stream":
      return value.kind === "stream.deleted"
        ? isUuidOnlyDto(value.stream)
        : (value.kind === "stream.created" || value.kind === "stream.updated") &&
            isWorkspaceMessengerStreamDto(value.stream);
    case "stream_binding":
      return (
        value.kind === "stream_bindings.created" &&
        isUuid(value.stream_uuid) &&
        Array.isArray(value.stream_bindings) &&
        value.stream_bindings.every(isWorkspaceMessengerStreamBindingDto)
      );
    case "topic":
      return value.kind === "topic.deleted"
        ? isTopicDeleteDto(value.topic)
        : (value.kind === "topic.created" || value.kind === "topic.updated") &&
            isWorkspaceMessengerTopicDto(value.topic);
    case "folder":
      return value.kind === "folder.deleted"
        ? isUuidOnlyDto(value.folder)
        : (value.kind === "folder.created" || value.kind === "folder.updated") &&
            isWorkspaceMessengerFolderDto(value.folder);
    case "folder_item":
      return value.kind === "folder_item.deleted" && isUuidOnlyDto(value.folder_item);
    default:
      return false;
  }
}

export function isWorkspaceMessengerWebSocketFrameDto(
  value: unknown,
): value is WorkspaceMessengerWebSocketFrameDto {
  if (!isRecord(value)) {
    return false;
  }

  switch (value.type) {
    case "hello":
      return (
        isUuid(value.user_uuid) &&
        isUuid(value.project_id) &&
        isNonNegativeInteger(value.epoch_version)
      );
    case "connected":
      return (
        (value.user_uuid === undefined || isUuid(value.user_uuid)) &&
        (value.project_id === undefined || isUuid(value.project_id)) &&
        (value.epoch_version === undefined || isNonNegativeInteger(value.epoch_version))
      );
    case "ping":
      return value.ts === undefined || isDateTime(value.ts);
    case "error":
      return typeof value.code === "string" && typeof value.message === "string";
    case "event":
      return isWorkspaceRealtimeEvent(value.event);
    default:
      return false;
  }
}
