import React from "react";
import { t } from "~/i18n/i18n";
import { getExternalMessengerSourceLabel } from "~/shared/lib/messenger-source.lib";
import type { Delivery, ProviderSummary } from "~/shared/types/provider-delivery";
import { ProviderBadgePopover } from "./provider-badge-popover.ui";

export interface ProviderDeliveryBadgeProps {
  provider?: ProviderSummary | null;
  delivery?: Delivery | null;
  className?: string;
}

const STATUS_CLASSES: Record<Delivery["status"], string> = {
  pending: "border-accent/35 bg-accent/10 text-accent",
  delivered: "border-call-green/35 bg-call-green/10 text-call-green",
  failed: "border-notice-base/35 bg-notice-base/10 text-notice-base",
  manual_reconciliation_required: "border-notice-base/35 bg-notice-base/10 text-notice-base",
  discarded: "border-border-subtle bg-bg-elevated text-text-muted",
};

export const ProviderDeliveryBadge = React.memo<ProviderDeliveryBadgeProps>(
  function ProviderDeliveryBadge({ provider, delivery, className = "" }) {
    if (provider == null || delivery == null) return null;
    const providerLabel =
      provider.kind === "zulip"
        ? (getExternalMessengerSourceLabel("zulip") ?? provider.kind)
        : provider.kind;

    const accessibleLabel = t(`providerDelivery.${delivery.status}`, {
      provider: providerLabel,
    });
    const title =
      delivery.status === "failed" && delivery.safeError != null
        ? `${accessibleLabel}: ${delivery.safeError}`
        : accessibleLabel;
    return (
      <ProviderBadgePopover
        provider={provider}
        delivery={delivery}
        label={providerLabel}
        accessibleLabel={accessibleLabel}
        title={title}
        statusClass={STATUS_CLASSES[delivery.status]}
        className={className}
        testId={`provider-delivery-${delivery.status.replaceAll("_", "-")}`}
        originalLinkTestId="provider-delivery-open-original"
      />
    );
  },
);
