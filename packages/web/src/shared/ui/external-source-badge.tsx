import React from "react";
import { t } from "~/i18n/i18n";
import type { MessengerSource, MessengerSourceName } from "~/shared/api/messenger.types";
import { getExternalMessengerSourceLabel } from "~/shared/lib/messenger-source.lib";
import type { Delivery, ProviderSummary } from "~/shared/types/provider-delivery";
import { ProviderBadgePopover } from "./provider-badge-popover.ui";

export interface ExternalSourceBadgeProps {
  sourceName?: MessengerSourceName;
  source?: MessengerSource;
  provider?: ProviderSummary | null;
  delivery?: Delivery | null;
  className?: string;
}

const DELIVERY_CLASSES: Record<Delivery["status"], string> = {
  pending: "border-accent/35 bg-accent/10 text-accent",
  delivered: "border-call-green/35 bg-call-green/10 text-call-green",
  failed: "border-notice-base/35 bg-notice-base/10 text-notice-base",
  manual_reconciliation_required: "border-notice-base/35 bg-notice-base/10 text-notice-base",
  discarded: "border-border-subtle bg-bg-elevated text-text-muted",
};

export const ExternalSourceBadge = React.memo<ExternalSourceBadgeProps>(
  function ExternalSourceBadge({ sourceName, source, provider, delivery, className = "" }) {
    const label =
      provider == null
        ? getExternalMessengerSourceLabel(sourceName)
        : provider.kind === "zulip"
          ? getExternalMessengerSourceLabel("zulip")
          : provider.kind;
    if (label == null) return null;

    const accessibleLabel =
      delivery == null
        ? t("source.externalFrom", { source: label })
        : t(`providerDelivery.${delivery.status}`, { provider: label });
    const title =
      delivery?.status === "failed" && delivery.safeError != null
        ? `${accessibleLabel}: ${delivery.safeError}`
        : accessibleLabel;
    const statusClass =
      delivery == null ? "border-accent/35 bg-accent/10" : DELIVERY_CLASSES[delivery.status];
    const providerKind = provider?.kind ?? sourceName;

    if (provider != null) {
      const sourceOriginalUrl =
        delivery?.originalUrl ??
        (typeof source?.original_url === "string" ? source.original_url : null);
      return (
        <ProviderBadgePopover
          provider={provider}
          delivery={delivery}
          label={label}
          accessibleLabel={accessibleLabel}
          title={title}
          statusClass={`${statusClass} text-text-secondary`}
          originalUrl={sourceOriginalUrl}
          className={className}
          testId={`external-source-${providerKind ?? "unknown"}`}
        />
      );
    }

    return (
      <span
        className={`${statusClass} inline-flex h-4 max-w-[64px] flex-shrink-0 items-center rounded-sm border px-1 text-[10px] font-semibold leading-none text-text-secondary ${className}`.trim()}
        title={title}
        aria-label={accessibleLabel}
        data-testid={`external-source-${providerKind ?? "unknown"}`}
      >
        {label}
      </span>
    );
  },
);
