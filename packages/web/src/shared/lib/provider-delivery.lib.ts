import type {
  Delivery,
  DeliveryStatus,
  ProviderDeliveryMeta,
  ProviderKind,
  ProviderSummary,
} from "~/shared/types/provider-delivery";

const PROVIDER_KINDS = new Set<ProviderKind>(["zulip", "mail", "calendar"]);
const DELIVERY_STATUSES = new Set<DeliveryStatus>(["pending", "delivered", "failed"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function parseProvider(value: unknown): ProviderSummary | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const { uuid, name, kind } = value;
  if (
    typeof uuid !== "string" ||
    typeof name !== "string" ||
    typeof kind !== "string" ||
    !PROVIDER_KINDS.has(kind as ProviderKind)
  ) {
    return undefined;
  }
  return { uuid, name, kind: kind as ProviderKind };
}

function parseDelivery(value: unknown): Delivery | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const status = value.status;
  const safeError = value.safe_error;
  const updatedAt = value.updated_at;
  if (
    typeof status !== "string" ||
    !DELIVERY_STATUSES.has(status as DeliveryStatus) ||
    (safeError !== null && typeof safeError !== "string") ||
    typeof updatedAt !== "string"
  ) {
    return undefined;
  }
  return {
    status: status as DeliveryStatus,
    safeError,
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
