/** Applies common Workspace websocket events to the local mail/calendar stores. */
import { useCalendarStore } from "~/entities/calendar/calendar.model";
import { useMailStore } from "~/entities/mail/mail.model";
import type { MessengerEvent } from "~/shared/api/messenger.types";

export function handleGroupwareEvent(event: MessengerEvent): void {
  if (event.type === "mail") {
    const mail = useMailStore.getState();
    void mail.loadFolders().then(() => useMailStore.getState().syncCurrentFolder());
    return;
  }
  if (event.type !== "calendar") return;

  const calendar = useCalendarStore.getState();
  const start = calendar.loadedRangeStart;
  const end = calendar.loadedRangeEnd;
  void calendar.loadCalendars().then(() => {
    if (start != null && end != null) {
      return useCalendarStore.getState().loadEventsForRange(start, end);
    }
  });
}
