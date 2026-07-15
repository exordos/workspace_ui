import React, { useCallback, useRef } from "react";
import { t } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import { Icon } from "~/shared/ui/icon";
import { SearchInput } from "~/shared/ui/search-input";
import type { CalendarToolbarProps } from "./calendar-toolbar.types";

export const CalendarToolbar: React.FC<CalendarToolbarProps> = ({
  viewMode,
  title,
  searchQuery,
  onSearchChange,
  onImportIcs,
  onViewModeChange,
  onPrev,
  onNext,
  onToday,
  onToggleSidebar,
  onNewEvent,
}) => {
  const setMonth = useCallback(() => onViewModeChange("month"), [onViewModeChange]);
  const setWeek = useCallback(() => onViewModeChange("week"), [onViewModeChange]);
  const setDay = useCallback(() => onViewModeChange("day"), [onViewModeChange]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file != null) onImportIcs(file);
      event.target.value = "";
    },
    [onImportIcs],
  );

  return (
    <header
      className="relative z-sticky mb-3 flex min-w-0 shrink-0 flex-wrap items-center gap-2"
      role="toolbar"
      aria-label={title}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="w-8 shrink-0 px-0 lg:hidden"
          onClick={onToggleSidebar}
          aria-label={t("calendar.myCalendars")}
          aria-controls="calendar-sidebar"
        >
          <Icon name="calendar" size={17} />
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onToday}>
          {t("calendar.today")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="w-8 px-0"
          onClick={onPrev}
          aria-label={t("calendar.prev")}
        >
          <Icon name="chevron-right" size={16} className="rotate-180" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="w-8 px-0"
          onClick={onNext}
          aria-label={t("calendar.next")}
        >
          <Icon name="chevron-right" size={16} />
        </Button>
        <h1 className="ml-1 min-w-20 flex-1 truncate text-base font-semibold text-text-primary sm:text-lg">
          {title}
        </h1>
      </div>
      <div className="order-3 flex min-w-0 basis-full flex-wrap items-center gap-2 md:order-none md:basis-auto md:flex-nowrap">
        <SearchInput
          value={searchQuery}
          onChange={onSearchChange}
          placeholder={t("calendar.searchPlaceholder")}
          ariaLabel={t("calendar.searchPlaceholder")}
          size="sm"
          clearable
          iconPosition="left"
          className="min-w-32 basis-full sm:flex-1 sm:basis-auto md:w-48 lg:w-56"
        />
        <div
          className="flex shrink-0 rounded-lg border border-border-subtle bg-card-bg p-0.5"
          role="group"
        >
          <Button
            type="button"
            size="sm"
            variant={viewMode === "month" ? "primary" : "ghost"}
            onClick={setMonth}
            aria-pressed={viewMode === "month"}
            className="px-2.5"
          >
            {t("calendar.viewMonth")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === "week" ? "primary" : "ghost"}
            onClick={setWeek}
            aria-pressed={viewMode === "week"}
            className="px-2.5"
          >
            {t("calendar.viewWeek")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === "day" ? "primary" : "ghost"}
            onClick={setDay}
            aria-pressed={viewMode === "day"}
            className="px-2.5"
          >
            {t("calendar.viewDay")}
          </Button>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="w-8 shrink-0 px-0 lg:w-auto lg:px-2"
          onClick={handleImportClick}
          aria-label={t("calendar.importIcs")}
        >
          <Icon name="files" size={16} />
          <span className="hidden lg:inline">{t("calendar.importIcs")}</span>
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".ics,text/calendar"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          size="sm"
          variant="primary"
          onClick={onNewEvent}
          className="shrink-0 gap-1.5 px-3 text-on-accent hover:opacity-90"
          aria-label={t("calendar.newEvent")}
        >
          <Icon name="plus" size={16} className="text-on-accent" />
          <span className="hidden sm:inline">{t("calendar.newEvent")}</span>
        </Button>
      </div>
    </header>
  );
};
