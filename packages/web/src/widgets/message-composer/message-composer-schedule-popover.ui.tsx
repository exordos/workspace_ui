import React from "react";
import { t } from "~/i18n/i18n";
import { AnchoredPopover } from "~/shared/ui/anchored-popover.ui";
import { Icon } from "~/shared/ui/icon";
import type { MessageComposerSchedulePopoverProps } from "./message-composer-schedule-popover.types";

export const MessageComposerSchedulePopover = React.memo(function MessageComposerSchedulePopover({
  scheduleMenuStyle,
  options,
  onPick,
  onCloseBackdrop,
}: MessageComposerSchedulePopoverProps) {
  return (
    <AnchoredPopover
      open
      onClose={onCloseBackdrop}
      panelStyle={scheduleMenuStyle}
      panelClassName="p-1"
      ariaLabel={t("a11y.messageMenu")}
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
    </AnchoredPopover>
  );
});
