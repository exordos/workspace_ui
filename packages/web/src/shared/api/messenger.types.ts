import {
  isWorkspaceExternalAccountDto,
  type WorkspaceExternalAccountDto,
} from "./messenger-external-accounts.types";
import {
  isWorkspaceExternalChatDto,
  type WorkspaceExternalChatDto,
} from "./messenger-external-chats.types";

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
  server_url?: string | null;
  topic_name?: string | null;
  message_id?: number | null;
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
  color?: number | null;
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
  color?: number | null;
  last_message_uuid?: WorkspaceMessengerUuid | null;
  created_at: WorkspaceMessengerDateTime;
  updated_at: WorkspaceMessengerDateTime;
}

export interface WorkspaceMessengerMarkdownPayloadDto {
  kind: "markdown";
  content: string;
}

// Keep the backend payload envelope extensible. The current Workspace API
// supports markdown only, but new message kinds must be added here explicitly.
export type WorkspaceMessengerMessagePayloadDto = WorkspaceMessengerMarkdownPayloadDto;

export type WorkspaceMessengerDeliveryClass = "live" | "backfill";

export interface WorkspaceMessengerProviderDto {
  kind: "zulip";
  account_uuid: WorkspaceMessengerUuid;
  external_id: string | null;
  capabilities: Record<string, unknown>;
  delivery_class?: WorkspaceMessengerDeliveryClass;
  notification_eligible?: boolean;
}

export type WorkspaceMessengerDeliveryStatus =
  | "pending"
  | "delivered"
  | "failed"
  | "manual_reconciliation_required"
  | "discarded";

export interface WorkspaceMessengerDeliveryDto {
  external_operation_uuid?: WorkspaceMessengerUuid | null;
  status?: WorkspaceMessengerDeliveryStatus;
  safe_error?: string | null;
  can_retry?: boolean;
  can_discard?: boolean;
  duplicate_risk?: boolean;
  retry_requires_confirmation?: boolean;
  original_url?: string | null;
  reconciliation_reason?: string | null;
  updated_at?: WorkspaceMessengerDateTime | null;
}

export interface WorkspaceMessengerDraftDto {
  uuid: WorkspaceMessengerUuid;
  project_id: WorkspaceMessengerUuid;
  user_uuid: WorkspaceMessengerUuid;
  stream_uuid: WorkspaceMessengerUuid;
  topic_uuid: WorkspaceMessengerUuid;
  payload: WorkspaceMessengerMarkdownPayloadDto;
  revision: number;
  created_at: WorkspaceMessengerDateTime;
  updated_at: WorkspaceMessengerDateTime;
}

export interface WorkspaceMessengerCreateDraftRequestBody {
  uuid: WorkspaceMessengerUuid;
  stream_uuid: WorkspaceMessengerUuid;
  topic_uuid: WorkspaceMessengerUuid;
  payload: WorkspaceMessengerMarkdownPayloadDto;
}

export interface WorkspaceMessengerUpdateDraftRequestBody {
  payload: WorkspaceMessengerMarkdownPayloadDto;
}

// Aggregate хранит только серверные счетчики по имени emoji.
// Здесь намеренно нет списка пользователей, reaction_type, emoji_code или numeric user id:
// Workspace API пока отдает только имя emoji и количество, а недостающие сведения нельзя
// достраивать на фронтенде без риска получить ложную доменную модель.
export type WorkspaceMessengerReactionAggregate = Record<string, number>;

// DTO одной строки реакции нужен для операций текущего пользователя.
// Счетчики приходят в message.reactions, а uuid конкретной реакции нужен только для DELETE,
// поэтому строка реакции описана отдельно от агрегата сообщения.
export interface WorkspaceMessengerMessageReactionDto {
  uuid: WorkspaceMessengerUuid;
  project_id: WorkspaceMessengerUuid;
  message_uuid: WorkspaceMessengerUuid;
  user_uuid: WorkspaceMessengerUuid;
  emoji_name: string;
  created_at: WorkspaceMessengerDateTime;
  updated_at: WorkspaceMessengerDateTime;
}

export interface WorkspaceMessengerMessageReactionEventPayloadDto {
  kind: "message_reaction.created" | "message_reaction.updated" | "message_reaction.deleted";
  uuid: WorkspaceMessengerUuid;
  project_id: WorkspaceMessengerUuid;
  message_uuid: WorkspaceMessengerUuid;
  user_uuid: WorkspaceMessengerUuid;
  emoji_name: string;
  source_name: WorkspaceMessengerSourceName;
  source: WorkspaceMessengerSourceDto;
  old_message_uuid?: WorkspaceMessengerUuid | null;
  old_emoji_name?: string | null;
  old_source_name?: WorkspaceMessengerSourceName | null;
  old_source?: WorkspaceMessengerSourceDto | null;
}

