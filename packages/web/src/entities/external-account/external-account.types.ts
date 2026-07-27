import type {
  WorkspaceExternalAccountHistoryDepth,
  WorkspaceExternalAccountSelectionMode,
  WorkspaceExternalAccountStatus,
} from "~/shared/api/messenger-external-accounts.types";

export type ExternalAccountUuid = string;
export type ExternalAccountProvider = "zulip";
export type ExternalAccountStatus = WorkspaceExternalAccountStatus;
export type ExternalAccountSelectionMode = WorkspaceExternalAccountSelectionMode;
export type ExternalAccountHistoryDepth = WorkspaceExternalAccountHistoryDepth;
export type ExternalAccountLoadStatus = "idle" | "loading" | "ready" | "error";

export interface ExternalAccountSettings {
  kind: "zulip";
  serverUrl: string;
  email: string;
  selectionMode: ExternalAccountSelectionMode;
  historyDepth: ExternalAccountHistoryDepth;
  defaultProjectId: string;
}

export interface ExternalAccount {
  uuid: ExternalAccountUuid;
  provider: ExternalAccountProvider;
  settings: ExternalAccountSettings;
  credentialPresent: boolean;
  status: ExternalAccountStatus;
  liveReady: boolean;
  capabilities: Readonly<Record<string, unknown>>;
  safeError: string | null;
  desiredGeneration: number;
  appliedGeneration: number;
  lastProgressAt: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  etag: string;
}
