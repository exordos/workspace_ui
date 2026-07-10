export type ExternalAccountUuid = string;
export type ExternalAccountType = "zulip" | "iam";
export type ExternalAccountStatus = "new" | "active";
export type ExternalAccountAccessStatus =
  | "missing_credentials"
  | "confirmed"
  | "invalid_credentials"
  | "unavailable";
export type ExternalAccountLoadStatus = "idle" | "loading" | "ready" | "error";

export interface ExternalAccountUserInfo {
  userId: number | null;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
}

export interface ExternalAccount {
  uuid: ExternalAccountUuid;
  projectId: string;
  userUuid: string;
  serverUrl: string;
  sourceScope: string | null;
  accountType: ExternalAccountType;
  status: ExternalAccountStatus;
  accessStatus: ExternalAccountAccessStatus;
  accessCheckedAt: string | null;
  accessConfirmedAt: string | null;
  accessNextCheckAt: string;
  accessLastError: string | null;
  accountSettingsKind: ExternalAccountType;
  userInfo: ExternalAccountUserInfo | null;
  createdAt: string;
  updatedAt: string;
}