export interface WorkspaceMessengerMessagesReadPayloadDto {
  kind: "messages.read";
  project_id: WorkspaceMessengerUuid;
  message_uuids: WorkspaceMessengerUuid[];
}

export interface WorkspaceMessengerMessageDto {
  uuid: WorkspaceMessengerUuid;
  project_id: WorkspaceMessengerUuid;
  stream_uuid: WorkspaceMessengerUuid;
  topic_uuid: WorkspaceMessengerUuid;
  author_uuid: WorkspaceMessengerUuid;
  payload: WorkspaceMessengerMessagePayloadDto;
  user_uuid: WorkspaceMessengerUuid;
  read: boolean;
  pinned: boolean;
  starred: boolean;
  is_own: boolean;
  // The fields below stay optional for snapshots created before provenance became public.
  mentioned?: boolean;
  source_name?: WorkspaceMessengerSourceName;
  source?: WorkspaceMessengerSourceDto;
  provider?: WorkspaceMessengerProviderDto | null;
  delivery?: WorkspaceMessengerDeliveryDto | null;
  reactions: WorkspaceMessengerReactionAggregate;
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
  source: "iam" | "zulip";
  avatar?: string | null;
  status: WorkspaceMessengerUserStatus;
  status_emoji?: string | null;
  status_text?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  last_ping_at: WorkspaceMessengerDateTime;
  created_at: WorkspaceMessengerDateTime;
  updated_at: WorkspaceMessengerDateTime;
}

export interface WorkspaceMessengerEpochDto {
  epoch_version: WorkspaceMessengerEpochVersion;
  epoch_generation: string;
  current_epoch_version: WorkspaceMessengerEpochVersion;
  minimum_epoch_version: WorkspaceMessengerEpochVersion;
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
  payload: WorkspaceMessengerMessagePayloadDto;
}

export interface WorkspaceMessengerUpdateMessageRequestBody {
  payload: WorkspaceMessengerMessagePayloadDto;
}

// Создание реакции принимает ровно тот контракт, который поддерживает Workspace backend.
// Пользователь берется из bearer-сессии на сервере, поэтому user_uuid не передаем в body.
export interface WorkspaceMessengerCreateMessageReactionRequestBody {
  message_uuid: WorkspaceMessengerUuid;
  emoji_name: string;
}

export interface WorkspaceMessengerStreamDeletedPayloadDto {
  kind: "stream.deleted";
  uuid: WorkspaceMessengerUuid;
}

export interface WorkspaceMessengerStreamBindingsCreatedPayloadDto {
  kind: "stream_bindings.created";
  uuid: WorkspaceMessengerUuid;
  items: WorkspaceMessengerStreamBindingDto[];
}

export type WorkspaceMessengerStreamBindingUpdatedPayloadDto = {
  kind: "stream_binding.updated";
} & WorkspaceMessengerStreamBindingDto;

