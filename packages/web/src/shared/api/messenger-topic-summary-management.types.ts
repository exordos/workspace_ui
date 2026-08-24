import type { WorkspaceMessengerUuid } from "./messenger.types";

export type { WorkspaceMessengerTopicSummaryConfigurationRequestBody } from "./messenger.types";

export interface WorkspaceTopicSummarySettingsDto {
  project_id: WorkspaceMessengerUuid;
  global_enabled: boolean;
  project_enabled: boolean;
}

export interface WorkspaceTopicSummarySettingsUpdateRequestBody {
  global_enabled: boolean;
  project_enabled: boolean;
}

export interface WorkspaceTopicSummaryEndpointDto {
  uuid: WorkspaceMessengerUuid;
  name: string;
  base_url: string;
  model: string;
  enabled: boolean;
  priority: number;
  supports_vision: boolean;
  supports_reasoning: boolean;
  temperature: number;
  max_output_tokens: number;
  top_p: number;
  presence_penalty: number;
  frequency_penalty: number;
  credential_present: boolean;
  claim_expires_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  failure_count: number;
  last_error_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceTopicSummaryEndpointCreateRequestBody {
  uuid: WorkspaceMessengerUuid;
  name: string;
  base_url: string;
  model: string;
  api_key: string;
  enabled?: boolean;
  priority?: number;
  supports_vision?: boolean;
  supports_reasoning?: boolean;
  temperature?: number;
  max_output_tokens?: number;
  top_p?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
}

interface WorkspaceTopicSummaryEndpointMutableFields {
  name: string;
  base_url: string;
  model: string;
  api_key: string;
  enabled: boolean;
  priority: number;
  supports_vision: boolean;
  supports_reasoning: boolean;
  temperature: number;
  max_output_tokens: number;
  top_p: number;
  presence_penalty: number;
  frequency_penalty: number;
}

type AtLeastOne<T> = {
  [Key in keyof T]: Required<Pick<T, Key>> & Partial<Omit<T, Key>>;
}[keyof T];

export type WorkspaceTopicSummaryEndpointUpdateRequestBody =
  AtLeastOne<WorkspaceTopicSummaryEndpointMutableFields>;

const SETTINGS_KEYS = ["project_id", "global_enabled", "project_enabled"] as const;
const ENDPOINT_KEYS = [
  "uuid",
  "name",
  "base_url",
  "model",
  "enabled",
  "priority",
  "supports_vision",
  "supports_reasoning",
  "temperature",
  "max_output_tokens",
  "top_p",
  "presence_penalty",
  "frequency_penalty",
  "credential_present",
  "claim_expires_at",
  "last_success_at",
  "last_failure_at",
  "failure_count",
  "last_error_code",
  "created_at",
  "updated_at",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length && actualKeys.every((key) => keys.includes(key));
}

function isUuid(value: unknown): value is WorkspaceMessengerUuid {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

function isNonEmptyStringWithin(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maximum;
}

function isDateTime(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function isNullableDateTime(value: unknown): value is string | null {
  return value === null || isDateTime(value);
}

function isNullableStringWithin(value: unknown, maximum: number): value is string | null {
  return value === null || (typeof value === "string" && value.length <= maximum);
}

function isBaseUrl(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > 2048 ||
    value.endsWith("/")
  ) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.host.length > 0 &&
      parsed.username.length === 0 &&
      parsed.password.length === 0 &&
      parsed.search.length === 0 &&
      parsed.hash.length === 0
    );
  } catch {
    return false;
  }
}

function isIntegerWithin(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum
  );
}

function isNumberWithin(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
  );
}

export function isWorkspaceTopicSummarySettingsDto(
  value: unknown,
): value is WorkspaceTopicSummarySettingsDto {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, SETTINGS_KEYS) &&
    isUuid(value.project_id) &&
    typeof value.global_enabled === "boolean" &&
    typeof value.project_enabled === "boolean"
  );
}

export function isWorkspaceTopicSummaryEndpointDto(
  value: unknown,
): value is WorkspaceTopicSummaryEndpointDto {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ENDPOINT_KEYS) &&
    isUuid(value.uuid) &&
    isNonEmptyStringWithin(value.name, 255) &&
    isBaseUrl(value.base_url) &&
    isNonEmptyStringWithin(value.model, 255) &&
    typeof value.enabled === "boolean" &&
    isIntegerWithin(value.priority, 0, 1_000_000) &&
    typeof value.supports_vision === "boolean" &&
    typeof value.supports_reasoning === "boolean" &&
    isNumberWithin(value.temperature, 0, 2) &&
    isIntegerWithin(value.max_output_tokens, 1, 32_768) &&
    isNumberWithin(value.top_p, 0, 1) &&
    isNumberWithin(value.presence_penalty, -2, 2) &&
    isNumberWithin(value.frequency_penalty, -2, 2) &&
    typeof value.credential_present === "boolean" &&
    isNullableDateTime(value.claim_expires_at) &&
    isNullableDateTime(value.last_success_at) &&
    isNullableDateTime(value.last_failure_at) &&
    isIntegerWithin(value.failure_count, 0, Number.MAX_SAFE_INTEGER) &&
    isNullableStringWithin(value.last_error_code, 128) &&
    isDateTime(value.created_at) &&
    isDateTime(value.updated_at)
  );
}
