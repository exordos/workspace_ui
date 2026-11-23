import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { resolveAvatarBackgroundColor } from "~/shared/lib/avatar-color.lib";
import { AppTooltip } from "~/shared/ui/app-tooltip";
import { Avatar } from "~/shared/ui/avatar";
import { Icon } from "~/shared/ui/icon";
import { ChatHeaderShell } from "./chat-header-shell.ui";
import type { ChatChannelHeaderProps } from "./chat-header.types";

// The full title block is one accessible action target.
const TITLE_ACTION_BUTTON_CLASS =
  "absolute inset-0 cursor-pointer rounded-lg bg-transparent text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft";

/** Channel or topic header with member counts and actions. */
export const ChatChannelHeader: React.FC<ChatChannelHeaderProps> = ({
  channelName,
  color,
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
          <span aria-hidden="true">
            <Avatar size="sm" style={{ backgroundColor: resolveAvatarBackgroundColor(color) }}>
              <Icon name="chatLock" size={20} className="text-text-primary" />
            </Avatar>
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
              <AppTooltip
                align="start"
                wrapperClassName="relative z-10"
                content={
                  <div className="space-y-2">
                    <p className="font-medium text-text-primary">{t("e2ee.chatFeatures")}</p>
                    <ul className="list-disc space-y-2 pl-4">
                      <li>{t("e2ee.chatFeaturesMessages")}</li>
                      <li>{t("e2ee.chatFeaturesKeys")}</li>
                      <li>{t("e2ee.chatFeaturesMissingKey")}</li>
                      <li>{t("e2ee.chatFeaturesMedia")}</li>
                      <li>{t("e2ee.chatFeaturesMediaAccess")}</li>
                    </ul>
                  </div>
                }
              >
                <button
                  type="button"
                  aria-label={t("e2ee.chatFeatures")}
                  className="inline-flex shrink-0 cursor-help items-center gap-1.5 whitespace-nowrap rounded bg-transparent p-0 text-left font-normal text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
                >
                  <Icon name="info" size={14} className="text-current" />
                  <span>{t("e2ee.protectedChat")}</span>
                </button>
              </AppTooltip>
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
