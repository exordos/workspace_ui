import React from "react";
import { t } from "~/i18n/i18n";
import type { MessengerSourceName } from "~/shared/api/messenger.types";
import { getExternalMessengerSourceLabel } from "~/shared/lib/messenger-source.lib";

export interface ExternalSourceBadgeProps {
  sourceName?: MessengerSourceName;
  className?: string;
}

export const ExternalSourceBadge = React.memo<ExternalSourceBadgeProps>(
  function ExternalSourceBadge({ sourceName, className = "" }) {
    const label = getExternalMessengerSourceLabel(sourceName);
    if (label == null) return null;

    const accessibleLabel = t("source.externalFrom", { source: label });

    return (
      <span
        className={`border-accent/35 bg-accent/10 inline-flex h-4 max-w-[64px] flex-shrink-0 items-center rounded-sm border px-1 text-[10px] font-semibold leading-none text-text-secondary ${className}`.trim()}
        title={accessibleLabel}
        aria-label={accessibleLabel}
        data-testid={`external-source-${sourceName}`}
      >
        {label}
      </span>
    );
  },
);
