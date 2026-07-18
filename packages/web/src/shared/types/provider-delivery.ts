/** Provider-owned, non-empty kind identifier. Feature UI must gate known kinds explicitly. */
export type ProviderKind = string;

export interface ProviderCapabilityDescriptor {
  available: boolean;
  revision: number;
  limits: Record<string, unknown>;
  unavailableReason?: { code: string; message: string } | null;
}

export interface ProviderSummary {
  kind: ProviderKind;
  accountUuid: string;
  externalId: string | null;
  capabilities: Record<string, ProviderCapabilityDescriptor>;
  /** Ingress lane frozen by the backend for projected provider entities. */
  deliveryClass?: "live" | "backfill";
  /** Whether this ingress item was eligible for user notifications when accepted. */
  notificationEligible?: boolean;
}

export type DeliveryStatus =
  | "pending"
  | "delivered"
  | "failed"
  | "manual_reconciliation_required"
  | "discarded";

export type DeliveryReconciliationReason =
  | "provider_history_unavailable"
  | "no_match_after_auto_resend"
  | "unsafe_provider_state";

export interface Delivery {
  externalOperationUuid: string;
  status: DeliveryStatus;
  safeError: string | null;
  canRetry: boolean;
  canDiscard: boolean;
  duplicateRisk: boolean;
  retryRequiresConfirmation: boolean;
  originalUrl: string | null;
  reconciliationReason: DeliveryReconciliationReason | null;
  updatedAt: string | null;
}

export interface ProviderDeliveryMeta {
  provider: ProviderSummary | null;
  delivery: Delivery | null;
}
