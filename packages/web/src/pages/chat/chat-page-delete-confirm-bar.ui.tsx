import React from "react";
import { t } from "~/i18n/i18n";
import {
  chatBottomNoticeActionButtonClassName,
  chatBottomNoticeBarClassName,
  chatBottomNoticeMarkerClassName,
} from "~/shared/lib/chat-bottom-notice-bar.lib";
import type { ChatPageDeleteConfirmBarProps } from "./chat-page-delete-confirm-bar.types";

export const ChatPageDeleteConfirmBar = React.memo(function ChatPageDeleteConfirmBar({
  mode,
  bulkCount,
  onConfirm,
  onCancel,
  joinedAbove = false,
  joinedBelow = false,
}: ChatPageDeleteConfirmBarProps) {
  return (
    <div
      className={chatBottomNoticeBarClassName({
        joinedAbove,
        joinedBelow,
        paddingX: "wide",
        paddingY: "alert",
        className: "relative flex-wrap sm:flex-nowrap",
      })}
      role="alertdialog"
      aria-label={t("message.deleteConfirm")}
    >
      <span
        className={`absolute bottom-2.5 left-0 top-2.5 w-1 rounded-r-full ${chatBottomNoticeMarkerClassName("danger")}`}
        data-notice-marker="danger"
        aria-hidden
      />
      <span className="min-w-48 flex-1 pl-1">
        <span className="block text-base font-semibold text-text-primary">
          {mode === "bulk" && bulkCount != null
            ? t("message.deleteSelectedConfirm", { count: bulkCount })
            : t("message.deleteConfirm")}
        </span>
        <span className="mt-1 block text-sm text-text-muted">{t("message.deleteCannotUndo")}</span>
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-2">
        <button
          type="button"
          className={chatBottomNoticeActionButtonClassName("danger")}
          onClick={onConfirm}
        >
          {t("message.delete")}
        </button>
        <button
          type="button"
          className={chatBottomNoticeActionButtonClassName("neutral", { transparent: true })}
          onClick={onCancel}
        >
          {t("common.cancel")}
        </button>
      </span>
    </div>
  );
});