export interface WorkspaceMessengerStreamBindingDeletedPayloadDto {
  kind: "stream_binding.deleted";
  uuid: WorkspaceMessengerUuid;
  stream_uuid: WorkspaceMessengerUuid;
  user_uuid: WorkspaceMessengerUuid;
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

export interface WorkspaceMessengerFileDto {
  uuid: WorkspaceMessengerUuid;
  project_id: WorkspaceMessengerUuid;
  user_uuid: WorkspaceMessengerUuid;
  stream_uuid: WorkspaceMessengerUuid | null;
  name: string;
  description: string;
  content_type: string;
  size_bytes: number;
  hash: string;
  created_at: WorkspaceMessengerDateTime;
  updated_at: WorkspaceMessengerDateTime;
}

export type WorkspaceMessengerFileCreatedOrUpdatedPayloadDto = {
  kind: "file.created" | "file.updated";
} & WorkspaceMessengerFileDto;

export interface WorkspaceMessengerFileDeletedPayloadDto {
  kind: "file.deleted";
  uuid: WorkspaceMessengerUuid;
  stream_uuid: WorkspaceMessengerUuid | null;
}

export type WorkspaceMessengerUserUpdatedPayloadDto = {
  kind: "user.updated";
} & WorkspaceMessengerUserDto;

export interface WorkspaceMessengerExternalAccountEventPayloadDto {
  kind: "external_account.created" | "external_account.updated" | "external_account.deleted";
  uuid: WorkspaceMessengerUuid;
  snapshot: WorkspaceExternalAccountDto;
}

export interface WorkspaceMessengerExternalChatEventPayloadDto {
  kind: "external_chat.created" | "external_chat.updated" | "external_chat.deleted";
  uuid: WorkspaceMessengerUuid;
  snapshot: WorkspaceExternalChatDto;
}

// REST-события - это долговечные строки серверного outbox для догонки и reconnect.
export type WorkspaceMessengerEventPayloadDto =
  | ({ kind: "stream.created" | "stream.updated" | "stream.read" } & WorkspaceMessengerStreamDto)
  | WorkspaceMessengerStreamDeletedPayloadDto
  | WorkspaceMessengerStreamBindingsCreatedPayloadDto
  | WorkspaceMessengerStreamBindingUpdatedPayloadDto
  | WorkspaceMessengerStreamBindingDeletedPayloadDto
  | ({ kind: "topic.created" | "topic.updated" | "topic.read" } & WorkspaceMessengerTopicDto)
  | WorkspaceMessengerTopicDeletedPayloadDto
  | ({
      kind: "message.created" | "message.updated" | "message.read";
    } & WorkspaceMessengerMessageDto)
  | WorkspaceMessengerMessagesReadPayloadDto
  | WorkspaceMessengerMessageDeletedPayloadDto
  | WorkspaceMessengerMessageReactionEventPayloadDto
  | ({ kind: "folder.created" | "folder.updated" } & WorkspaceMessengerFolderDto)
  | WorkspaceMessengerUuidDeletedPayloadDto
  | WorkspaceMessengerFileCreatedOrUpdatedPayloadDto
  | WorkspaceMessengerFileDeletedPayloadDto
  | WorkspaceMessengerUserUpdatedPayloadDto
  | WorkspaceMessengerExternalAccountEventPayloadDto
  | WorkspaceMessengerExternalChatEventPayloadDto;

export type WorkspaceMessengerEventObjectType =
  | "message"
  | "message_reaction"
  | "stream"
  | "stream_binding"
  | "topic"
  | "user"
  | "folder"
  | "folder_item"
  | "file"
  | "external_account"
  | "external_chat";

export type WorkspaceMessengerEventAction = "created" | "updated" | "deleted" | "read";

export interface WorkspaceMessengerEventDto {
  schema_version: 1;
  epoch_version: WorkspaceMessengerEpochVersion;
  uuid: WorkspaceMessengerUuid;
  project_id: WorkspaceMessengerUuid;
  user_uuid: WorkspaceMessengerUuid;
  object_type: WorkspaceMessengerEventObjectType;
  action: WorkspaceMessengerEventAction;
  payload: WorkspaceMessengerEventPayloadDto;
  created_at: WorkspaceMessengerDateTime;
  updated_at: WorkspaceMessengerDateTime;
}

export type WorkspaceMessengerRawEventPayloadDto = {
  kind: string;
} & Record<string, unknown>;

export interface WorkspaceMessengerRawEventDto {
  schema_version: number;
  epoch_version: WorkspaceMessengerEpochVersion;
  uuid: WorkspaceMessengerUuid;
  project_id: WorkspaceMessengerUuid;
  user_uuid: WorkspaceMessengerUuid;
  object_type: string;
  action: string;
  payload: WorkspaceMessengerRawEventPayloadDto;
  created_at: WorkspaceMessengerDateTime;
  updated_at: WorkspaceMessengerDateTime;
}

export type WorkspaceMessengerRealtimeEventDto =
  | WorkspaceMessengerEventDto
  | WorkspaceMessengerRawEventDto;

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
  meet_url: string;
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
      type: "stream_binding";
      kind: "stream_binding.updated";
      stream_binding: WorkspaceMessengerStreamBindingDto;
    }
  | {
      epoch_version: WorkspaceMessengerEpochVersion;
      type: "stream_binding";
      kind: "stream_binding.deleted";
      stream_binding: {
        uuid: WorkspaceMessengerUuid;
        stream_uuid: WorkspaceMessengerUuid;
        user_uuid: WorkspaceMessengerUuid;
      };
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
    }
  | {
      epoch_version: WorkspaceMessengerEpochVersion;
      type: "file";
      kind: "file.created" | "file.updated";
      file: WorkspaceMessengerFileDto;
    }
  | {
      epoch_version: WorkspaceMessengerEpochVersion;
      type: "file";
      kind: "file.deleted";
      file: { uuid: WorkspaceMessengerUuid; stream_uuid: WorkspaceMessengerUuid | null };
    }
  | {
      epoch_version: WorkspaceMessengerEpochVersion;
      type: "user";
      kind: "user.updated";
      user: WorkspaceMessengerUserDto;
    }
  | {
      epoch_version: WorkspaceMessengerEpochVersion;
      type: "external_account";
      kind: "external_account.created" | "external_account.updated" | "external_account.deleted";
      external_account: WorkspaceExternalAccountDto;
    }
  | {
      epoch_version: WorkspaceMessengerEpochVersion;
      type: "external_chat";
      kind: "external_chat.created" | "external_chat.updated" | "external_chat.deleted";
      external_chat: WorkspaceExternalChatDto;
    };

