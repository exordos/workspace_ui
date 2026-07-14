/**
 * Calendar store helpers — session invalidation and localized API errors.
 */

import { clearMailSessionFromStorage } from "~/entities/mail/mail-session-storage.lib";
import { t } from "~/i18n/i18n";
import { logStoreAction } from "~/shared/lib/logger";
import { isCalendarUnauthorizedError } from "./calendar.lib";
import type { CalendarInfo } from "./calendar.types";

export function resolveCalendarActionError(error: unknown, fallbackKey: string): string {
  if (isCalendarUnauthorizedError(error)) {
    return t("mail.sessionExpired");
  }
  return error instanceof Error ? error.message : t(fallbackKey);
}

export interface CalendarSessionInvalidatorDeps {
  emptyCalendars: CalendarInfo[];
  set: (partial: Record<string, unknown>) => void;
}

export function invalidateCalendarSessionIfUnauthorized(
  error: unknown,
  deps: CalendarSessionInvalidatorDeps,
): boolean {
  if (!isCalendarUnauthorizedError(error)) return false;
  clearMailSessionFromStorage();
  deps.set({
    calendars: deps.emptyCalendars,
    visibleCalendarIds: [],
    events: [],
    selectedEventUid: null,
    selectedRecurrenceId: null,
    focusDate: new Date(),
    viewMode: "month",
    loadingCalendars: false,
    loadingEvents: false,
    saving: false,
    error: null,
  });
  logStoreAction("calendar", "invalidateSession", { reason: "unauthorized" });
  return true;
}
