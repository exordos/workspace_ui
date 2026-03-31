import React from "react";
import { t } from "~/i18n/i18n";
import { EmbedFrame, isEmbedAllowed } from "~/shared/lib/embed";
import { env } from "~/shared/lib/env";
import { Icon } from "~/shared/ui/icon";

function resolveEmbedUrl(configuredUrl: string, fallbackPath: string): string {
  const configured = configuredUrl.trim();
  if (typeof window === "undefined") {
    return configured;
  }
  const canResolveRelative =
    window.location.protocol === "http:" || window.location.protocol === "https:";
  if (configured.length > 0) {
    if (!canResolveRelative) {
      return configured;
    }
    try {
      return new URL(configured, window.location.origin).toString();
    } catch {
      return configured;
    }
  }
  if (!canResolveRelative) {
    return "";
  }

  const basePath = env.BASE_URL === "./" ? "/" : env.BASE_URL;
  const baseUrl = new URL(basePath, window.location.origin);
  return new URL(fallbackPath, baseUrl).toString();
}

export const CalendarPage: React.FC = () => {
  const calendarUrl = resolveEmbedUrl(env.CALENDAR_EMBED_URL, "embeds/calendar-placeholder.html");
  const fallback = (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-text-muted">
      <Icon name="calendar" size={64} className="opacity-50" />
      <h2 className="text-xl font-medium text-text-primary">{t("nav.calendar")}</h2>
      <p className="max-w-lg text-center text-sm">{t("app.webModeUnavailable")}</p>
    </div>
  );

  if (calendarUrl.length === 0 || !isEmbedAllowed(calendarUrl)) {
    return fallback;
  }

  return (
    <div className="flex h-full min-h-0 flex-1 p-3">
      <EmbedFrame
        url={calendarUrl}
        title={t("nav.calendar")}
        sandbox="interactive"
        className="h-full w-full overflow-hidden rounded-lg border border-border-subtle bg-bg"
        fallback={fallback}
      />
    </div>
  );
};