export interface WorkspaceMessengerMessageDeletedPayloadDtoWithoutKind {
  uuid: WorkspaceMessengerUuid;
  stream_uuid: WorkspaceMessengerUuid;
  topic_uuid: WorkspaceMessengerUuid;
}

export interface WorkspaceMessengerWebSocketReadyFrameDto {
  type: "ready";
  epoch_generation: string;
  epoch_version: WorkspaceMessengerEpochVersion;
}

export interface WorkspaceMessengerWebSocketErrorFrameDto {
  type: "error";
  code: 410;
  error: "epoch_pruned";
  message: string;
  reason: string;
  epoch_generation: string;
  current_epoch_version: WorkspaceMessengerEpochVersion;
  minimum_epoch_version: WorkspaceMessengerEpochVersion;
}

export interface WorkspaceEventsCursorExpiredErrorDto {
  type: "EventsCursorExpiredError";
  code: 410;
  error: "epoch_pruned";
  message: string;
  reason: string;
  epoch_generation: string;
  current_epoch_version: WorkspaceMessengerEpochVersion;
  minimum_epoch_version: WorkspaceMessengerEpochVersion;
}

export type WorkspaceMessengerWebSocketFrameDto =
  | WorkspaceMessengerRealtimeEventDto
  | WorkspaceMessengerWebSocketReadyFrameDto
  | WorkspaceMessengerWebSocketErrorFrameDto;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
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

function isDeliveryClass(value: unknown): value is WorkspaceMessengerDeliveryClass {
  return value === "live" || value === "backfill";
}

function isDeliveryStatus(value: unknown): value is WorkspaceMessengerDeliveryStatus {
  return (
    value === "pending" ||
    value === "delivered" ||
    value === "failed" ||
    value === "manual_reconciliation_required" ||
    value === "discarded"
  );
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

function isWorkspaceMessengerEventObjectType(
  value: unknown,
): value is WorkspaceMessengerEventObjectType {
  return (
    value === "message" ||
    value === "message_reaction" ||
    value === "stream" ||
    value === "stream_binding" ||
    value === "topic" ||
    value === "user" ||
    value === "folder" ||
    value === "folder_item" ||
    value === "file" ||
    value === "external_account" ||
    value === "external_chat"
  );
}

function isWorkspaceMessengerEventAction(value: unknown): value is WorkspaceMessengerEventAction {
  return value === "created" || value === "updated" || value === "deleted" || value === "read";
}

function expectedWorkspaceMessengerEventMetadata(payloadKind: string): {
  objectType: WorkspaceMessengerEventObjectType;
  action: WorkspaceMessengerEventAction;
} | null {
  switch (payloadKind) {
    case "message.created":
      return { objectType: "message", action: "created" };
    case "message.updated":
      return { objectType: "message", action: "updated" };
    case "message.deleted":
      return { objectType: "message", action: "deleted" };
    case "message.read":
    case "messages.read":
      return { objectType: "message", action: "read" };
    case "message_reaction.created":
      return { objectType: "message_reaction", action: "created" };
    case "message_reaction.updated":
      return { objectType: "message_reaction", action: "updated" };
    case "message_reaction.deleted":
      return { objectType: "message_reaction", action: "deleted" };
    case "stream.created":
      return { objectType: "stream", action: "created" };
    case "stream.updated":
      return { objectType: "stream", action: "updated" };
    case "stream.deleted":
      return { objectType: "stream", action: "deleted" };
    case "stream.read":
      return { objectType: "stream", action: "read" };
    case "stream_bindings.created":
      return { objectType: "stream_binding", action: "created" };
    case "stream_binding.updated":
      return { objectType: "stream_binding", action: "updated" };
    case "stream_binding.deleted":
      return { objectType: "stream_binding", action: "deleted" };
    case "topic.created":
      return { objectType: "topic", action: "created" };
    case "topic.updated":
      return { objectType: "topic", action: "updated" };
    case "topic.deleted":
      return { objectType: "topic", action: "deleted" };
    case "topic.read":
      return { objectType: "topic", action: "read" };
    case "user.updated":
      return { objectType: "user", action: "updated" };
    case "folder.created":
      return { objectType: "folder", action: "created" };
    case "folder.updated":
      return { objectType: "folder", action: "updated" };
    case "folder.deleted":
      return { objectType: "folder", action: "deleted" };
    case "folder_item.deleted":
      return { objectType: "folder_item", action: "deleted" };
    case "file.created":
      return { objectType: "file", action: "created" };
    case "file.updated":
      return { objectType: "file", action: "updated" };
    case "file.deleted":
      return { objectType: "file", action: "deleted" };
    case "external_account.created":
      return { objectType: "external_account", action: "created" };
    case "external_account.updated":
      return { objectType: "external_account", action: "updated" };
    case "external_account.deleted":
      return { objectType: "external_account", action: "deleted" };
    case "external_chat.created":
      return { objectType: "external_chat", action: "created" };
    case "external_chat.updated":
      return { objectType: "external_chat", action: "updated" };
    case "external_chat.deleted":
      return { objectType: "external_chat", action: "deleted" };
    default:
      return null;
  }
}

function matchesWorkspaceMessengerEventMetadata(
  objectType: WorkspaceMessengerEventObjectType,
  action: WorkspaceMessengerEventAction,
  payload: WorkspaceMessengerEventPayloadDto,
): boolean {
  const expected = expectedWorkspaceMessengerEventMetadata(payload.kind);
  return expected?.objectType === objectType && expected.action === action;
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
    (isRecord(value) &&
      value.kind === "zulip" &&
      isNonNegativeInteger(value.stream_id) &&
      (value.server_url === undefined ||
        value.server_url === null ||
        typeof value.server_url === "string") &&
      (value.topic_name === undefined ||
        value.topic_name === null ||
        typeof value.topic_name === "string") &&
      (value.message_id === undefined ||
        value.message_id === null ||
        isNonNegativeInteger(value.message_id)))
  );
}

