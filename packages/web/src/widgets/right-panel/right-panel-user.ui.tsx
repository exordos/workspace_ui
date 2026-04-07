import React, { useCallback, useEffect, useState } from "react";
import { ensureUserStatusLoaded } from "~/entities/user/api/user.api";
import { formatUserStatusLabel } from "~/entities/user/user-status.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { useMediaViewerStore } from "~/features/media-viewer/media-viewer.model";
import { t } from "~/i18n/i18n";
import { createLogger } from "~/shared/lib/logger";
import { isValidUrl } from "~/shared/lib/validation";
import { Avatar } from "~/shared/ui/avatar";
import { Copyable } from "~/shared/ui/copyable";
import { Icon } from "~/shared/ui/icon";
import { ScrollArea } from "~/shared/ui/scroll-area";
import {
  buildMailtoHref,
  buildTelHref,
  formatDateJoined,
  resolveAvatarSrc,
  resolveMentionNickname,
} from "./right-panel.lib";
import type { RightPanelUserProps } from "./right-panel-user.types";

const log = createLogger("right-panel");

export const RightPanelUser = React.memo(function RightPanelUser({
  user,
  onSelectCommonGroup,
  onOpenDirectMessage,
}: RightPanelUserProps) {
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
        icon: "mail" as const,
        href: buildMailtoHref(primaryEmail),
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
    user.jobTitle && {
      label: t("info.jobTitle"),
      value: user.jobTitle,
      icon: "businessCenter" as const,
    },
    user.manager && {
      label: t("info.manager"),
      value: user.manager,
      icon: "handshake" as const,
      href: buildMailtoHref(user.manager),
    },
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
  const emailCopyValue = user.email?.trim() || undefined;
  const userIdCopyValue = user.userId != null ? String(user.userId) : undefined;
  const mentionNickname = resolveMentionNickname({ username: user.username, email: primaryEmail });
  const mentionCopyValue = mentionNickname != null ? `@${mentionNickname}` : undefined;
  const liveStatus = useUsersStore((s) =>
    user.userId != null ? s.getUser(user.userId)?.status : undefined,
  );
  const statusLabel = formatUserStatusLabel(liveStatus) ?? user.status;
  const [mentionCopyState, setMentionCopyState] = useState<"idle" | "success" | "error">("idle");
  const [emailCopyState, setEmailCopyState] = useState<"idle" | "success" | "error">("idle");
  const [userIdCopyState, setUserIdCopyState] = useState<"idle" | "success" | "error">("idle");
  const mentionCopyButtonLabel =
    mentionCopyState === "success"
      ? t("message.copied")
      : mentionCopyState === "error"
        ? t("message.copyFailed")
        : t("info.copyMentionNickname");
  const emailCopyButtonLabel =
    emailCopyState === "success"
      ? t("message.copied")
      : emailCopyState === "error"
        ? t("message.copyFailed")
        : t("info.copyEmail");
  const userIdCopyButtonLabel =
    userIdCopyState === "success"
      ? t("message.copied")
      : userIdCopyState === "error"
        ? t("message.copyFailed")
        : t("info.copyUserId");

  const copyProfileValue = useCallback(
    async (value: string, field: "mention nickname" | "email" | "user id"): Promise<boolean> => {
      const clipboardApi = navigator.clipboard;
      if (clipboardApi?.writeText == null) {
        log.warn("Clipboard API unavailable while copying profile field", {
          field,
          userId: user.userId ?? null,
        });
        return false;
      }

      try {
        await clipboardApi.writeText(value);
        return true;
      } catch (error) {
        log.warn("Failed to copy profile field", {
          field,
          userId: user.userId ?? null,
          error: String(error),
        });
        return false;
      }
    },
    [user.userId],
  );

  const handleCopyEmail = useCallback(async () => {
    if (!emailCopyValue) return;
    setEmailCopyState("idle");
    const copied = await copyProfileValue(emailCopyValue, "email");
    setEmailCopyState(copied ? "success" : "error");
  }, [copyProfileValue, emailCopyValue]);

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

  useEffect(() => {
    if (user.userId == null) {
      return;
    }
    void ensureUserStatusLoaded(user.userId);
  }, [user.userId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden text-text-primary">
      <ScrollArea className="flex-1 px-4 py-3">
        <header className="border-b border-border-subtle pb-3">
          <h2 className="mb-3 text-sm font-semibold text-text-primary">{t("info.information")}</h2>
          <div className="flex items-center gap-3">
            {avatarSrc != null ? (
              <button
                type="button"
                onClick={handleOpenAvatarPreview}
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
                aria-label={t("info.openAvatarPreview")}
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
          {(directMessageUserId != null ||
            mentionCopyValue != null ||
            emailCopyValue != null ||
            userIdCopyValue != null) && (
            <div className="mt-3 space-y-2">
              {directMessageUserId != null && (
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-on-accent hover:opacity-90"
                  onClick={() => onOpenDirectMessage?.(directMessageUserId)}
                >
                  <Icon name="chatBubble" size={16} className="shrink-0 text-current" />
                  <span>{t("info.openDirectMessages")}</span>
                </button>
              )}
              {emailCopyValue != null && (
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-card-bg"
                  onClick={() => void handleCopyEmail()}
                >
                  <Icon name="mail" size={16} className="shrink-0 text-current" />
                  <span>{emailCopyButtonLabel}</span>
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
