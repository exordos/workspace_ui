import React, { useCallback } from "react";
import { MarkTopicResolvedHeaderMenu } from "~/features/mark-topic-resolved/mark-topic-resolved-header-menu.ui";
import { t } from "~/i18n/i18n";
import { getRealmBaseUrl } from "~/shared/api/zulip-client.internal";
import { resolveAvatarUrl } from "~/shared/lib/avatar";
import { Avatar } from "~/shared/ui/avatar";
import { Icon } from "~/shared/ui/icon";
import { PresenceIndicator } from "~/shared/ui/presence-indicator";
import type { ChatHeaderProps } from "./chat-header.types";

function resolveAvatarSrc(url: string | undefined | null): string | undefined {
  return resolveAvatarUrl(url, getRealmBaseUrl());
}

const TITLE_ACTION_BUTTON_CLASS =
  "absolute inset-0 rounded-lg bg-transparent text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft";

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  channelName,
  topic = t("chat.generalChat"),
  participantsCount = 5,
  onlineCount = 2,
  onOpenSearch,
  onToggleRightPanel,
  onOpenRightPanel,
  rightPanelOpen = true,
  rightPanelLabel,
  hideTopic = false,
  hideParticipants = false,
  onCallClick,
  dmPartner,
  dmGroup,
  onDmPartnerClick,
}) => {
  const infoLabel = rightPanelLabel ?? t("info.channelInfo");
  const avatarSrc = dmPartner ? resolveAvatarSrc(dmPartner.avatarUrl) : undefined;
  const presenceText =
    dmPartner?.presenceState === "active"
      ? t("presence.online")
      : dmPartner?.presenceState === "idle"
        ? t("presence.away")
        : dmPartner?.lastSeen != null
          ? dmPartner.lastSeen === t("presence.online")
            ? t("presence.online")
            : t("presence.lastSeen", { time: dmPartner.lastSeen })
          : t("presence.offline");
  const statusText = dmPartner?.isAccountDeactivated
    ? t("dm.partnerBlocked")
    : dmPartner?.isTyping === true
      ? t("chat.typing")
      : (dmPartner?.customStatus ?? presenceText);
  const canOpenDmPartner = onDmPartnerClick != null;
  const canOpenRightPanelFromHeader = onOpenRightPanel != null || onToggleRightPanel != null;

  // Клик по блоку собеседника в DM (аватар + имя + статус) должен открывать
  // профиль в правой панели, как и клик по аватару автора в списке сообщений.
  const handleDmPartnerAvatarClick = useCallback(() => {
    onDmPartnerClick?.();
  }, [onDmPartnerClick]);

  // Для каналов и групповых чатов клик по левому блоку должен открывать
  // правую инфо-панель. Если специальный обработчик не передан,
  // используем существующий toggle как fallback.
  const handleOpenRightPanelFromHeaderBlock = useCallback(() => {
    if (onOpenRightPanel != null) {
      onOpenRightPanel();
      return;
    }
    onToggleRightPanel?.();
  }, [onOpenRightPanel, onToggleRightPanel]);

  return (
    <header className="flex flex-shrink-0 items-center justify-between bg-card-bg px-5 py-2">
      <div className="flex min-w-0 flex-1 flex-col">
        {dmPartner ? (
          <div className="relative flex min-w-0 items-center gap-3 rounded-lg text-left">
            <span className="relative shrink-0">
              <Avatar
                size="md"
                className="border border-border-subtle bg-bg-elevated text-text-muted"
                src={avatarSrc}
              >
                {dmPartner.name.slice(0, 1).toUpperCase()}
              </Avatar>
              <PresenceIndicator
                status={dmPartner.presenceState}
                size="md"
                tone="header"
                pulse={false}
                deactivated={dmPartner.isAccountDeactivated === true}
                className="absolute bottom-0 right-0 ring-border-subtle"
              />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <h1 className="truncate text-sm font-semibold text-text-primary">{dmPartner.name}</h1>
              <span className="truncate text-xs text-text-muted">{statusText}</span>
            </span>
            {canOpenDmPartner && (
              <button
                type="button"
                onClick={handleDmPartnerAvatarClick}
                className={TITLE_ACTION_BUTTON_CLASS}
                aria-label={t("a11y.openUserProfile", { name: dmPartner.name })}
              />
            )}
          </div>
        ) : dmGroup ? (
          <div className="relative flex min-w-0 items-center gap-3 rounded-lg text-left">
            <Avatar
              size="md"
              className="shrink-0 border border-border-subtle bg-bg-elevated text-text-muted"
            >
              {dmGroup.name.slice(0, 1).toUpperCase()}
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col">
              <h1 className="truncate text-sm font-semibold text-text-primary">{dmGroup.name}</h1>
              <p className="truncate text-xs text-text-muted">
                {t("channel.participants", { count: dmGroup.participantsCount })}
              </p>
            </div>
            {canOpenRightPanelFromHeader && (
              <button
                type="button"
                onClick={handleOpenRightPanelFromHeaderBlock}
                className={TITLE_ACTION_BUTTON_CLASS}
                aria-label={infoLabel}
              />
            )}
          </div>
        ) : (
          <div className="relative flex min-w-0 flex-1 flex-col rounded-lg text-left">
            <h1 className="truncate text-sm text-text-primary">
              {!hideTopic && topic ? (
                <>
                  <span className="font-semibold">{topic}</span>
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
        )}
      </div>
      <div className="flex items-center gap-1">
        {onCallClick != null && (
          <button
            type="button"
            onClick={onCallClick}
            className="hover:bg-bg/50 rounded-lg p-2 text-text-muted hover:text-text-primary"
            aria-label={t("nav.calls")}
          >
            <Icon name="phone" size={20} className="text-current" />
          </button>
        )}
        {onOpenSearch != null && (
          <button
            type="button"
            onClick={onOpenSearch}
            className="hover:bg-bg/50 rounded-lg p-2 text-text-muted hover:text-text-primary"
            aria-label={t("search.search")}
          >
            <Icon name="search" size={20} className="text-current" />
          </button>
        )}
        {!dmPartner && !dmGroup && !hideTopic && <MarkTopicResolvedHeaderMenu />}
        {onToggleRightPanel != null && (
          <button
            type="button"
            onClick={onToggleRightPanel}
            className="hover:bg-bg/50 rounded-lg p-2 text-text-muted hover:text-text-primary"
            aria-label={rightPanelOpen ? t("a11y.hidePanel") : infoLabel}
          >
            <Icon name="moreVert" size={20} className="text-current" />
          </button>
        )}
      </div>
    </header>
  );
};