export function isWorkspaceMessengerProviderDto(
  value: unknown,
): value is WorkspaceMessengerProviderDto {
  return (
    isRecord(value) &&
    value.kind === "zulip" &&
    isUuid(value.account_uuid) &&
    (value.external_id === null || typeof value.external_id === "string") &&
    isRecord(value.capabilities) &&
    (value.delivery_class === undefined || isDeliveryClass(value.delivery_class)) &&
    (value.notification_eligible === undefined || typeof value.notification_eligible === "boolean")
  );
}

export function isWorkspaceMessengerDeliveryDto(
  value: unknown,
): value is WorkspaceMessengerDeliveryDto {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (value.external_operation_uuid === undefined ||
      value.external_operation_uuid === null ||
      isUuid(value.external_operation_uuid)) &&
    (value.status === undefined || isDeliveryStatus(value.status)) &&
    (value.safe_error === undefined ||
      value.safe_error === null ||
      typeof value.safe_error === "string") &&
    (value.can_retry === undefined || typeof value.can_retry === "boolean") &&
    (value.can_discard === undefined || typeof value.can_discard === "boolean") &&
    (value.duplicate_risk === undefined || typeof value.duplicate_risk === "boolean") &&
    (value.retry_requires_confirmation === undefined ||
      typeof value.retry_requires_confirmation === "boolean") &&
    (value.original_url === undefined ||
      value.original_url === null ||
      typeof value.original_url === "string") &&
    (value.reconciliation_reason === undefined ||
      value.reconciliation_reason === null ||
      typeof value.reconciliation_reason === "string") &&
    (value.updated_at === undefined || isNullableDateTime(value.updated_at))
  );
}

export function isWorkspaceMessengerMarkdownPayloadDto(
  value: unknown,
): value is WorkspaceMessengerMarkdownPayloadDto {
  return isRecord(value) && value.kind === "markdown" && typeof value.content === "string";
}

export function isWorkspaceMessengerMessagePayloadDto(
  value: unknown,
): value is WorkspaceMessengerMessagePayloadDto {
  return isWorkspaceMessengerMarkdownPayloadDto(value);
}

export function isWorkspaceMessengerDraftDto(value: unknown): value is WorkspaceMessengerDraftDto {
  return (
    isRecord(value) &&
    isUuid(value.uuid) &&
    isUuid(value.project_id) &&
    isUuid(value.user_uuid) &&
    isUuid(value.stream_uuid) &&
    isUuid(value.topic_uuid) &&
    isWorkspaceMessengerMarkdownPayloadDto(value.payload) &&
    isNonNegativeInteger(value.revision) &&
    value.revision >= 1 &&
    isDateTime(value.created_at) &&
    isDateTime(value.updated_at)
  );
}

