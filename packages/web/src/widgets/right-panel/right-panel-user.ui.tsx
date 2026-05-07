import React, { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { ensureUserStatusLoaded } from "~/entities/user/api/user.api";
import { formatUserStatusLabel } from "~/entities/user/user-status.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { useChatDmCallBridgeStore } from "~/features/chat-dm-call-bridge/chat-dm-call-bridge.model";
import { useMediaViewerStore } from "~/features/media-viewer/media-viewer.model";
import { t } from "~/i18n/i18n";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { isValidEmail, isValidUrl } from "~/shared/lib/validation";
import { Avatar } from "~/shared/ui/avatar";
import { Copyable } from "~/shared/ui/copyable";
import { Icon } from "~/shared/ui/icon";
import { ScrollArea } from "~/shared/ui/scroll-area";
import { useRightDrawerStore } from "./right-drawer.model";
import {
  buildMailtoHref,
  buildTelHref,
  formatDateJoined,
  resolveAvatarSrc,
} from "./right-panel.lib";
import type { RightPanelUserProps } from "./right-panel-user.types";

export const RightPanelUser = React.memo(function RightPanelUser({
  user,
  onSelectCommonGroup,
  onOpenDirectMessage,
}: RightPanelUserProps) {
  const navigate = useNavigate();
  const media = user.media ?? {};
  const photos = media.photos ?? 0;
  const videos = media.videos ?? 0;
  const files = media.files ?? 0;
  const links = media.links ?? 0;
  const primaryEmail = user.email != null && user.email.length > 0 ? user.email : user.username;
  const userIdLink =
    user.profileLink != null && user.profileLink.length > 0 && isValidUrl(user.profileLink)
      ? user.profileLink
      : undefined;
  const joinedDate = formatDateJoined(user.dateJoined);
  const directMessageUserId = user.userId;
  const accountType =
    user.isBot == null ? undefined : user.isBot ? t("info.botAccount") : t("info.humanAccount");
  const accountStatus =
    user.isActive == null ? undefined : user.isActive ? t("info.active") : t("info.deactivated");
  const managerTrimmed = user.manager?.trim();
  const contactRows = [
    user.userId != null && {
      label: t("info.userId"),
      value: String(user.userId),
      copyValue: String(user.userId),
      copyAriaLabel: t("info.copyUserId"),
      icon: "profile" as const,
      href: userIdLink,
      external: true,
    },
    primaryEmail != null &&
      primaryEmail.length > 0 && {
        label: t("common.email"),
        value: primaryEmail,
        copyValue: primaryEmail,
        copyAriaLabel: t("info.copyEmail"),
        icon: "mail" as const,
      },
    user.jobTitle && {
      label: t("info.jobTitle"),
      value: user.jobTitle,
      icon: "businessCenter" as const,
    },
    managerTrimmed != null &&
      managerTrimmed.length > 0 && {
        label: t("info.manager"),
        value: managerTrimmed,
        icon: "handshake" as const,
        href: isValidEmail(managerTrimmed) ? buildMailtoHref(managerTrimmed) : undefined,
      },
    user.phone && {
      label: t("info.phone"),
      value: user.phone,
      icon: "phone" as const,
      href: buildTelHref(user.phone),
    },
    user.role && { label: t("info.role"), value: user.role, icon: "profile" as const },
    accountType && { label: t("info.accountType"), value: accountType, icon: "group" as const },
    accountStatus && {
      label: t("info.accountStatus"),
      value: accountStatus,
      icon: "info" as const,
    },
    user.timezone && { label: t("info.timezone"), value: user.timezone, icon: "calendar" as const },
    user.localTime && {
      label: t("info.localTime"),
      value: user.localTime,
      icon: "calendar" as const,
    },
    joinedDate && { label: t("info.joined"), value: joinedDate, icon: "calendar" as const },
    user.birthday && { label: t("info.birthday"), value: user.birthday, icon: "calendar" as const },
  ].filter(Boolean) as {
    label: string;
    value: string;
    icon:
      | "mail"
      | "phone"
      | "profile"
      | "calendar"
      | "businessCenter"
      | "handshake"
      | "group"
      | "info";
    copyValue?: string;
    copyAriaLabel?: string;
    href?: string;
    external?: boolean;
  }[];
  const avatarSrc = resolveAvatarSrc(user.avatarUrl);
  const openMediaViewer = useMediaViewerStore((s) => s.open);
  const liveStatus = useUsersStore((s) =>
    user.userId != null ? s.getUser(user.userId)?.status : undefined,
  );
  const statusLabel = formatUserStatusLabel(liveStatus) ?? user.status;

  const handleOpenAvatarPreview = useCallback(() => {
    if (!avatarSrc) return;
    openMediaViewer([
      {
        url: avatarSrc,
        type: "image",
        alt: user.name,
      },
    ]);
  }, [avatarSrc, openMediaViewer, user.name]);

  const currentUserId = useChatListStore((s) => s.currentUserId);
  const isOwnProfile = currentUserId != null && directMessageUserId === currentUserId;
  const profileDmCallHandlerReady = useChatDmCallBridgeStore(
    (s) => s.invokeDmCallFromProfileHandler != null,
  );
  const handleProfileDmCall = useCallback(() => {
    if (directMessageUserId == null) return;
    useChatDmCallBridgeStore.getState().invokeDmCallFromProfile(directMessageUserId);
  }, [directMessageUserId]);
  const handleOpenOwnPersonalInfoSettings = useCallback(() => {
    void navigate(withCurrentOrgRoute("/settings/personal-info"));
  }, [navigate]);
  const handleAvatarAction = useCallback(() => {
    if (isOwnProfile) {
      handleOpenOwnPersonalInfoSettings();
      return;
    }
    handleOpenAvatarPreview();
  }, [handleOpenAvatarPreview, handleOpenOwnPersonalInfoSettings, isOwnProfile]);

  useEffect(() => {
    if (user.userId == null) {
      return;
    }
    void ensureUserStatusLoaded(user.userId);
  }, [user.userId]);

  const userIdOverride = useRightDrawerStore((s) => s.userIdOverride);
  const clearUserProfileOverride = useRightDrawerStore((s) => s.clearUserProfileOverride);
  const handleBackFromNestedProfile = useCallback(() => {
    clearUserProfileOverride();
  }, [clearUserProfileOverride]);
  const showBackToChatInfo = userIdOverride != null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden text-text-primary">
      <ScrollArea className="flex-1 px-4 py-3">
        <header className="border-b border-border-subtle pb-3">
          {showBackToChatInfo ? (
            <div className="mb-3 flex min-h-8 items-center gap-2">
              <button
                type="button"
                onClick={handleBackFromNestedProfile}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg p-0 leading-none text-text-muted transition-colors hover:bg-card-bg-active hover:text-text-primary"
                aria-label={t("common.back")}
              >
                <Icon
                  name="chevron-right"
                  size={14}
                  className="translate-x-px rotate-180 text-current"
                />
              </button>
              <h2 className="min-w-0 flex-1 text-sm font-semibold text-text-primary">
                {t("info.information")}
              </h2>
            </div>
          ) : (
            <h2 className="mb-3 text-sm font-semibold text-text-primary">
              {t("info.information")}
            </h2>
          )}
          <div className="flex items-center gap-3">
            {isOwnProfile || avatarSrc != null ? (
              <button
                type="button"
                onClick={handleAvatarAction}
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
                aria-label={isOwnProfile ? t("settings.changeAvatar") : t("info.openAvatarPreview")}
              >
                <Avatar size="lg" className="bg-bg-elevated text-text-secondary" src={avatarSrc}>
                  {user.name.slice(0, 1)}
                </Avatar>
              </button>
            ) : (
              <Avatar size="lg" className="bg-bg-elevated text-text-secondary">
                {user.name.slice(0, 1)}
              </Avatar>
            )}
            <div className="min-w-0 flex-1">
              <Copyable value={user.name} className="w-full">
                <p className="truncate text-sm font-medium text-text-primary">{user.name}</p>
              </Copyable>
              {statusLabel && (
                <p className="truncate text-[11px] text-text-secondary">{statusLabel}</p>
              )}
              {user.lastSeen && (
                <p className="text-[11px] text-text-secondary">
                  {user.lastSeen === t("presence.online")
                    ? t("presence.online")
                    : t("presence.lastSeen", { time: user.lastSeen })}
                </p>
              )}
            </div>
          </div>
          {directMessageUserId != null && (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-on-accent hover:opacity-90"
                onClick={() => onOpenDirectMessage?.(directMessageUserId)}
              >
                <Icon name="chatBubble" size={16} className="shrink-0 text-current" />
                <span className="truncate">{t("info.openDirectMessages")}</span>
              </button>
              {profileDmCallHandlerReady &&
                currentUserId != null &&
                directMessageUserId !== currentUserId && (
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-sm font-medium text-text-primary hover:bg-bg"
                    onClick={handleProfileDmCall}
                    aria-label={t("call.call")}
                  >
                    <Icon name="phone" size={16} className="shrink-0 text-current" />
                    <span className="truncate">{t("call.call")}</span>
                  </button>
                )}
            </div>
          )}
          {contactRows.length > 0 && (
            <ul className="mt-3 space-y-2">
              {contactRows.map((row) => {
                const rowValueNode = row.href ? (
                  <a
                    href={row.href}
                    target={row.external ? "_blank" : undefined}
                    rel={row.external ? "noreferrer" : undefined}
                    className="inline-flex max-w-full items-center text-accent underline-offset-2 hover:underline"
                  >
                    <span className="truncate whitespace-nowrap">{row.value}</span>
                  </a>
                ) : (
                  <span className="block truncate whitespace-nowrap text-text-primary">
                    {row.value}
                  </span>
                );

                const renderedRowValue =
                  row.copyValue != null ? (
                    <Copyable
                      value={row.copyValue}
                      copyAriaLabel={row.copyAriaLabel}
                      className="max-w-full"
                    >
                      {rowValueNode}
                    </Copyable>
                  ) : (
                    rowValueNode
                  );

                return (
                  <li
                    key={row.label}
                    className="flex items-start gap-3 rounded-lg px-1 py-1.5 text-sm"
                  >
                    <Icon name={row.icon} size={20} className="mt-0.5 shrink-0 text-icon-base" />
                    <div className="min-w-0 flex-1">
                      <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                        {row.label}
                      </p>
                      {renderedRowValue}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </header>

        <div className="space-y-4 pt-3">
          {(photos > 0 || videos > 0 || files > 0 || links > 0) && (
            <div>
              <ul className="space-y-1.5">
                {photos > 0 && (
                  <li>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
                    >
                      <Icon name="images" size={20} className="shrink-0 text-current" />
                      <span>
                        {photos} {t("info.photos")}
                      </span>
                    </button>
                  </li>
                )}
                {videos > 0 && (
                  <li>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
                    >
                      <Icon name="videos" size={20} className="shrink-0 text-current" />
                      <span>
                        {videos} {t("info.videos")}
                      </span>
                    </button>
                  </li>
                )}
                {files > 0 && (
                  <li>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
                    >
                      <Icon name="files" size={20} className="shrink-0 text-current" />
                      <span>
                        {files} {t("info.files")}
                      </span>
                    </button>
                  </li>
                )}
                {links > 0 && (
                  <li>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
                    >
                      <Icon name="links" size={20} className="shrink-0 text-current" />
                      <span>
                        {links} {t("info.links")}
                      </span>
                    </button>
                  </li>
                )}
              </ul>
            </div>
          )}

          {user.commonGroups && user.commonGroups.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                {t("info.commonGroups")}
              </h3>
              <ul className="space-y-2">
                {user.commonGroups.map((group, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
                      onClick={() => {
                        if (group.slug != null) {
                          onSelectCommonGroup?.(group.slug);
                        }
                      }}
                    >
                      <Avatar size="sm" className="bg-bg-elevated text-text-primary">
                        {group.name.slice(0, 1)}
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-text-primary">
                          {group.name}
                        </p>
                        {group.lastMessage && (
                          <p className="truncate text-[11px] text-text-secondary">
                            {group.lastMessage}
                          </p>
                        )}
                      </div>
                      {group.unread != null && group.unread > 0 && (
                        <span className="flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-badge-bg text-[11px] font-medium text-on-accent">
                          {group.unread}
                        </span>
                      )}
                      <Icon name="chevron-down" size={16} className="shrink-0 text-icon-base" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
});
