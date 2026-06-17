import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import { Icon } from "~/shared/ui/icon";
import type { CalendarToolbarProps } from "./calendar-toolbar.types";

export const CalendarToolbar: React.FC<CalendarToolbarProps> = ({
  viewMode,
  title,
  onViewModeChange,
  onPrev,
  onNext,
  onToday,
  onNewEvent,
  onSignOut,
}) => {
  const setMonth = useCallback(() => onViewModeChange("month"), [onViewModeChange]);
  const setWeek = useCallback(() => onViewModeChange("week"), [onViewModeChange]);
  const setDay = useCallback(() => onViewModeChange("day"), [onViewModeChange]);

  return (
    <header className="relative z-sticky mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <h1 className="truncate text-lg font-medium text-text-primary">{title}</h1>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onPrev}
            aria-label={t("calendar.prev")}
          >
            <Icon name="chevron-right" size={16} className="rotate-180" />
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onToday}>
            {t("calendar.today")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onNext}
            aria-label={t("calendar.next")}
          >
            <Icon name="chevron-right" size={16} />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border-subtle p-0.5">
          <Button
            type="button"
            size="sm"
            variant={viewMode === "month" ? "primary" : "ghost"}
            onClick={setMonth}
          >
            {t("calendar.viewMonth")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === "week" ? "primary" : "ghost"}
            onClick={setWeek}
          >
            {t("calendar.viewWeek")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === "day" ? "primary" : "ghost"}
            onClick={setDay}
          >
            {t("calendar.viewDay")}
          </Button>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onSignOut}>
          {t("mail.signOut")}
        </Button>
        <Button type="button" size="sm" variant="primary" onClick={onNewEvent} className="gap-1.5">
          <Icon name="calendar" size={16} className="text-on-accent" />
          {t("calendar.newEvent")}
        </Button>
      </div>
    </header>
  );
};
