import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { ChatHeaderShell } from "./chat-header-shell.ui";
import type { ChatChannelHeaderProps } from "./chat-header.types";

// The full title block is one accessible action target.
const TITLE_ACTION_BUTTON_CLASS =
  "absolute inset-0 cursor-pointer rounded-lg bg-transparent text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft";

/** Channel or topic header with member counts and actions. */
export const ChatChannelHeader: React.FC<ChatChannelHeaderProps> = ({
  channelName,
  encrypted = false,
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
      headerClassName={encrypted ? "pb-2 pt-3" : undefined}
      onCallClick={onCallClick}
      onOpenSearch={onOpenSearch}
      onToggleRightPanel={onToggleRightPanel}
      rightPanelOpen={rightPanelOpen}
      infoLabel={infoLabel}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {encrypted ? (
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-text-secondary"
          >
            <Icon name="chatLock" size={20} className="text-bg-elevated" />
          </span>
        ) : null}
        <div className="relative flex min-w-0 flex-1 flex-col rounded-lg text-left">
          <h1
            className={
              encrypted
                ? "flex min-w-0 items-center gap-5 text-base leading-5 text-text-primary"
                : "truncate text-sm text-text-primary"
            }
          >
            <span className={encrypted ? "min-w-0 truncate" : ""}>
              {!hideTopic && topic ? (
                <>
                  <span
                    className={`${encrypted ? "font-medium" : "font-semibold"} ${systemTopic ? "italic" : ""}`}
                  >
                    {topic}
                  </span>
                  <span className={`font-normal text-text-muted ${encrypted ? "ml-2" : ""}`}>
                    {encrypted ? channelName : ` · ${channelName}`}
                  </span>
                </>
              ) : (
                <span className={encrypted ? "font-medium" : "font-semibold"}>{channelName}</span>
              )}
            </span>
            {encrypted ? (
              <span className="shrink-0 whitespace-nowrap font-normal text-accent">
                {t("e2ee.protectedChat")}
              </span>
            ) : null}
          </h1>
          {!hideParticipants && (
            <p
              className={`text-xs text-text-muted ${encrypted ? "mt-1 leading-[18px]" : "mt-0.5"}`}
            >
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
      </div>
    </ChatHeaderShell>
  );
};
