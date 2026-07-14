import React from "react";
import { t } from "~/i18n/i18n";

export interface CalendarNowIndicatorProps {
  topPx: number;
  showLeadingDot?: boolean;
}

export const CalendarNowIndicator = React.memo<CalendarNowIndicatorProps>(
  function CalendarNowIndicator({ topPx, showLeadingDot = false }) {
    return (
      <div
        className="pointer-events-none absolute left-0 right-0 z-float"
        style={{ top: topPx }}
        role="presentation"
        aria-label={t("calendar.nowIndicator")}
      >
        {showLeadingDot ? (
          <span className="absolute -left-1 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-accent" />
        ) : null}
        <div className="border-t-2 border-accent" />
      </div>
    );
  },
);
