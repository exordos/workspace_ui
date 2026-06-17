import React from "react";
import { isCalendarApiConfigured } from "~/entities/calendar/calendar.lib";
import { t } from "~/i18n/i18n";
import { env } from "~/shared/lib/env";
import { Icon } from "~/shared/ui/icon";
import { CalendarView } from "~/widgets/calendar-view/calendar-view.ui";
import { useCalendarPageBootstrap } from "./calendar-page.hook";

export const CalendarPage: React.FC = () => {
  useCalendarPageBootstrap();

  if (!isCalendarApiConfigured(env.MAIL_API_ORIGIN)) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-text-muted">
        <Icon name="calendar" size={64} className="opacity-50" />
        <h2 className="text-xl font-medium text-text-primary">{t("nav.calendar")}</h2>
        <p className="max-w-lg text-center text-sm">{t("calendar.notConfigured")}</p>
      </div>
    );
  }

  return <CalendarView />;
};
