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

export interface WorkspaceExternalAccountUpdateRequestBody {
  settings: Pick<
    WorkspaceZulipExternalAccountSettingsDto,
    "kind" | "selection_mode" | "history_depth" | "default_project_id"
  >;
}

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

export interface WorkspaceExternalProviderLimitsDto {
  max_accounts: number;
  max_selected_chats_per_account: number;
  max_file_bytes: number;
}

export interface WorkspaceExternalProviderCustomCaDto {
  uuid: WorkspaceMessengerUuid;
  generation: number;
  sha256: string;
  certificate_count: number;
}

export interface WorkspaceExternalProviderPolicyDto {
  uuid: WorkspaceMessengerUuid;
  provider: WorkspaceExternalAccountProvider;
  enabled: boolean;
  emergency_suspended: boolean;
  limits: WorkspaceExternalProviderLimitsDto;
  custom_ca_bundle: WorkspaceExternalProviderCustomCaDto | null;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceExternalProviderPolicyUpdateRequestBody {
  settings: {
    kind: WorkspaceExternalAccountProvider;
    enabled: boolean;
    limits: WorkspaceExternalProviderLimitsDto;
    custom_ca_bundle: null;
  };
}

export interface WorkspaceExternalProviderHealthDto {
  provider: WorkspaceExternalAccountProvider;
  status: string;
  account_counts: Record<string, number>;
  chat_counts: Record<string, number>;
  bridge_counts: Record<string, number>;
  operation_counts: Record<string, number>;
  metrics: Record<string, number>;
  updated_at: string;
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

function isStringNumberRecord(value: unknown): value is Record<string, number> {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (entry) => typeof entry === "number" && Number.isFinite(entry) && entry >= 0,
    )
  );
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

function isWorkspaceExternalChatStatus(value: unknown): value is WorkspaceExternalChatStatus {
  return (
    value === "available" ||
    value === "syncing" ||
    value === "live" ||
    value === "degraded" ||
    value === "deselected"
  );
}

function isWorkspaceExternalChatType(value: unknown): value is WorkspaceExternalChatType {
  return value === "channel" || value === "personal" || value === "group";
}

export function isWorkspaceExternalChatDto(value: unknown): value is WorkspaceExternalChatDto {
  if (!isRecord(value) || !isRecord(value.source)) return false;
  return (
    isNonEmptyString(value.uuid) &&
    isNonEmptyString(value.external_account_uuid) &&
    value.source.kind === "zulip" &&
    isWorkspaceExternalChatType(value.source.chat_type) &&
    (value.source.original_url == null || typeof value.source.original_url === "string") &&
    isNonEmptyString(value.display_name) &&
    typeof value.selected === "boolean" &&
    (value.project_id === null || isNonEmptyString(value.project_id)) &&
    isWorkspaceExternalAccountHistoryDepth(value.history_depth) &&
    (value.projection_stream_uuid === null || isNonEmptyString(value.projection_stream_uuid)) &&
    isWorkspaceExternalChatStatus(value.status) &&
    isRecord(value.capabilities) &&
    isNullableString(value.safe_error) &&
    typeof value.transition_pending === "boolean" &&
    isNonNegativeInteger(value.revision) &&
    value.revision >= 1 &&
    isNonEmptyString(value.created_at) &&
    isNonEmptyString(value.updated_at)
  );
}

export function isWorkspaceExternalProviderPolicyDto(
  value: unknown,
): value is WorkspaceExternalProviderPolicyDto {
  if (!isRecord(value) || !isRecord(value.limits)) return false;
  const customCa = value.custom_ca_bundle;
  return (
    isNonEmptyString(value.uuid) &&
    value.provider === "zulip" &&
    typeof value.enabled === "boolean" &&
    typeof value.emergency_suspended === "boolean" &&
    isNonNegativeInteger(value.limits.max_accounts) &&
    isNonNegativeInteger(value.limits.max_selected_chats_per_account) &&
    isNonNegativeInteger(value.limits.max_file_bytes) &&
    (customCa === null ||
      (isRecord(customCa) &&
        isNonEmptyString(customCa.uuid) &&
        isNonNegativeInteger(customCa.generation) &&
        typeof customCa.sha256 === "string" &&
        isNonNegativeInteger(customCa.certificate_count))) &&
    isNonNegativeInteger(value.revision) &&
    value.revision >= 1 &&
    isNonEmptyString(value.created_at) &&
    isNonEmptyString(value.updated_at)
  );
}

export function isWorkspaceExternalProviderHealthDto(
  value: unknown,
): value is WorkspaceExternalProviderHealthDto {
  return (
    isRecord(value) &&
    value.provider === "zulip" &&
    isNonEmptyString(value.status) &&
    isStringNumberRecord(value.account_counts) &&
    isStringNumberRecord(value.chat_counts) &&
    isStringNumberRecord(value.bridge_counts) &&
    isStringNumberRecord(value.operation_counts) &&
    isStringNumberRecord(value.metrics) &&
    isNonEmptyString(value.updated_at)
  );
}
