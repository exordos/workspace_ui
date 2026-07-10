import React, { useCallback, useEffect, useState } from "react";
import type { CalendarInfo } from "~/entities/calendar/calendar.types";
import { t } from "~/i18n/i18n";
import { AppDialog, AppDialogFormFooter } from "~/shared/ui/app-dialog.ui";

export interface CalendarRenameDialogProps {
  open: boolean;
  calendar: CalendarInfo | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (displayName: string, color: string | null) => Promise<void>;
}

export const CalendarRenameDialog: React.FC<CalendarRenameDialogProps> = ({
  open,
  calendar,
  saving,
  onOpenChange,
  onSubmit,
}) => {
  const [displayName, setDisplayName] = useState("");
  const [color, setColor] = useState("");

  useEffect(() => {
    if (open && calendar != null) {
      setDisplayName(calendar.displayName);
      setColor(calendar.color ?? "");
    }
  }, [calendar, open]);

  const handleSubmit = useCallback(() => {
    const trimmed = displayName.trim();
    if (trimmed.length === 0) return;
    void onSubmit(trimmed, color.trim().length > 0 ? color.trim() : null);
  }, [color, displayName, onSubmit]);

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("calendar.renameCalendar")}
      footer={
        <AppDialogFormFooter
          cancelLabel={t("common.cancel")}
          onCancel={() => onOpenChange(false)}
          onSubmit={handleSubmit}
          submitLabel={t("common.save")}
          isSubmitting={saving}
          submitDisabled={displayName.trim().length === 0}
        />
      }
    >
      <div className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block text-text-muted">{t("calendar.calendar")}</span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-text-muted">{t("calendar.color")}</span>
          <input
            type="text"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="#FF8438"
            className="w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary"
          />
        </label>
      </div>
    </AppDialog>
  );
};
