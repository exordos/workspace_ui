import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { AppDialog, DialogCancelButton } from "~/shared/ui/app-dialog.ui";
import { Button } from "~/shared/ui/button";

export type CalendarRecurrenceScope = "this" | "thisAndFuture" | "all";

export interface CalendarRecurrenceScopeDialogProps {
  open: boolean;
  action: "delete" | "edit";
  onOpenChange: (open: boolean) => void;
  onSelect: (scope: CalendarRecurrenceScope) => void;
}

export const CalendarRecurrenceScopeDialog: React.FC<CalendarRecurrenceScopeDialogProps> = ({
  open,
  action,
  onOpenChange,
  onSelect,
}) => {
  const handleThis = useCallback(() => onSelect("this"), [onSelect]);
  const handleFuture = useCallback(() => onSelect("thisAndFuture"), [onSelect]);
  const handleAll = useCallback(() => onSelect("all"), [onSelect]);
  const handleCancel = useCallback(() => onOpenChange(false), [onOpenChange]);

  const titleKey =
    action === "delete"
      ? "calendar.recurrenceScope.deleteTitle"
      : "calendar.recurrenceScope.editTitle";

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(titleKey)}
      showCloseButton
      maxWidthClassName="max-w-md"
      footer={<DialogCancelButton onClick={handleCancel}>{t("common.cancel")}</DialogCancelButton>}
    >
      <p className="mb-4 text-sm text-text-muted">{t("calendar.recurrenceScope.prompt")}</p>
      <div className="flex flex-col gap-2">
        <Button type="button" variant="ghost" onClick={handleThis}>
          {t("calendar.recurrenceScope.this")}
        </Button>
        <Button type="button" variant="ghost" onClick={handleFuture}>
          {t("calendar.recurrenceScope.thisAndFuture")}
        </Button>
        <Button type="button" variant="ghost" onClick={handleAll}>
          {t("calendar.recurrenceScope.all")}
        </Button>
      </div>
    </AppDialog>
  );
};
