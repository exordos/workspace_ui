import type { WorkspaceExternalAccountHistoryDepth } from "./messenger-external-accounts.types";
import type { WorkspaceMessengerUuid } from "./messenger.types";

export type WorkspaceExternalChatStatus =
  | "available"
  | "syncing"
  | "live"
  | "degraded"
  | "deselected";
export type WorkspaceExternalChatType = "channel" | "personal" | "group";

export interface WorkspaceZulipExternalChatSourceDto {
  kind: "zulip";
  chat_type: WorkspaceExternalChatType;
  original_url?: string | null;
}

export interface WorkspaceExternalChatDto {
  uuid: WorkspaceMessengerUuid;
  external_account_uuid: WorkspaceMessengerUuid;
  source: WorkspaceZulipExternalChatSourceDto;
  display_name: string;
  selected: boolean;
  project_id: WorkspaceMessengerUuid | null;
  history_depth: WorkspaceExternalAccountHistoryDepth;
  projection_stream_uuid: WorkspaceMessengerUuid | null;
  status: WorkspaceExternalChatStatus;
  capabilities: Record<string, unknown>;
  safe_error: string | null;
  transition_pending: boolean;
  revision: number;
  created_at: string;
  updated_at: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isHistoryDepth(value: unknown): value is WorkspaceExternalAccountHistoryDepth {
  return (
    value === "new" ||
    value === "7_days" ||
    value === "30_days" ||
    value === "90_days" ||
    value === "all"
  );
}

function isStatus(value: unknown): value is WorkspaceExternalChatStatus {
  return (
    value === "available" ||
    value === "syncing" ||
    value === "live" ||
    value === "degraded" ||
    value === "deselected"
  );
}

function isChatType(value: unknown): value is WorkspaceExternalChatType {
  return value === "channel" || value === "personal" || value === "group";
}

export function isWorkspaceExternalChatDto(value: unknown): value is WorkspaceExternalChatDto {
  if (!isRecord(value) || !isRecord(value.source)) return false;
  return (
    isString(value.uuid) &&
    isString(value.external_account_uuid) &&
    value.source.kind === "zulip" &&
    isChatType(value.source.chat_type) &&
    (value.source.original_url == null || typeof value.source.original_url === "string") &&
    isString(value.display_name) &&
    typeof value.selected === "boolean" &&
    isNullableString(value.project_id) &&
    isHistoryDepth(value.history_depth) &&
    isNullableString(value.projection_stream_uuid) &&
    isStatus(value.status) &&
    isRecord(value.capabilities) &&
    isNullableString(value.safe_error) &&
    typeof value.transition_pending === "boolean" &&
    typeof value.revision === "number" &&
    Number.isInteger(value.revision) &&
    value.revision >= 1 &&
    isString(value.created_at) &&
    isString(value.updated_at)
  );
}
