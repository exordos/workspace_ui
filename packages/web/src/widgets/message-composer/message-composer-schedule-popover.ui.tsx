import React from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import type { MessageComposerSchedulePopoverProps } from "./message-composer-schedule-popover.types";

export const MessageComposerSchedulePopover = React.memo(function MessageComposerSchedulePopover({
  scheduleMenuStyle,
  options,
  onPick,
  onCloseBackdrop,
}: MessageComposerSchedulePopoverProps) {
  return (
    <>
      <div className="fixed inset-0 z-dropdown" aria-hidden onClick={onCloseBackdrop} />
      <div
        className="fixed z-modal overflow-hidden rounded-xl border border-border-subtle bg-bg-elevated p-1 shadow-xl"
        style={scheduleMenuStyle}
        role="dialog"
        aria-label={t("a11y.messageMenu")}
      >
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-text-primary hover:bg-bg"
            onClick={() => {
              onPick(option.resolveSendAt(Date.now()));
            }}
          >
            <Icon name="calendar" size={14} className="text-text-muted" />
            <span className="truncate">{option.label}</span>
          </button>
        ))}
      </div>
    </>
  );
});