export function isWorkspaceMessengerReactionAggregate(
  value: unknown,
): value is WorkspaceMessengerReactionAggregate {
  // Агрегат проверяем строже обычного record: массивы, Date, Map и другие объекты
  // с поведением не должны попадать в DTO, потому что дальше это будет кешироваться
  // и сравниваться как простой JSON-объект от сервера.
  if (!isPlainRecord(value)) {
    return false;
  }

  return Object.entries(value).every(
    ([emojiName, count]) => emojiName.trim().length > 0 && isNonNegativeInteger(count),
  );
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
    (value.color === undefined ||
      value.color === null ||
      (isNonNegativeInteger(value.color) && value.color <= 0xffffff)) &&
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
    (value.color === undefined ||
      value.color === null ||
      (isNonNegativeInteger(value.color) && value.color <= 0xffffff)) &&
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
    isWorkspaceMessengerMessagePayloadDto(value.payload) &&
    isUuid(value.user_uuid) &&
    typeof value.read === "boolean" &&
    typeof value.pinned === "boolean" &&
    typeof value.starred === "boolean" &&
    typeof value.is_own === "boolean" &&
    (value.mentioned === undefined || typeof value.mentioned === "boolean") &&
    (value.source_name === undefined || isSourceName(value.source_name)) &&
    (value.source === undefined || isWorkspaceMessengerSourceDto(value.source)) &&
    (value.provider === undefined ||
      value.provider === null ||
      isWorkspaceMessengerProviderDto(value.provider)) &&
    (value.delivery === undefined ||
      value.delivery === null ||
      isWorkspaceMessengerDeliveryDto(value.delivery)) &&
    isWorkspaceMessengerReactionAggregate(value.reactions) &&
    isDateTime(value.created_at) &&
    isDateTime(value.updated_at)
  );
}

export function isWorkspaceMessengerMessageReactionDto(
  value: unknown,
): value is WorkspaceMessengerMessageReactionDto {
  return (
    isRecord(value) &&
    isUuid(value.uuid) &&
    isUuid(value.project_id) &&
    isUuid(value.message_uuid) &&
    isUuid(value.user_uuid) &&
    isNonEmptyString(value.emoji_name) &&
    isDateTime(value.created_at) &&
    isDateTime(value.updated_at)
  );
}

function isWorkspaceMessengerMessageReactionEventPayloadDto(
  value: unknown,
): value is WorkspaceMessengerMessageReactionEventPayloadDto {
  const record = isRecord(value) ? value : null;
  return (
    record != null &&
    (record.kind === "message_reaction.created" ||
      record.kind === "message_reaction.updated" ||
      record.kind === "message_reaction.deleted") &&
    isUuid(record.uuid) &&
    isUuid(record.project_id) &&
    isUuid(record.message_uuid) &&
    isUuid(record.user_uuid) &&
    isNonEmptyString(record.emoji_name) &&
    isSourceName(record.source_name) &&
    isWorkspaceMessengerSourceDto(record.source) &&
    (record.old_message_uuid === undefined || isNullableUuid(record.old_message_uuid)) &&
    (record.old_emoji_name === undefined ||
      record.old_emoji_name === null ||
      isNonEmptyString(record.old_emoji_name)) &&
    (record.old_source_name === undefined ||
      record.old_source_name === null ||
      isSourceName(record.old_source_name)) &&
    (record.old_source === undefined ||
      record.old_source === null ||
      isWorkspaceMessengerSourceDto(record.old_source))
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
    value.username.trim().length > 0 &&
    (value.source === "iam" || value.source === "zulip") &&
    (value.avatar == null || typeof value.avatar === "string") &&
    isUserStatus(value.status) &&
    (value.status_emoji == null || typeof value.status_emoji === "string") &&
    (value.status_text == null || typeof value.status_text === "string") &&
    (value.first_name == null || typeof value.first_name === "string") &&
    (value.last_name == null || typeof value.last_name === "string") &&
    (value.email == null || typeof value.email === "string") &&
    isDateTime(value.last_ping_at) &&
    isDateTime(value.created_at) &&
    isDateTime(value.updated_at)
  );
}

export function isWorkspaceMessengerEpochDto(value: unknown): value is WorkspaceMessengerEpochDto {
  return (
    isRecord(value) &&
    isNonNegativeInteger(value.epoch_version) &&
    isNonEmptyString(value.epoch_generation) &&
    isNonNegativeInteger(value.current_epoch_version) &&
    isNonNegativeInteger(value.minimum_epoch_version)
  );
}

