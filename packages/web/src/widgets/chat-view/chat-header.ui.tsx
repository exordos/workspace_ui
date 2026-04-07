import React from "react";
import { t } from "~/i18n/i18n";
import { getRealmBaseUrl } from "~/shared/api/zulip-client.internal";
import { resolveAvatarUrl } from "~/shared/lib/avatar";
import { Avatar } from "~/shared/ui/avatar";
import { Icon } from "~/shared/ui/icon";
import type { ChatHeaderProps } from "./chat-header.types";

function resolveAvatarSrc(url: string | undefined | null): string | undefined {
  return resolveAvatarUrl(url, getRealmBaseUrl());
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  channelName,
  topic = t("chat.generalChat"),
  participantsCount = 5,
  onlineCount = 2,
  onOpenSearch,
  onToggleRightPanel,
  rightPanelOpen = true,
  rightPanelLabel,
  hideTopic = false,
  hideParticipants = false,
  onCallClick,
  dmPartner,
  dmGroup,
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
  const statusText =
    dmPartner?.isTyping === true ? t("chat.typing") : (dmPartner?.customStatus ?? presenceText);

  return (
    <header className="flex flex-shrink-0 items-center justify-between bg-card-bg px-5 py-2">
      <div className="flex min-w-0 flex-1 flex-col">
        {dmPartner ? (
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative shrink-0">
              <Avatar
                size="md"
                className="border border-border-subtle bg-bg-elevated text-text-muted"
                src={avatarSrc}
              >
                {dmPartner.name.slice(0, 1).toUpperCase()}
              </Avatar>
              {dmPartner.presenceState === "active" && (
                <span
                  className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-border-subtle bg-indicator-green"
                  aria-label={t("a11y.online")}
                />
              )}
              {dmPartner.presenceState === "idle" && (
                <span
                  className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-border-subtle bg-indicator-orange"
                  aria-label={t("a11y.away")}
                />
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <h1 className="truncate text-sm font-semibold text-text-primary">{dmPartner.name}</h1>
              <p className="truncate text-xs text-text-muted">{statusText}</p>
            </div>
          </div>
        ) : dmGroup ? (
          <div className="flex min-w-0 items-center gap-3">
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
          </div>
        ) : (
          <>
            <h1 className="truncate text-sm font-semibold text-text-primary">
              {channelName}
              {!hideTopic && topic && (
                <span className="font-normal text-text-muted"> | #{topic}</span>
              )}
            </h1>
            {!hideParticipants && (
              <p className="mt-0.5 text-xs text-text-muted">
                {t("channel.participants", { count: participantsCount })},{" "}
                {t("channel.online", { count: onlineCount })}
              </p>
            )}
          </>
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
        <button
          type="button"
          onClick={onOpenSearch}
          className="hover:bg-bg/50 rounded-lg p-2 text-text-muted hover:text-text-primary"
          aria-label={t("search.search")}
        >
          <Icon name="search" size={20} className="text-current" />
        </button>
        <button
          type="button"
          onClick={onToggleRightPanel}
          className="hover:bg-bg/50 rounded-lg p-2 text-text-muted hover:text-text-primary"
          aria-label={rightPanelOpen ? t("a11y.hidePanel") : infoLabel}
        >
          <Icon name="moreVert" size={20} className="text-current" />
        </button>
      </div>
    </header>
  );
};
