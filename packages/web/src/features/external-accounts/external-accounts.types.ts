/** Sanitized provider-neutral external-messenger resources. */

export type ExternalAccountKind = "zulip";

export type ExternalAccountStatus =
  | "connecting"
  | "backfill"
  | "live"
  | "degraded"
  | "auth_required"
  | "disconnected"
  | "suspended";

export type ExternalSelectionMode = "explicit" | "all";
export type ExternalHistoryDepth = "new" | "7_days" | "30_days" | "90_days" | "all";

export interface ExternalCapabilityUnavailableReason {
  code: string;
  message: string;
}

export interface ExternalCapability {
  available: boolean;
  revision: number;
  limits: Record<string, unknown>;
  unavailableReason?: ExternalCapabilityUnavailableReason | null;
}

export type ExternalCapabilities = Record<string, ExternalCapability>;

export interface ZulipExternalAccountSettings {
  kind: "zulip";
  serverUrl: string;
  email: string;
  selectionMode: ExternalSelectionMode;
  historyDepth: ExternalHistoryDepth;
  defaultProjectId: string;
}

export interface ZulipExternalAccount {
  uuid: string;
  settings: ZulipExternalAccountSettings;
  credentialPresent: boolean;
  status: ExternalAccountStatus;
  liveReady: boolean;
  safeError: string | null;
  capabilities: ExternalCapabilities;
  desiredGeneration: number;
  appliedGeneration: number;
  lastProgressAt: string | null;
  createdAt: string;
  updatedAt: string;
  etag: string | null;
}

export interface CreateZulipExternalAccountInput {
  uuid: string;
  serverUrl: string;
  email: string;
  apiKey: string;
  selectionMode: ExternalSelectionMode;
  historyDepth: ExternalHistoryDepth;
  defaultProjectId: string;
}

export interface UpdateZulipExternalAccountInput {
  uuid: string;
  etag: string;
  selectionMode: ExternalSelectionMode;
  historyDepth: ExternalHistoryDepth;
  defaultProjectId: string;
}

export interface ReconnectZulipExternalAccountInput {
  uuid: string;
  etag: string;
  serverUrl: string;
  email: string;
  apiKey: string;
}

export interface ZulipExternalChatSource extends Record<string, unknown> {
  kind: "zulip";
  chatType: "channel" | "direct" | "group_direct";
  originalUrl: string | null;
}

export interface ExternalChat {
  uuid: string;
  externalAccountUuid: string;
  source: ZulipExternalChatSource;
  displayName: string;
  selected: boolean;
  projectId: string | null;
  historyDepth: ExternalHistoryDepth;
  projectionStreamUuid: string | null;
  status: string;
  safeError: string | null;
  capabilities: ExternalCapabilities;
  revision: number;
  etag: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export type ExternalOperationStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "manual_reconciliation_required"
  | "discarded";

export type ExternalOperationReconciliationState =
  | "not_required"
  | "delayed_check"
  | "committed_match"
  | "automatic_resend_queued"
  | "manual_required";

export type ExternalOperationReconciliationReason =
  | "provider_history_unavailable"
  | "no_match_after_auto_resend"
  | "unsafe_provider_state";

export interface ExternalOperation {
  uuid: string;
  externalAccountUuid: string;
  action: string;
  targetType: string;
  targetUuid: string | null;
  status: ExternalOperationStatus;
  safeError: string | null;
  canRetry: boolean;
  canDiscard: boolean;
  duplicateRisk: boolean;
  retryRequiresConfirmation: boolean;
  originalUrl: string | null;
  reconciliationState: ExternalOperationReconciliationState;
  reconciliationReason: ExternalOperationReconciliationReason | null;
  reconciliationEvidence: Record<string, unknown>;
  attempt: number;
  attemptHistory: unknown[];
  details: Record<string, unknown>;
  revision: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ExternalOperationPreflightInput {
  externalAccountUuid: string;
  action: string;
  target: {
    type: string;
    uuid?: string | null;
  };
}

export interface ExternalOperationPreflightResult {
  allowed: boolean;
  action: string;
  target: {
    type: string;
    uuid: string | null;
  };
  losses: Record<string, unknown>[];
  requiresConfirmation: boolean;
}

export interface ExternalProviderLimits {
  maxAccounts: number;
  maxSelectedChatsPerAccount: number;
  maxFileBytes: number;
}

export interface ExternalProviderCustomCaBundle {
  uuid: string;
  generation: number;
  sha256: string;
  certificateCount: number;
}

export interface ExternalProviderPolicy {
  provider: ExternalAccountKind;
  enabled: boolean;
  emergencySuspended: boolean;
  limits: ExternalProviderLimits;
  customCaBundle: ExternalProviderCustomCaBundle | null;
  revision: number;
  etag: string | null;
}

export interface UpdateExternalProviderPolicyInput {
  policy: ExternalProviderPolicy;
  enabled: boolean;
  limits: ExternalProviderLimits;
  customCaCertificatesPem: string[] | null;
}

export interface ExternalProviderHealth {
  provider: ExternalAccountKind;
  status: string;
  accountCounts: Record<string, number>;
  bridgeCounts: Record<string, number>;
  operationCounts: Record<string, number>;
  metrics: Record<string, unknown>;
  updatedAt: string | null;
}

export type ExternalBridgeInstanceStatus =
  | "enrolling"
  | "active"
  | "degraded"
  | "incompatible"
  | "suspended"
  | "revoked";

export interface ExternalBridgeInstance {
  uuid: string;
  provider: ExternalAccountKind;
  identityGeneration: number;
  status: ExternalBridgeInstanceStatus;
  capabilities: Record<string, unknown>;
  lastHeartbeatAt: string | null;
  certificateNotAfter: string | null;
  safeError: string | null;
  revision: number;
}

export type ExternalAccountMutationErrorKind =
  | "forbidden"
  | "invalid"
  | "conflict"
  | "precondition"
  | "transient";

export type ExternalAccountMutationResult<T> =
  | { ok: true; value: T }
  | { ok: false; kind: ExternalAccountMutationErrorKind };
