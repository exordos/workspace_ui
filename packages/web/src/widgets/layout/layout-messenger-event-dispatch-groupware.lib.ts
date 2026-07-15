/** Applies common Workspace websocket events to the local mail/calendar stores. */
import { useCalendarStore } from "~/entities/calendar/calendar.model";
import { useMailStore } from "~/entities/mail/mail.model";
import type { WorkspaceEvent } from "~/shared/types/workspace-event";

function refreshMail(): void {
  const mail = useMailStore.getState();
  void mail.loadFolders().then(() => useMailStore.getState().syncCurrentFolder());
}

function refreshCalendar(): void {
  const calendar = useCalendarStore.getState();
  const start = calendar.loadedRangeStart;
  const end = calendar.loadedRangeEnd;
  void calendar.loadCalendars().then(() => {
    if (start != null && end != null) {
      return useCalendarStore.getState().loadEventsForRange(start, end);
    }
  });
}

/** A missed epoch can affect either groupware domain, so rebuild both visible projections. */
export function refreshGroupwareAfterEventGap(): void {
  refreshMail();
  refreshCalendar();
}

export function handleCanonicalGroupwareEvent(event: WorkspaceEvent): void {
  if (event.object_type === "mail_folder" || event.object_type === "mail_message") {
    const mail = useMailStore.getState();
    if (mail.applyWorkspaceEvent(event)) return;
    refreshMail();
    return;
  }
  if (event.object_type !== "calendar" && event.object_type !== "calendar_event") return;
  const calendar = useCalendarStore.getState();
  if (calendar.applyWorkspaceEvent(event)) return;
  refreshCalendar();
}
