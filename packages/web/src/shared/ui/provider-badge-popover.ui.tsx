import React, { useCallback, useMemo, useRef } from "react";
import { t } from "~/i18n/i18n";
import { isValidUrl } from "~/shared/lib/validation";
import type { Delivery, ProviderSummary } from "~/shared/types/provider-delivery";

export interface ProviderBadgePopoverProps {
  provider: ProviderSummary;
  delivery?: Delivery | null;
  label: string;
  accessibleLabel: string;
  title: string;
  statusClass: string;
  originalUrl?: string | null;
  className?: string;
  testId: string;
  originalLinkTestId?: string;
}

function deliveryStatusLabel(
  providerLabel: string,
  provider: ProviderSummary,
  delivery?: Delivery | null,
) {
  if (delivery != null) {
    return t(`providerDelivery.${delivery.status}`, { provider: providerLabel });
  }
  if (provider.deliveryClass === "backfill") return t("providerBadge.backfill");
  if (provider.deliveryClass === "live") return t("providerBadge.live");
  return t("providerBadge.connected");
}

/** Compact provider trigger with a keyboard-accessible native details popover. */
export const ProviderBadgePopover = React.memo<ProviderBadgePopoverProps>(
  function ProviderBadgePopover({
    provider,
    delivery,
    label,
    accessibleLabel,
    title,
    statusClass,
    originalUrl,
    className = "",
    testId,
    originalLinkTestId,
  }) {
    const detailsRef = useRef<HTMLDetailsElement>(null);
    const safeOriginalUrl = useMemo(() => {
      const candidate = delivery?.originalUrl ?? originalUrl ?? null;
      return candidate != null && isValidUrl(candidate) ? candidate : null;
    }, [delivery?.originalUrl, originalUrl]);
    const statusLabel = deliveryStatusLabel(label, provider, delivery);
    const toggle = useCallback((event: React.MouseEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (detailsRef.current != null) {
        detailsRef.current.open = !detailsRef.current.open;
      }
    }, []);

    return (
      <details
        ref={detailsRef}
        className={`relative inline-flex shrink-0 ${className}`.trim()}
        data-testid={testId}
        title={title}
      >
        <summary
          className={`inline-flex h-4 max-w-24 cursor-pointer list-none items-center truncate rounded-sm border px-1 text-[10px] font-semibold leading-none ${statusClass}`}
          title={title}
          aria-label={accessibleLabel}
          aria-haspopup="dialog"
          onClick={toggle}
        >
          {label}
        </summary>
        <div
          role="dialog"
          aria-label={t("providerBadge.details", { provider: label })}
          className="absolute right-0 top-full z-dropdown mt-1 min-w-64 rounded-lg border border-border-subtle bg-card-bg p-3 text-xs text-text-secondary shadow-lg"
        >
          <p className="font-semibold text-text-primary">{label}</p>
          <dl className="mt-2 space-y-1">
            <div>
              <dt className="inline font-medium text-text-primary">
                {t("providerBadge.account")}:{" "}
              </dt>
              <dd className="inline break-all">{provider.accountUuid}</dd>
            </div>
            <div>
              <dt className="inline font-medium text-text-primary">
                {t("providerBadge.status")}:{" "}
              </dt>
              <dd className="inline">{statusLabel}</dd>
            </div>
          </dl>
          {delivery?.safeError != null && (
            <p className="mt-2 text-notice-base">{delivery.safeError}</p>
          )}
          {safeOriginalUrl != null && (
            <a
              className="mt-2 block text-accent underline"
              href={safeOriginalUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
              data-testid={originalLinkTestId ?? `${testId}-open-original`}
            >
              {t("settings.externalOperationOpenOriginal")}
            </a>
          )}
        </div>
      </details>
    );
  },
);
