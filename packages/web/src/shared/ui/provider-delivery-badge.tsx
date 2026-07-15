import React from "react";
import { t } from "~/i18n/i18n";
import type { Delivery, ProviderSummary } from "~/shared/types/provider-delivery";

export interface ProviderDeliveryBadgeProps {
  provider?: ProviderSummary | null;
  delivery?: Delivery | null;
  className?: string;
}

const STATUS_CLASSES: Record<Delivery["status"], string> = {
  pending: "border-accent/35 bg-accent/10 text-accent",
  delivered: "border-call-green/35 bg-call-green/10 text-call-green",
  failed: "border-notice-base/35 bg-notice-base/10 text-notice-base",
};

export const ProviderDeliveryBadge = React.memo<ProviderDeliveryBadgeProps>(
  function ProviderDeliveryBadge({ provider, delivery, className = "" }) {
    if (provider == null || delivery == null) return null;

    const accessibleLabel = t(`providerDelivery.${delivery.status}`, {
      provider: provider.name,
    });
    const title =
      delivery.status === "failed" && delivery.safeError != null
        ? `${accessibleLabel}: ${delivery.safeError}`
        : accessibleLabel;

    return (
      <span
        className={`inline-flex h-4 max-w-24 shrink-0 items-center truncate rounded-sm border px-1 text-[10px] font-semibold leading-none ${STATUS_CLASSES[delivery.status]} ${className}`.trim()}
        title={title}
        aria-label={accessibleLabel}
        data-testid={`provider-delivery-${delivery.status}`}
      >
        {provider.name}
      </span>
    );
  },
);