export function isWorkspaceMessengerFileDto(value: unknown): value is WorkspaceMessengerFileDto {
  return (
    isRecord(value) &&
    isUuid(value.uuid) &&
    isUuid(value.project_id) &&
    isUuid(value.user_uuid) &&
    isNullableUuid(value.stream_uuid) &&
    isNonEmptyString(value.name) &&
    typeof value.description === "string" &&
    isNonEmptyString(value.content_type) &&
    isNonNegativeInteger(value.size_bytes) &&
    isNonEmptyString(value.hash) &&
    isDateTime(value.created_at) &&
    isDateTime(value.updated_at)
  );
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
    case "stream.read":
      return isWorkspaceMessengerStreamDto(value);
    case "stream.deleted":
      return isUuid(value.uuid);
    case "stream_bindings.created":
      return (
        isUuid(value.uuid) &&
        Array.isArray(value.items) &&
        value.items.every(isWorkspaceMessengerStreamBindingDto)
      );
    case "stream_binding.updated":
      return isWorkspaceMessengerStreamBindingDto(value);
    case "stream_binding.deleted":
      return isUuid(value.uuid) && isUuid(value.stream_uuid) && isUuid(value.user_uuid);
    case "topic.created":
    case "topic.updated":
    case "topic.read":
      return isWorkspaceMessengerTopicDto(value);
    case "topic.deleted":
      return isUuid(value.uuid) && isUuid(value.stream_uuid);
    case "message.created":
    case "message.updated":
    case "message.read":
      return isWorkspaceMessengerMessageDto(value);
    case "messages.read":
      return (
        isUuid(value.project_id) &&
        Array.isArray(value.message_uuids) &&
        value.message_uuids.every(isUuid)
      );
    case "message.deleted":
      return isUuid(value.uuid) && isUuid(value.stream_uuid) && isUuid(value.topic_uuid);
    case "message_reaction.created":
    case "message_reaction.updated":
    case "message_reaction.deleted":
      return isWorkspaceMessengerMessageReactionEventPayloadDto(value);
    case "folder.created":
    case "folder.updated":
      return isWorkspaceMessengerFolderDto(value);
    case "folder.deleted":
    case "folder_item.deleted":
      return isUuid(value.uuid);
    case "file.created":
    case "file.updated":
      return isWorkspaceMessengerFileDto(value);
    case "file.deleted":
      return isUuid(value.uuid) && isNullableUuid(value.stream_uuid);
    case "user.updated":
      return isWorkspaceMessengerUserDto(value);
    case "external_account.created":
    case "external_account.updated":
    case "external_account.deleted":
      return (
        isUuid(value.uuid) &&
        isWorkspaceExternalAccountDto(value.snapshot) &&
        value.snapshot.uuid === value.uuid
      );
    case "external_chat.created":
    case "external_chat.updated":
    case "external_chat.deleted":
      return (
        isUuid(value.uuid) &&
        isWorkspaceExternalChatDto(value.snapshot) &&
        value.snapshot.uuid === value.uuid
      );
    default:
      return false;
  }
}

export function isWorkspaceMessengerEventDto(value: unknown): value is WorkspaceMessengerEventDto {
  return (
    isRecord(value) &&
    value.schema_version === 1 &&
    isNonNegativeInteger(value.epoch_version) &&
    isUuid(value.uuid) &&
    isUuid(value.project_id) &&
    isUuid(value.user_uuid) &&
    isWorkspaceMessengerEventObjectType(value.object_type) &&
    isWorkspaceMessengerEventAction(value.action) &&
    isWorkspaceMessengerEventPayloadDto(value.payload) &&
    matchesWorkspaceMessengerEventMetadata(value.object_type, value.action, value.payload) &&
    isDateTime(value.created_at) &&
    isDateTime(value.updated_at)
  );
}

export function isWorkspaceMessengerRawEventDto(
  value: unknown,
): value is WorkspaceMessengerRawEventDto {
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value.schema_version) ||
    !isNonNegativeInteger(value.epoch_version) ||
    !isUuid(value.uuid) ||
    !isUuid(value.project_id) ||
    !isUuid(value.user_uuid) ||
    !isNonEmptyString(value.object_type) ||
    !isNonEmptyString(value.action) ||
    !isRecord(value.payload) ||
    !isNonEmptyString(value.payload.kind) ||
    !isDateTime(value.created_at) ||
    !isDateTime(value.updated_at)
  ) {
    return false;
  }

  // Keep the transport envelope usable when a known event has a payload that
  // this client cannot apply yet. The realtime layer will skip it by epoch.
  return true;
}

export function isWorkspaceMessengerRealtimeEventDto(
  value: unknown,
): value is WorkspaceMessengerRealtimeEventDto {
  return isWorkspaceMessengerEventDto(value) || isWorkspaceMessengerRawEventDto(value);
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
    typeof value.meet_url === "string" &&
    Array.isArray(value.external_authentication_methods) &&
    typeof value.realm_uri === "string" &&
    isOptionalStringArray(value.ignored_parameters_unsupported)
  );
}

function isWorkspaceRealtimeMessageEvent(value: Record<string, unknown>): boolean {
  if (value.kind === "message.deleted") {
    return isMessageDeleteDto(value.message);
  }
  return (
    (value.kind === undefined || value.kind === "message.updated") &&
    isWorkspaceMessengerMessageDto(value.message)
  );
}

function isWorkspaceRealtimeStreamEvent(value: Record<string, unknown>): boolean {
  if (value.kind === "stream.deleted") {
    return isUuidOnlyDto(value.stream);
  }
  return (
    (value.kind === "stream.created" || value.kind === "stream.updated") &&
    isWorkspaceMessengerStreamDto(value.stream)
  );
}

