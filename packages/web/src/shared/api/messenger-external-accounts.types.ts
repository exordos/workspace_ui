import type { WorkspaceMessengerUuid } from "./messenger.types";

export type WorkspaceExternalAccountProvider = "zulip";
export type WorkspaceExternalAccountStatus = "new" | "active";
export type WorkspaceExternalAccountAccessStatus =
  | "missing_credentials"
  | "confirmed"
  | "invalid_credentials"
  | "unavailable";

export interface WorkspaceExternalAccountUserInfoDto {
  user_id?: number;
  email?: string;
  full_name?: string;
  avatar_url?: string | null;
}

export interface WorkspaceExternalAccountDto {
  uuid: WorkspaceMessengerUuid;
  project_id: WorkspaceMessengerUuid;
  user_uuid: WorkspaceMessengerUuid;
  server_url: string;
  source_scope: string | null;
  account_type: WorkspaceExternalAccountProvider;
  status: WorkspaceExternalAccountStatus;
  access_status: WorkspaceExternalAccountAccessStatus;
  access_checked_at: string | null;
  access_confirmed_at: string | null;
  access_next_check_at: string;
  access_last_error: string | null;
  account_settings: {
    kind: WorkspaceExternalAccountProvider;
    credentials?: unknown;
    user_info?: WorkspaceExternalAccountUserInfoDto | null;
  };
  created_at: string;
  updated_at: string;
}

export interface WorkspaceExternalAccountCreateRequestBody {
  server_url: string;
  account_settings: {
    kind: "zulip";
    credentials: {
      kind: "zulip";
      login: string;
      token: string;
    };
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string";
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isWorkspaceExternalAccountDto(
  value: unknown,
): value is WorkspaceExternalAccountDto {
  if (!isRecord(value)) return false;
  const settings = value.account_settings;
  return (
    isUuid(value.uuid) &&
    isUuid(value.project_id) &&
    isUuid(value.user_uuid) &&
    isNonEmptyString(value.server_url) &&
    value.account_type === "zulip" &&
    (value.status === "new" || value.status === "active") &&
    (value.access_status === "missing_credentials" ||
      value.access_status === "confirmed" ||
      value.access_status === "invalid_credentials" ||
      value.access_status === "unavailable") &&
    isNullableString(value.source_scope) &&
    isNullableString(value.access_checked_at) &&
    isNullableString(value.access_confirmed_at) &&
    isNullableString(value.access_next_check_at) &&
    isNullableString(value.access_last_error) &&
    isRecord(settings) &&
    settings.kind === "zulip" &&
    isNonEmptyString(value.created_at) &&
    isNonEmptyString(value.updated_at)
  );
}
