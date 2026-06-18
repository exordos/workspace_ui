import React from "react";
import { t } from "~/i18n/i18n";
import { chatBottomNoticeBarClassName } from "~/shared/lib/chat-bottom-notice-bar.lib";
import type { ChatPageDeleteConfirmBarProps } from "./chat-page-delete-confirm-bar.types";

export const ChatPageDeleteConfirmBar = React.memo(function ChatPageDeleteConfirmBar({
  mode,
  bulkCount,
  onConfirm,
  onCancel,
}: ChatPageDeleteConfirmBarProps) {
  return (
    <div
      className={chatBottomNoticeBarClassName({ gap: "3" })}
      role="alertdialog"
      aria-label={t("message.deleteConfirm")}
    >
      <span className="flex-1 text-sm text-text-primary">
        {mode === "bulk" && bulkCount != null
          ? t("message.deleteSelectedConfirm", { count: bulkCount })
          : t("message.deleteConfirm")}
      </span>
      <button
        type="button"
        className="hover:bg-notice-base/90 rounded-lg bg-notice-base px-3 py-1 text-sm text-badge-text"
        onClick={onConfirm}
      >
        {t("message.delete")}
      </button>
      <button
        type="button"
        className="rounded-lg px-3 py-1 text-sm text-text-muted hover:text-text-primary"
        onClick={onCancel}
      >
        {t("common.cancel")}
      </button>
    </div>
  );
});