function isWorkspaceRealtimeStreamBindingEvent(value: Record<string, unknown>): boolean {
  if (value.kind === "stream_bindings.created") {
    return (
      isUuid(value.stream_uuid) &&
      Array.isArray(value.stream_bindings) &&
      value.stream_bindings.every(isWorkspaceMessengerStreamBindingDto)
    );
  }
  if (value.kind === "stream_binding.updated") {
    return isWorkspaceMessengerStreamBindingDto(value.stream_binding);
  }
  return (
    value.kind === "stream_binding.deleted" &&
    isRecord(value.stream_binding) &&
    isUuid(value.stream_binding.uuid) &&
    isUuid(value.stream_binding.stream_uuid) &&
    isUuid(value.stream_binding.user_uuid)
  );
}

function isWorkspaceRealtimeTopicEvent(value: Record<string, unknown>): boolean {
  if (value.kind === "topic.deleted") {
    return isTopicDeleteDto(value.topic);
  }
  return (
    (value.kind === "topic.created" || value.kind === "topic.updated") &&
    isWorkspaceMessengerTopicDto(value.topic)
  );
}

function isWorkspaceRealtimeFolderEvent(value: Record<string, unknown>): boolean {
  if (value.kind === "folder.deleted") {
    return isUuidOnlyDto(value.folder);
  }
  return (
    (value.kind === "folder.created" || value.kind === "folder.updated") &&
    isWorkspaceMessengerFolderDto(value.folder)
  );
}

function isWorkspaceRealtimeFileEvent(value: Record<string, unknown>): boolean {
  if (value.kind === "file.deleted") {
    return (
      isRecord(value.file) && isUuid(value.file.uuid) && isNullableUuid(value.file.stream_uuid)
    );
  }
  return (
    (value.kind === "file.created" || value.kind === "file.updated") &&
    isWorkspaceMessengerFileDto(value.file)
  );
}

export function isWorkspaceRealtimeEvent(value: unknown): value is WorkspaceRealtimeEvent {
  if (!isRecord(value) || !isNonNegativeInteger(value.epoch_version)) {
    return false;
  }

  switch (value.type) {
    case "message":
      return isWorkspaceRealtimeMessageEvent(value);
    case "stream":
      return isWorkspaceRealtimeStreamEvent(value);
    case "stream_binding":
      return isWorkspaceRealtimeStreamBindingEvent(value);
    case "topic":
      return isWorkspaceRealtimeTopicEvent(value);
    case "folder":
      return isWorkspaceRealtimeFolderEvent(value);
    case "folder_item":
      return value.kind === "folder_item.deleted" && isUuidOnlyDto(value.folder_item);
    case "file":
      return isWorkspaceRealtimeFileEvent(value);
    case "user":
      return value.kind === "user.updated" && isWorkspaceMessengerUserDto(value.user);
    case "external_account":
      return (
        (value.kind === "external_account.created" ||
          value.kind === "external_account.updated" ||
          value.kind === "external_account.deleted") &&
        isWorkspaceExternalAccountDto(value.external_account)
      );
    case "external_chat":
      return (
        (value.kind === "external_chat.created" ||
          value.kind === "external_chat.updated" ||
          value.kind === "external_chat.deleted") &&
        isWorkspaceExternalChatDto(value.external_chat)
      );
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
  if (isWorkspaceMessengerEventDto(value)) {
    return true;
  }
  if (isWorkspaceMessengerRawEventDto(value)) {
    return true;
  }

  switch (value.type) {
    case "ready":
      return isNonEmptyString(value.epoch_generation) && isNonNegativeInteger(value.epoch_version);
    case "error":
      return (
        value.code === 410 &&
        value.error === "epoch_pruned" &&
        typeof value.message === "string" &&
        isNonEmptyString(value.reason) &&
        isNonEmptyString(value.epoch_generation) &&
        isNonNegativeInteger(value.current_epoch_version) &&
        isNonNegativeInteger(value.minimum_epoch_version)
      );
    default:
      return false;
  }
}

export function isWorkspaceEventsCursorExpiredErrorDto(
  value: unknown,
): value is WorkspaceEventsCursorExpiredErrorDto {
  return (
    isRecord(value) &&
    value.type === "EventsCursorExpiredError" &&
    value.code === 410 &&
    value.error === "epoch_pruned" &&
    typeof value.message === "string" &&
    isNonEmptyString(value.reason) &&
    isNonEmptyString(value.epoch_generation) &&
    isNonNegativeInteger(value.current_epoch_version) &&
    isNonNegativeInteger(value.minimum_epoch_version)
  );
}
