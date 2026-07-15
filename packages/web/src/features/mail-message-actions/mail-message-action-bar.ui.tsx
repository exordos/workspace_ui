import React, { useCallback, useMemo } from "react";
import { t } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import { Icon, type IconName } from "~/shared/ui/icon";
import { Tooltip } from "~/shared/ui/tooltip";
import type { MailMessageActionBarProps } from "./mail-message-actions.types";

const MailActionIconButton = React.memo<{
  label: string;
  icon: IconName;
  onClick: () => void;
  danger?: boolean;
}>(({ label, icon, onClick, danger = false }) => (
  <Tooltip label={label} side="bottom">
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={onClick}
      className={`h-8 w-8 shrink-0 px-0 ${danger ? "text-notice-base hover:text-notice-base" : ""}`}
      aria-label={label}
    >
      <Icon name={icon} size={18} />
    </Button>
  </Tooltip>
));
MailActionIconButton.displayName = "MailActionIconButton";

export const MailMessageActionBar: React.FC<MailMessageActionBarProps> = ({
  message,
  inTrash,
  onAction,
}) => {
  const handleReply = useCallback(() => onAction("reply"), [onAction]);
  const handleReplyAll = useCallback(() => onAction("replyAll"), [onAction]);
  const handleForward = useCallback(() => onAction("forward"), [onAction]);
  const handleToggleStar = useCallback(() => onAction("toggleStar"), [onAction]);
  const handleMarkUnread = useCallback(() => onAction("markUnread"), [onAction]);
  const handleArchive = useCallback(() => onAction("archive"), [onAction]);
  const handleSpam = useCallback(() => onAction("spam"), [onAction]);
  const handleMove = useCallback(() => onAction("move"), [onAction]);
  const handleDelete = useCallback(() => onAction("delete"), [onAction]);

  const starLabel = useMemo(
    () => (message.flagged ? t("mail.unstar") : t("mail.star")),
    [message.flagged],
  );
  const deleteLabel = useMemo(
    () => (inTrash ? t("mail.deletePermanent") : t("mail.delete")),
    [inTrash],
  );

  return (
    <div
      className="flex min-w-max shrink-0 items-center justify-start gap-0.5 rounded-lg md:justify-end"
      role="toolbar"
      aria-label={t("mail.messageActions")}
    >
      <MailActionIconButton label={t("mail.reply")} icon="reply" onClick={handleReply} />
      <MailActionIconButton label={t("mail.replyAll")} icon="reply_all" onClick={handleReplyAll} />
      <MailActionIconButton label={t("mail.forward")} icon="forward" onClick={handleForward} />
      <MailActionIconButton
        label={starLabel}
        icon={message.flagged ? "star" : "star_outline"}
        onClick={handleToggleStar}
      />
      {message.seen ? (
        <MailActionIconButton
          label={t("mail.markUnread")}
          icon="mail_outline"
          onClick={handleMarkUnread}
        />
      ) : null}
      {!inTrash ? (
        <>
          <MailActionIconButton
            label={t("mail.archive")}
            icon="folder_open"
            onClick={handleArchive}
          />
          <MailActionIconButton label={t("mail.spam")} icon="block" onClick={handleSpam} />
          <MailActionIconButton label={t("mail.move")} icon="folders" onClick={handleMove} />
        </>
      ) : null}
      <MailActionIconButton label={deleteLabel} icon="delete" onClick={handleDelete} danger />
    </div>
  );
};
