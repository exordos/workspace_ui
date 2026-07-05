/**
 * External messenger account bindings for the current user.
 */

export type ExternalAccountType = "zulip";
export type ExternalAccountStatus = "new" | "active";

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
  externalUserId?: string;
  accountType: ExternalAccountType;
  status?: ExternalAccountStatus;
  accountSettings: ZulipExternalAccountSettings;
  createdAt?: string;
  updatedAt?: string;
}

export interface SaveZulipExternalAccountInput {
  uuid?: string;
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
