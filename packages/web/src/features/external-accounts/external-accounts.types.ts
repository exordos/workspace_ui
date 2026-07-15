/**
 * External messenger account bindings for the current user.
 */

export type ExternalAccountType = "zulip" | "mail" | "calendar";
export type ExternalAccountStatus = "new" | "active";
export type ExternalAccountAccessStatus =
  | "pending"
  | "missing_credentials"
  | "confirmed"
  | "invalid_credentials"
  | "unavailable";

export interface WorkspaceProvider {
  uuid: string;
  name: string;
  supportedKinds: ExternalAccountType[];
  version: string | null;
}

export interface ZulipExternalAccountUserInfo {
  kind: "zulip";
  userId: number;
  role?: number | null;
}

export interface ZulipExternalAccountSettings {
  kind: "zulip";
  login: string;
  serverUrl: string;
  userInfo?: ZulipExternalAccountUserInfo;
}

export interface ZulipExternalAccount {
  uuid: string;
  providerUuid: string;
  externalUserId?: string;
  accountType: "zulip";
  hasCredentials: boolean;
  status?: ExternalAccountStatus;
  accountSettings: ZulipExternalAccountSettings;
  createdAt?: string;
  updatedAt?: string;
}

interface GroupwareExternalAccountBase {
  uuid: string;
  providerUuid: string;
  serverUrl: string;
  status?: ExternalAccountStatus;
  accessStatus: ExternalAccountAccessStatus;
  accessLastError?: string;
}

export interface MailExternalAccount extends GroupwareExternalAccountBase {
  accountType: "mail";
  email: string;
  imapHost: string;
  imapPort: number;
  imapSecurity: "tls" | "starttls" | "plain";
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: "tls" | "starttls" | "plain";
}

export interface CalendarExternalAccount extends GroupwareExternalAccountBase {
  accountType: "calendar";
}

export interface SaveMailExternalAccountInput {
  uuid?: string;
  providerUuid: string;
  email: string;
  username: string;
  password: string;
  imapHost: string;
  imapPort: number;
  imapSecurity: "tls" | "starttls" | "plain";
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: "tls" | "starttls" | "plain";
}

export interface SaveCalendarExternalAccountInput {
  uuid?: string;
  providerUuid: string;
  serverUrl: string;
  username: string;
  password: string;
}

export type SaveGroupwareExternalAccountResult<T> =
  | { ok: true; account: T }
  | { ok: false; kind: SaveExternalAccountErrorKind };

export interface SaveZulipExternalAccountInput {
  uuid?: string;
  providerUuid: string;
  login: string;
  serverUrl: string;
  token: string;
}

export type SaveExternalAccountErrorKind = "forbidden" | "invalid" | "conflict" | "transient";

export type SaveZulipExternalAccountResult =
  | {
      ok: true;
      account: ZulipExternalAccount;
    }
  | {
      ok: false;
      kind: SaveExternalAccountErrorKind;
    };

export type UnlinkZulipExternalAccountResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      kind: SaveExternalAccountErrorKind;
    };
