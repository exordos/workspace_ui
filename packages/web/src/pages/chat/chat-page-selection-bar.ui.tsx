import React from "react";
import { t } from "~/i18n/i18n";
import {
  chatBottomNoticeBarClassName,
  chatBottomNoticeMarkerClassName,
} from "~/shared/lib/chat-bottom-notice-bar.lib";
import { Button } from "~/shared/ui/button";
import { Icon } from "~/shared/ui/icon";
import type { ChatPageSelectionBarProps } from "./chat-page-selection-bar.types";

const DELETE_ACTION_AVAILABLE = false;

export const ChatPageSelectionBar = React.memo(function ChatPageSelectionBar({
  selectedCount,
  replyDisabled,
  forwardDisabled,
  deleteDisabled,
  onReply,
  onForward,
  onDelete,
  onCancel,
  joinedAbove = false,
  joinedBelow = false,
  omitBottomBorder = false,
}: ChatPageSelectionBarProps) {
  if (selectedCount <= 0) return null;

  const isJoinedSeamlessBelow = joinedBelow && omitBottomBorder;

  return (
    <div
      className={chatBottomNoticeBarClassName({
        joinedAbove,
        joinedBelow: joinedBelow && !omitBottomBorder,
        gap: "3",
        paddingX: "wide",
        paddingY: "compact",
        className: `relative min-h-10 justify-between ${
          isJoinedSeamlessBelow ? "rounded-b-none rounded-t-xl" : ""
        } ${omitBottomBorder ? "border-b-0" : ""}`,
      })}
      role="toolbar"
      aria-label={t("message.selectedCount", { count: selectedCount })}
    >
      <span
        className={`absolute bottom-2.5 left-0 top-2.5 w-1 rounded-r-full ${chatBottomNoticeMarkerClassName("danger")}`}
        data-notice-marker="danger"
        aria-hidden
      />
      <span className="min-w-0 text-sm font-medium leading-5 text-text-primary">
        {t("message.selected", { count: selectedCount })}
      </span>
      <div className="flex items-center gap-2.5">
        {/* Keep selection actions at the same height as the delete-confirm actions. */}
        <Button
          type="button"
          variant="neutral"
          appearance="filled"
          size="md"
          className="shrink-0"
          onClick={onCancel}
        >
          {t("common.cancel")}
        </Button>
        <Button
          type="button"
          variant="neutral"
          appearance="filled"
          size="md"
          className="shrink-0"
          leadingIcon={<Icon name="reply" size={28} className="text-current" />}
          disabled={replyDisabled}
          onClick={onReply}
        >
          {t("message.reply")}
        </Button>
        <Button
          type="button"
          variant="neutral"
          appearance="filled"
          size="md"
          className="shrink-0"
          leadingIcon={<Icon name="forward" size={28} className="text-current" />}
          disabled={forwardDisabled}
          onClick={onForward}
        >
          {t("message.forward")}
        </Button>
        {/* Keep the future action boundary local until bulk delete is supported. */}
        {DELETE_ACTION_AVAILABLE && !deleteDisabled ? (
          <Button
            type="button"
            variant="danger"
            appearance="filled"
            size="md"
            className="shrink-0"
            leadingIcon={<Icon name="delete" size={28} className="text-current" />}
            onClick={onDelete}
          >
            {t("common.delete")}
          </Button>
        ) : null}
      </div>
    </div>
  );
});
