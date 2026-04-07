import React from "react";
import { t } from "~/i18n/i18n";
import type { ChatPageSelectionBarProps } from "./chat-page-selection-bar.types";

export const ChatPageSelectionBar = React.memo(function ChatPageSelectionBar({
  selectedCount,
  forwardDisabled,
  deleteDisabled,
  onForward,
  onDelete,
  onCancel,
}: ChatPageSelectionBarProps) {
  if (selectedCount <= 0) return null;

  return (
    <div className="flex items-center justify-between border-t border-border-subtle bg-bg-elevated px-4 py-2">
      <span className="text-sm text-text-muted">{t("message.selected", { count: selectedCount })}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-lg bg-bg px-3 py-1.5 text-sm text-text-muted"
          disabled={forwardDisabled}
          onClick={onForward}
        >
          {t("message.forward")}
        </button>
        <button
          type="button"
          disabled={deleteDisabled}
          className="bg-notice-base/10 rounded-lg px-3 py-1.5 text-sm text-notice-base disabled:opacity-50"
          onClick={onDelete}
        >
          {t("common.delete")}
        </button>
        <button
          type="button"
          className="rounded-lg bg-bg px-3 py-1.5 text-sm text-text-muted"
          onClick={onCancel}
        >
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
});
