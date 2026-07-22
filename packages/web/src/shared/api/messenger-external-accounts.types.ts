import type { WorkspaceMessengerUuid } from "./messenger.types";

export type WorkspaceExternalAccountProvider = "zulip";
export type WorkspaceExternalAccountStatus =
  | "connecting"
  | "backfill"
  | "live"
  | "degraded"
  | "auth_required"
  | "disconnected"
  | "suspended";
export type WorkspaceExternalAccountSelectionMode = "explicit" | "all";
export type WorkspaceExternalAccountHistoryDepth = "new" | "7_days" | "30_days" | "90_days" | "all";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isWorkspaceExternalAccountStatus(value: unknown): value is WorkspaceExternalAccountStatus {
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

function isWorkspaceExternalAccountSelectionMode(
  value: unknown,
): value is WorkspaceExternalAccountSelectionMode {
  return value === "explicit" || value === "all";
}

function isWorkspaceExternalAccountHistoryDepth(
  value: unknown,
): value is WorkspaceExternalAccountHistoryDepth {
  return (
    value === "new" ||
    value === "7_days" ||
    value === "30_days" ||
    value === "90_days" ||
    value === "all"
  );
}

export function isWorkspaceExternalAccountDto(
  value: unknown,
): value is WorkspaceExternalAccountDto {
  if (!isRecord(value) || !isRecord(value.settings)) return false;
  const settings = value.settings;
  return (
    isNonEmptyString(value.uuid) &&
    settings.kind === "zulip" &&
    isNonEmptyString(settings.server_url) &&
    isNonEmptyString(settings.email) &&
    isWorkspaceExternalAccountSelectionMode(settings.selection_mode) &&
    isWorkspaceExternalAccountHistoryDepth(settings.history_depth) &&
    isNonEmptyString(settings.default_project_id) &&
    typeof value.credential_present === "boolean" &&
    isWorkspaceExternalAccountStatus(value.status) &&
    typeof value.live_ready === "boolean" &&
    isRecord(value.capabilities) &&
    isNullableString(value.safe_error) &&
    isNonNegativeInteger(value.desired_generation) &&
    value.desired_generation >= 1 &&
    isNonNegativeInteger(value.applied_generation) &&
    isNullableString(value.last_progress_at) &&
    isNonNegativeInteger(value.revision) &&
    value.revision >= 1 &&
    isNonEmptyString(value.created_at) &&
    isNonEmptyString(value.updated_at)
  );
}
