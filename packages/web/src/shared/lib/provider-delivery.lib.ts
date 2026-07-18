import type {
  Delivery,
  DeliveryStatus,
  DeliveryReconciliationReason,
  ProviderDeliveryMeta,
  ProviderSummary,
} from "~/shared/types/provider-delivery";

const DELIVERY_STATUSES = new Set<DeliveryStatus>([
  "pending",
  "delivered",
  "failed",
  "manual_reconciliation_required",
  "discarded",
]);
const RECONCILIATION_REASONS = new Set<DeliveryReconciliationReason>([
  "provider_history_unavailable",
  "no_match_after_auto_resend",
  "unsafe_provider_state",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function parseProvider(value: unknown): ProviderSummary | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const kind = typeof value.kind === "string" ? value.kind.trim() : "";
  if (
    kind.length === 0 ||
    typeof value.account_uuid !== "string" ||
    (value.external_id !== null && typeof value.external_id !== "string") ||
    !isRecord(value.capabilities)
  ) {
    return undefined;
  }
  const deliveryClass = value.delivery_class;
  const notificationEligible = value.notification_eligible;
  if (
    (deliveryClass !== undefined && deliveryClass !== "live" && deliveryClass !== "backfill") ||
    (notificationEligible !== undefined && typeof notificationEligible !== "boolean")
  ) {
    return undefined;
  }
  const capabilities: ProviderSummary["capabilities"] = {};
  for (const [name, raw] of Object.entries(value.capabilities)) {
    if (
      !isRecord(raw) ||
      typeof raw.available !== "boolean" ||
      typeof raw.revision !== "number" ||
      !Number.isSafeInteger(raw.revision) ||
      raw.revision < 1 ||
      !isRecord(raw.limits)
    ) {
      return undefined;
    }
    const unavailableReason = raw.unavailable_reason;
    if (
      unavailableReason != null &&
      (!isRecord(unavailableReason) ||
        typeof unavailableReason.code !== "string" ||
        typeof unavailableReason.message !== "string")
    ) {
      return undefined;
    }
    const unavailableReasonValue = unavailableReason as {
      code: string;
      message: string;
    } | null;
    capabilities[name] = {
      available: raw.available,
      revision: raw.revision,
      limits: raw.limits,
      unavailableReason:
        unavailableReasonValue == null
          ? null
          : { code: unavailableReasonValue.code, message: unavailableReasonValue.message },
    };
  }
  return {
    kind,
    accountUuid: value.account_uuid,
    externalId: value.external_id,
    capabilities,
    ...(deliveryClass !== undefined ? { deliveryClass } : {}),
    ...(notificationEligible !== undefined ? { notificationEligible } : {}),
  };
}

function parseDelivery(value: unknown): Delivery | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const status = value.status;
  const externalOperationUuid = value.external_operation_uuid;
  const safeError = value.safe_error;
  const updatedAt = value.updated_at;
  const reconciliationReason = value.reconciliation_reason;
  if (
    typeof externalOperationUuid !== "string" ||
    typeof status !== "string" ||
    !DELIVERY_STATUSES.has(status as DeliveryStatus) ||
    (safeError !== null && typeof safeError !== "string") ||
    typeof value.can_retry !== "boolean" ||
    typeof value.can_discard !== "boolean" ||
    typeof value.duplicate_risk !== "boolean" ||
    typeof value.retry_requires_confirmation !== "boolean" ||
    (value.original_url !== null && typeof value.original_url !== "string") ||
    (reconciliationReason !== null &&
      (typeof reconciliationReason !== "string" ||
        !RECONCILIATION_REASONS.has(reconciliationReason as DeliveryReconciliationReason))) ||
    (updatedAt !== null && typeof updatedAt !== "string")
  ) {
    return undefined;
  }
  return {
    externalOperationUuid,
    status: status as DeliveryStatus,
    safeError,
    canRetry: value.can_retry,
    canDiscard: value.can_discard,
    duplicateRisk: value.duplicate_risk,
    retryRequiresConfirmation: value.retry_requires_confirmation,
    originalUrl: value.original_url,
    reconciliationReason: reconciliationReason as DeliveryReconciliationReason | null,
    updatedAt,
  };
}

/** Parses the canonical provider metadata projection used by REST and websocket payloads. */
export function parseProviderDeliveryMeta(
  value: Record<string, unknown>,
): ProviderDeliveryMeta | undefined {
  if (!("provider" in value) || !("delivery" in value)) return undefined;
  const provider = parseProvider(value.provider);
  const delivery = parseDelivery(value.delivery);
  if (provider === undefined || delivery === undefined) return undefined;
  return { provider, delivery };
}

export function requireProviderDeliveryMeta(value: Record<string, unknown>): ProviderDeliveryMeta {
  const metadata = parseProviderDeliveryMeta(value);
  if (metadata == null) {
    throw new Error("Invalid provider delivery metadata");
  }
  return metadata;
}
