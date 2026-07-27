import type { WorkspaceMessengerUuid } from "./messenger.types";

export type WorkspaceExternalProvider = "zulip";
export type WorkspaceExternalProviderHealthStatus = "healthy" | "unavailable";

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
  created_at: string;
  updated_at: string;
  revision: number;
  provider: WorkspaceExternalProvider;
  enabled: boolean;
  emergency_suspended: boolean;
  limits: WorkspaceExternalProviderLimitsDto;
  custom_ca_bundle: WorkspaceExternalProviderCustomCaDto | null;
}

export interface WorkspaceExternalProviderCustomCaUpdateDto {
  certificates_pem: string[];
}

export interface WorkspaceExternalProviderPolicyUpdateRequestBody {
  settings: {
    kind: WorkspaceExternalProvider;
    enabled: boolean;
    limits: WorkspaceExternalProviderLimitsDto;
    custom_ca_bundle: WorkspaceExternalProviderCustomCaUpdateDto | null;
  };
}

export interface WorkspaceExternalProviderHealthMetricsDto {
  queue_depth: number;
  selected_chats: number;
  synchronized_messages: number;
  synchronized_users: number;
}

export interface WorkspaceExternalProviderHealthDto {
  provider: WorkspaceExternalProvider;
  status: WorkspaceExternalProviderHealthStatus;
  account_counts: Record<string, number>;
  chat_counts: Record<string, number>;
  bridge_counts: Record<string, number>;
  operation_counts: Record<string, number>;
  metrics: WorkspaceExternalProviderHealthMetricsDto;
  updated_at: string;
}

const POLICY_KEYS = [
  "uuid",
  "created_at",
  "updated_at",
  "revision",
  "provider",
  "enabled",
  "emergency_suspended",
  "limits",
  "custom_ca_bundle",
] as const;
const LIMIT_KEYS = ["max_accounts", "max_selected_chats_per_account", "max_file_bytes"] as const;
const CUSTOM_CA_KEYS = ["uuid", "generation", "sha256", "certificate_count"] as const;
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return (
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key))
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIntegerWithin(value: unknown, maximum: number, minimum = 0): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum
  );
}

function isLimits(value: unknown): value is WorkspaceExternalProviderLimitsDto {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, LIMIT_KEYS) &&
    isIntegerWithin(value.max_accounts, 100_000) &&
    isIntegerWithin(value.max_selected_chats_per_account, 1_000_000) &&
    isIntegerWithin(value.max_file_bytes, 5_368_709_120)
  );
}

function isCustomCa(value: unknown): value is WorkspaceExternalProviderCustomCaDto {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, CUSTOM_CA_KEYS) &&
    isNonEmptyString(value.uuid) &&
    isIntegerWithin(value.generation, Number.MAX_SAFE_INTEGER, 1) &&
    typeof value.sha256 === "string" &&
    /^[0-9a-f]{64}$/.test(value.sha256) &&
    isIntegerWithin(value.certificate_count, 32, 1)
  );
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return (
    isRecord(value) &&
    Object.values(value).every((entry) => typeof entry === "number" && Number.isFinite(entry))
  );
}

function isHealthMetrics(value: unknown): value is WorkspaceExternalProviderHealthMetricsDto {
  return (
    isRecord(value) &&
    typeof value.queue_depth === "number" &&
    Number.isFinite(value.queue_depth) &&
    typeof value.selected_chats === "number" &&
    Number.isFinite(value.selected_chats) &&
    typeof value.synchronized_messages === "number" &&
    Number.isFinite(value.synchronized_messages) &&
    typeof value.synchronized_users === "number" &&
    Number.isFinite(value.synchronized_users)
  );
}

export function isWorkspaceExternalProviderPolicyDto(
  value: unknown,
): value is WorkspaceExternalProviderPolicyDto {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, POLICY_KEYS) &&
    isNonEmptyString(value.uuid) &&
    isNonEmptyString(value.created_at) &&
    isNonEmptyString(value.updated_at) &&
    isIntegerWithin(value.revision, Number.MAX_SAFE_INTEGER, 1) &&
    value.provider === "zulip" &&
    typeof value.enabled === "boolean" &&
    typeof value.emergency_suspended === "boolean" &&
    isLimits(value.limits) &&
    (value.custom_ca_bundle === null || isCustomCa(value.custom_ca_bundle))
  );
}

export function isWorkspaceExternalProviderHealthDto(
  value: unknown,
): value is WorkspaceExternalProviderHealthDto {
  return (
    isRecord(value) &&
    value.provider === "zulip" &&
    (value.status === "healthy" || value.status === "unavailable") &&
    isNumberRecord(value.account_counts) &&
    isNumberRecord(value.chat_counts) &&
    isNumberRecord(value.bridge_counts) &&
    isNumberRecord(value.operation_counts) &&
    isHealthMetrics(value.metrics) &&
    isNonEmptyString(value.updated_at)
  );
}
