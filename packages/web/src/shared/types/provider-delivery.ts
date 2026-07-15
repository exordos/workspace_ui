export type ProviderKind = "zulip" | "mail" | "calendar";

export interface ProviderSummary {
  uuid: string;
  name: string;
  kind: ProviderKind;
}

export type DeliveryStatus = "pending" | "delivered" | "failed";

export interface Delivery {
  status: DeliveryStatus;
  safeError: string | null;
  updatedAt: string;
}

export interface ProviderDeliveryMeta {
  provider: ProviderSummary | null;
  delivery: Delivery | null;
}
