import React from "react";
import { t } from "~/i18n/i18n";
import {
  chatBottomNoticeActionButtonClassName,
  chatBottomNoticeBarClassName,
  chatBottomNoticeMarkerClassName,
} from "~/shared/lib/chat-bottom-notice-bar.lib";
import type { ChatPageSelectionBarProps } from "./chat-page-selection-bar.types";

export const ChatPageSelectionBar = React.memo(function ChatPageSelectionBar({
  selectedCount,
  forwardDisabled,
  deleteDisabled,
  onForward,
  onDelete,
  onCancel,
  joinedAbove = false,
  joinedBelow = false,
}: ChatPageSelectionBarProps) {
  if (selectedCount <= 0) return null;

  return (
    <div
      className={chatBottomNoticeBarClassName({
        joinedAbove,
        joinedBelow,
        paddingX: "wide",
        paddingY: "alert",
        className: "relative justify-between",
      })}
      role="toolbar"
      aria-label={t("message.selectedCount", { count: selectedCount })}
    >
      <span
        className={`absolute bottom-2.5 left-0 top-2.5 w-1 rounded-r-full ${chatBottomNoticeMarkerClassName("info")}`}
        data-notice-marker="info"
        aria-hidden
      />
      <span className="pl-1 text-base font-semibold text-text-primary">
        {t("message.selected", { count: selectedCount })}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={chatBottomNoticeActionButtonClassName("info")}
          disabled={forwardDisabled}
          onClick={onForward}
        >
          {t("message.forward")}
        </button>
        {/* Bulk delete is not wired yet (no batch API); hide until deleteDisabled becomes false. */}
        {!deleteDisabled ? (
          <button
            type="button"
            className={chatBottomNoticeActionButtonClassName("danger")}
            onClick={onDelete}
          >
            {t("common.delete")}
          </button>
        ) : null}
        <button
          type="button"
          className={chatBottomNoticeActionButtonClassName("neutral", { transparent: true })}
          onClick={onCancel}
        >
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
});
