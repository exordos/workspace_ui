export type ExternalAccountType = "zulip";
export type ExternalAccountStatus =
  | "connecting"
  | "backfill"
  | "live"
  | "degraded"
  | "auth_required"
  | "disconnected"
  | "suspended";
export type ExternalAccountSelectionMode = "explicit" | "all";
export type ExternalAccountHistoryDepth = "new" | "7_days" | "30_days" | "90_days" | "all";
export type ExternalAccountLoadStatus = "idle" | "loading" | "ready" | "error";

export interface ExternalAccount {
  uuid: string;
  serverUrl: string;
  email: string;
  accountType: ExternalAccountType;
  selectionMode: ExternalAccountSelectionMode;
  historyDepth: ExternalAccountHistoryDepth;
  defaultProjectId: string;
  credentialPresent: boolean;
  status: ExternalAccountStatus;
  liveReady: boolean;
  capabilities: Record<string, unknown>;
  safeError: string | null;
  desiredGeneration: number;
  appliedGeneration: number;
  lastProgressAt: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
