import React, { useCallback } from "react";
import { WorkspaceAvatar } from "~/features/workspace-avatar/workspace-avatar.ui";
import { t } from "~/i18n/i18n";
import { Avatar } from "~/shared/ui/avatar";
import { Icon } from "~/shared/ui/icon";
import { PresenceIndicator } from "~/shared/ui/presence-indicator";
import { resolveDmStatusText } from "./chat-header.lib";
import type { ChatHeaderProps } from "./chat-header.types";

// Клики по заголовку/аватару — курсор-«пальчик» на hover
const TITLE_ACTION_BUTTON_CLASS =
  "absolute inset-0 cursor-pointer rounded-lg bg-transparent text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft";
const AVATAR_ACTION_BUTTON_CLASS =
  "group relative shrink-0 cursor-pointer rounded-full bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft";
// Иконки действий в шапке (звонок, поиск, сайдбар)
const HEADER_ICON_BUTTON_CLASS =
  "cursor-pointer rounded-lg p-2 text-text-muted hover:bg-card-bg-active hover:text-text-primary";

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  channelName,
  topic = t("chat.generalChat"),
  systemTopic = false,
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
  const infoLabel =
    rightPanelLabel ?? (dmPartner != null ? t("info.partnerInfo") : t("info.channelInfo"));
  const statusText = dmPartner ? resolveDmStatusText(dmPartner) : "";
  const canOpenDmPartner = onDmPartnerClick != null;
  const canOpenRightPanelFromHeader = onOpenRightPanel != null || onToggleRightPanel != null;

  // DM header click opens the partner profile in the right panel (same as message author avatar).
  const handleDmPartnerAvatarClick = useCallback(() => {
    onDmPartnerClick?.();
  }, [onDmPartnerClick]);

  // Channel/group header opens chat info; fall back to toggle when no dedicated handler is passed.
  const handleOpenRightPanelFromHeaderBlock = useCallback(() => {
    if (onOpenRightPanel != null) {
      onOpenRightPanel();
      return;
    }
    onToggleRightPanel?.();
  }, [onOpenRightPanel, onToggleRightPanel]);

  const renderHeaderTitle = () => {
    if (dmPartner) {
      return (
        <div className="relative flex min-w-0 items-center gap-3 rounded-lg text-left">
          {canOpenDmPartner ? (
            <button
              type="button"
              onClick={handleDmPartnerAvatarClick}
              className={AVATAR_ACTION_BUTTON_CLASS}
              aria-label={t("a11y.openUserProfile", { name: dmPartner.name })}
            >
              <WorkspaceAvatar
                size="md"
                interactive
                className="border border-border-subtle bg-bg-elevated text-text-muted"
                avatarUrn={dmPartner.avatarUrl}
              >
                {dmPartner.name.slice(0, 1).toUpperCase()}
              </WorkspaceAvatar>
              <PresenceIndicator
                status={dmPartner.presenceState}
                size="md"
                tone="header"
                pulse={false}
                deactivated={dmPartner.isAccountDeactivated === true}
                className="absolute bottom-0 right-0 ring-border-subtle"
              />
            </button>
          ) : (
            <span className="relative shrink-0">
              <WorkspaceAvatar
                size="md"
                className="border border-border-subtle bg-bg-elevated text-text-muted"
                avatarUrn={dmPartner.avatarUrl}
              >
                {dmPartner.name.slice(0, 1).toUpperCase()}
              </WorkspaceAvatar>
              <PresenceIndicator
                status={dmPartner.presenceState}
                size="md"
                tone="header"
                pulse={false}
                deactivated={dmPartner.isAccountDeactivated === true}
                className="absolute bottom-0 right-0 ring-border-subtle"
              />
            </span>
          )}
          <span className="relative flex min-w-0 flex-1 flex-col">
            <h1 className="truncate text-sm font-semibold text-text-primary">{dmPartner.name}</h1>
            <span className="truncate text-xs text-text-muted">{statusText}</span>
            {canOpenRightPanelFromHeader && (
              <button
                type="button"
                onClick={handleOpenRightPanelFromHeaderBlock}
                className={TITLE_ACTION_BUTTON_CLASS}
                aria-label={infoLabel}
              />
            )}
          </span>
        </div>
      );
    }
    if (dmGroup) {
      return (
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
      );
    }
    return (
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
    );
  };

  return (
    <header className="flex flex-shrink-0 items-center justify-between rounded-lg bg-bg-elevated px-5 py-2">
      <div className="flex min-w-0 flex-1 flex-col">{renderHeaderTitle()}</div>
      <div className="flex items-center gap-1">
        {onCallClick != null && (
          <button
            type="button"
            onClick={onCallClick}
            className={HEADER_ICON_BUTTON_CLASS}
            aria-label={t("nav.calls")}
          >
            <Icon name="phone" size={20} className="text-current" />
          </button>
        )}
        {onOpenSearch != null && (
          <button
            type="button"
            onClick={onOpenSearch}
            hidden
            className={`hidden ${HEADER_ICON_BUTTON_CLASS}`}
            aria-label={t("search.search")}
          >
            {/* Новый search.svg 20×20 — глиф заполняет viewBox, вес как у sidePanel */}
            <Icon name="search" size={20} className="text-current" />
          </button>
        )}
        {onToggleRightPanel != null && (
          <button
            type="button"
            onClick={onToggleRightPanel}
            className={HEADER_ICON_BUTTON_CLASS}
            aria-label={rightPanelOpen ? t("a11y.hidePanel") : infoLabel}
          >
            {/* Кнопка открытия/скрытия правой info-панели — иконка сайдбара, не троеточие */}
            <Icon name="sidePanel" size={20} className="text-current" />
          </button>
        )}
      </div>
    </header>
  );
};
