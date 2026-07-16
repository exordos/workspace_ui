import { afterEach, describe, expect, it, vi } from "vitest";
import { useCalendarStore } from "~/entities/calendar/calendar.model";
import { useMailStore } from "~/entities/mail/mail.model";
import type { WorkspaceEvent } from "~/shared/types/workspace-event";
import {
  handleCanonicalGroupwareEvent,
  refreshGroupwareAfterEventGap,
} from "./layout-messenger-event-dispatch-groupware.lib";

const mailEvent: WorkspaceEvent = {
  schema_version: 1,
  uuid: "event-1",
  epoch_version: 1,
  project_id: "project-1",
  user_uuid: "user-1",
  object_type: "mail_message",
  action: "created",
  created_at: "2026-07-15T10:00:00Z",
  updated_at: "2026-07-15T10:00:00Z",
  payload: { kind: "mail.message.created" },
};

const calendarEvent: WorkspaceEvent = {
  ...mailEvent,
  uuid: "event-2",
  epoch_version: 2,
  object_type: "calendar_event",
  action: "updated",
  payload: { kind: "calendar.event.updated" },
};

describe("handleCanonicalGroupwareEvent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useCalendarStore.setState({ loadedRangeStart: null, loadedRangeEnd: null });
  });

  it("does not refetch mail or calendar after a complete payload is applied", () => {
    const mail = useMailStore.getState();
    const calendar = useCalendarStore.getState();
    vi.spyOn(mail, "applyWorkspaceEvent").mockReturnValue(true);
    const loadFolders = vi.spyOn(mail, "loadFolders");
    vi.spyOn(calendar, "applyWorkspaceEvent").mockReturnValue(true);
    const loadCalendars = vi.spyOn(calendar, "loadCalendars");

    handleCanonicalGroupwareEvent(mailEvent);
    handleCanonicalGroupwareEvent(calendarEvent);

    expect(loadFolders).not.toHaveBeenCalled();
    expect(loadCalendars).not.toHaveBeenCalled();
  });

  it("routes collection object types to their matching domain", () => {
    const mail = useMailStore.getState();
    const calendar = useCalendarStore.getState();
    const applyMail = vi.spyOn(mail, "applyWorkspaceEvent").mockReturnValue(true);
    const applyCalendar = vi.spyOn(calendar, "applyWorkspaceEvent").mockReturnValue(true);

    handleCanonicalGroupwareEvent({
      ...mailEvent,
      object_type: "mail_folder",
      payload: { kind: "mail.folder.updated" },
    });
    handleCanonicalGroupwareEvent({
      ...calendarEvent,
      object_type: "calendar",
      payload: { kind: "calendar.calendar.updated" },
    });

    expect(applyMail).toHaveBeenCalledOnce();
    expect(applyCalendar).toHaveBeenCalledOnce();
  });

  it("refetches mail after an incomplete payload", async () => {
    const mail = useMailStore.getState();
    vi.spyOn(mail, "applyWorkspaceEvent").mockReturnValue(false);
    const loadFolders = vi.spyOn(mail, "loadFolders").mockResolvedValue();
    const syncCurrentFolder = vi.spyOn(mail, "syncCurrentFolder").mockResolvedValue();

    handleCanonicalGroupwareEvent(mailEvent);
    await Promise.resolve();
    await Promise.resolve();

    expect(loadFolders).toHaveBeenCalledOnce();
    expect(syncCurrentFolder).toHaveBeenCalledOnce();
  });

  it("refetches the loaded calendar range after an incomplete payload", async () => {
    useCalendarStore.setState({
      loadedRangeStart: "2026-07-01T00:00:00Z",
      loadedRangeEnd: "2026-07-31T23:59:59Z",
    });
    const calendar = useCalendarStore.getState();
    vi.spyOn(calendar, "applyWorkspaceEvent").mockReturnValue(false);
    const loadCalendars = vi.spyOn(calendar, "loadCalendars").mockResolvedValue();
    const loadEventsForRange = vi.spyOn(calendar, "loadEventsForRange").mockResolvedValue();

    handleCanonicalGroupwareEvent(calendarEvent);
    await Promise.resolve();
    await Promise.resolve();

    expect(loadCalendars).toHaveBeenCalledOnce();
    expect(loadEventsForRange).toHaveBeenCalledWith("2026-07-01T00:00:00Z", "2026-07-31T23:59:59Z");
  });

  it("refetches both domains after an event gap", async () => {
    const mail = useMailStore.getState();
    const calendar = useCalendarStore.getState();
    const loadFolders = vi.spyOn(mail, "loadFolders").mockResolvedValue();
    vi.spyOn(mail, "syncCurrentFolder").mockResolvedValue();
    const loadCalendars = vi.spyOn(calendar, "loadCalendars").mockResolvedValue();

    refreshGroupwareAfterEventGap();
    await Promise.resolve();
    await Promise.resolve();

    expect(loadFolders).toHaveBeenCalledOnce();
    expect(loadCalendars).toHaveBeenCalledOnce();
  });

  it("does not touch groupware stores in messenger-only mode", async () => {
    const mail = useMailStore.getState();
    const calendar = useCalendarStore.getState();
    const applyMail = vi.spyOn(mail, "applyWorkspaceEvent");
    const loadFolders = vi.spyOn(mail, "loadFolders");
    const applyCalendar = vi.spyOn(calendar, "applyWorkspaceEvent");
    const loadCalendars = vi.spyOn(calendar, "loadCalendars");

    handleCanonicalGroupwareEvent(mailEvent, true);
    handleCanonicalGroupwareEvent(calendarEvent, true);
    refreshGroupwareAfterEventGap(true);
    await Promise.resolve();

    expect(applyMail).not.toHaveBeenCalled();
    expect(loadFolders).not.toHaveBeenCalled();
    expect(applyCalendar).not.toHaveBeenCalled();
    expect(loadCalendars).not.toHaveBeenCalled();
  });
});
