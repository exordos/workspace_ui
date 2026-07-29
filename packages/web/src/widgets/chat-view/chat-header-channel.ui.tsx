import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { ChatHeaderShell } from "./chat-header-shell.ui";
import type { ChatChannelHeaderProps } from "./chat-header.types";

// The full title block is one accessible action target.
const TITLE_ACTION_BUTTON_CLASS =
  "absolute inset-0 cursor-pointer rounded-lg bg-transparent text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft";

/** Channel or topic header with member counts and actions. */
export const ChatChannelHeader: React.FC<ChatChannelHeaderProps> = ({
  channelName,
  topic = t("chat.generalChat"),
  systemTopic = false,
  participantsCount = 5,
  onlineCount = 2,
  hideTopic = false,
  hideParticipants = false,
  onOpenSearch,
  onToggleRightPanel,
  onOpenRightPanel,
  rightPanelOpen = true,
  rightPanelLabel,
  onCallClick,
}) => {
  const infoLabel = rightPanelLabel ?? t("info.channelInfo");
  const canOpenRightPanelFromHeader = onOpenRightPanel != null || onToggleRightPanel != null;

  // Prefer opening the panel and fall back to toggling it.
  const handleOpenRightPanelFromHeaderBlock = useCallback(() => {
    if (onOpenRightPanel != null) {
      onOpenRightPanel();
      return;
    }
    onToggleRightPanel?.();
  }, [onOpenRightPanel, onToggleRightPanel]);

  return (
    <ChatHeaderShell
      onCallClick={onCallClick}
      onOpenSearch={onOpenSearch}
      onToggleRightPanel={onToggleRightPanel}
      rightPanelOpen={rightPanelOpen}
      infoLabel={infoLabel}
    >
      <div className="relative flex min-w-0 flex-1 flex-col rounded-lg text-left">
        <h1 className="truncate text-sm text-text-primary">
          {!hideTopic && topic ? (
            <>
              <span className={`font-semibold ${systemTopic ? "italic" : ""}`}>{topic}</span>
              <span className="font-normal text-text-muted"> · {channelName}</span>
            </>
          ) : (
            <span className="font-semibold">{channelName}</span>
          )}
        </h1>
        {!hideParticipants && (
          <p className="mt-0.5 text-xs text-text-muted">
            {t("channel.participants", { count: participantsCount })},{" "}
            {t("channel.online", { count: onlineCount })}
          </p>
        )}
        {canOpenRightPanelFromHeader && (
          <button
            type="button"
            onClick={handleOpenRightPanelFromHeaderBlock}
            className={TITLE_ACTION_BUTTON_CLASS}
            aria-label={infoLabel}
          />
        )}
      </div>
    </ChatHeaderShell>
  );
};
