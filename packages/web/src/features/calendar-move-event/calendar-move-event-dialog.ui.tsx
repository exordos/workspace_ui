import React, { useCallback } from "react";
import type { CalendarInfo } from "~/entities/calendar/calendar.types";
import { t } from "~/i18n/i18n";
import { AppDialog } from "~/shared/ui/app-dialog.ui";
import { Button } from "~/shared/ui/button";

export interface CalendarMoveEventDialogProps {
  open: boolean;
  calendars: CalendarInfo[];
  currentCalendarId: string | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onMove: (calendarId: string) => Promise<void>;
}

export const CalendarMoveEventDialog: React.FC<CalendarMoveEventDialogProps> = ({
  open,
  calendars,
  currentCalendarId,
  saving,
  onOpenChange,
  onMove,
}) => {
  const handleMove = useCallback(
    (calendarId: string) => () => {
      void onMove(calendarId);
    },
    [onMove],
  );

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("calendar.moveEvent")}
      showCloseButton
      maxWidthClassName="max-w-md"
    >
      <ul className="space-y-1">
        {calendars
          .filter((calendar) => calendar.id !== currentCalendarId)
          .map((calendar) => (
            <li key={calendar.id}>
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start"
                disabled={saving}
                onClick={handleMove(calendar.id)}
              >
                {calendar.displayName}
              </Button>
            </li>
          ))}
      </ul>
    </AppDialog>
  );
};
