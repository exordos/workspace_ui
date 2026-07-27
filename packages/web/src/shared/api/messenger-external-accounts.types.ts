import type { WorkspaceMessengerUuid } from "./messenger.types";

export type WorkspaceExternalAccountProvider = "zulip";
export type WorkspaceExternalAccountSelectionMode = "explicit" | "all";
export type WorkspaceExternalAccountHistoryDepth = "new" | "7_days" | "30_days" | "90_days" | "all";
export type WorkspaceExternalAccountStatus =
  | "connecting"
  | "backfill"
  | "live"
  | "degraded"
  | "auth_required"
  | "disconnected"
  | "suspended";

export interface WorkspaceZulipExternalAccountSettingsDto {
  kind: "zulip";
  server_url: string;
  email: string;
  selection_mode: WorkspaceExternalAccountSelectionMode;
  history_depth: WorkspaceExternalAccountHistoryDepth;
  default_project_id: WorkspaceMessengerUuid;
}

export interface WorkspaceExternalAccountDto {
  uuid: WorkspaceMessengerUuid;
  settings: WorkspaceZulipExternalAccountSettingsDto;
  credential_present: boolean;
  status: WorkspaceExternalAccountStatus;
  live_ready: boolean;
  capabilities: Record<string, unknown>;
  safe_error: string | null;
  desired_generation: number;
  applied_generation: number;
  last_progress_at: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceExternalAccountCreateRequestBody {
  uuid: WorkspaceMessengerUuid;
  settings: WorkspaceZulipExternalAccountSettingsDto & {
    api_key: string;
  };
}

export interface WorkspaceExternalAccountUpdateRequestBody {
  settings: Pick<
    WorkspaceZulipExternalAccountSettingsDto,
    "kind" | "selection_mode" | "history_depth" | "default_project_id"
  >;
}

export interface WorkspaceExternalAccountReconnectRequestBody {
  settings: Pick<WorkspaceZulipExternalAccountSettingsDto, "kind" | "server_url" | "email"> & {
    api_key: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableTimestamp(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isSelectionMode(value: unknown): value is WorkspaceExternalAccountSelectionMode {
  return value === "explicit" || value === "all";
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

function isStatus(value: unknown): value is WorkspaceExternalAccountStatus {
  return (
    value === "connecting" ||
    value === "backfill" ||
    value === "live" ||
    value === "degraded" ||
    value === "auth_required" ||
    value === "disconnected" ||
    value === "suspended"
  );
}

function isSettings(value: unknown): value is WorkspaceZulipExternalAccountSettingsDto {
  return (
    isRecord(value) &&
    value.kind === "zulip" &&
    isNonEmptyString(value.server_url) &&
    isNonEmptyString(value.email) &&
    isSelectionMode(value.selection_mode) &&
    isHistoryDepth(value.history_depth) &&
    isNonEmptyString(value.default_project_id)
  );
}

export function isWorkspaceExternalAccountDto(
  value: unknown,
): value is WorkspaceExternalAccountDto {
  return (
    isRecord(value) &&
    isNonEmptyString(value.uuid) &&
    isSettings(value.settings) &&
    typeof value.credential_present === "boolean" &&
    isStatus(value.status) &&
    typeof value.live_ready === "boolean" &&
    isRecord(value.capabilities) &&
    (value.safe_error === null || typeof value.safe_error === "string") &&
    isPositiveInteger(value.desired_generation) &&
    isNonNegativeInteger(value.applied_generation) &&
    isNullableTimestamp(value.last_progress_at) &&
    isPositiveInteger(value.revision) &&
    isNonEmptyString(value.created_at) &&
    isNonEmptyString(value.updated_at)
  );
}
