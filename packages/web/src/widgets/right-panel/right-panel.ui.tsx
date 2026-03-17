import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list";
import { useCurrentChatMessagesStore } from "~/entities/message";
import { ensureUserStatusLoaded, formatUserStatusLabel, useUsersStore } from "~/entities/user";
import { useChatInfoStore, type ChatInfoData } from "~/features/chat-info";
import { useMediaViewerStore } from "~/features/media-viewer";
import { useMuteStore, muteStream, unmuteStream } from "~/features/mute-chat";
import { t } from "~/i18n";
import { deleteStream, getRealmBaseUrl, updateStream } from "~/shared/api/zulip";
import { useRightDrawer } from "~/shared/contexts/right-drawer";
import { resolveAvatarUrl } from "~/shared/lib/avatar";
import { createLogger } from "~/shared/lib/logger";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { hasPermission, parseRole } from "~/shared/lib/roles";
import { isValidEmail, isValidUrl } from "~/shared/lib/validation";
import { Avatar, Icon, PresenceIndicator, ScrollArea } from "~/shared/ui";
import { RightPanelAbout } from "./right-panel-about.ui";
import { RightPanelBuilds } from "./right-panel-builds.ui";
import { RightPanelUserMenu } from "./right-panel-user-menu.ui";

const log = createLogger("right-panel");

/** User data for the DM info panel */
export interface RightPanelUserInfo {
  name: string;
  lastSeen?: string;
  status?: string;
  /** Full avatar URL (or relative path — realm will be prepended) */
  avatarUrl?: string | null;
  userId?: number;
  email?: string;
  phone?: string;
  username?: string;
  role?: string;
  timezone?: string;
  dateJoined?: string;
  isBot?: boolean;
  isActive?: boolean;
  profileLink?: string;
  jobTitle?: string;
  manager?: string;
  localTime?: string;
  birthday?: string;
  media?: { photos?: number; videos?: number; files?: number; links?: number };
  commonGroups?: { name: string; lastMessage?: string; unread?: number; slug?: string }[];
}

interface RightPanelProps {
  mode?: "info" | "settings" | "user-menu" | "about" | "builds";
  /** For channels: name and counters */
  title: string;
  participantsCount?: number;
  onlineCount?: number;
  /** For DMs: user data (when present, shows the user info panel) */
  user?: RightPanelUserInfo;
  /** Navigation callback for common group items */
  onSelectCommonGroup?: (slug: string) => void;
  /** Optional callback to open a direct message with the profile user */
  onOpenDirectMessage?: (userId: number) => void;
  /** Backward-compatible callback for legacy settings opener */
  onOpenSettingsDrawer?: () => void;
  /** Optional callback used by authenticated user menu mode */
  onOpenAboutDrawer?: () => void;
  /** Optional callback used by authenticated user menu mode */
  onOpenBuildsDrawer?: () => void;
}

type RightPanelInfoProps = Omit<RightPanelProps, "mode">;

function resolveAvatarSrc(url: string | undefined | null): string | undefined {
  return resolveAvatarUrl(url, getRealmBaseUrl());
}

function buildStreamSlug(streamId: number, streamName: string): string {
  const lower = streamName.trim().toLowerCase();
  const safe = lower.replace(/[^\p{L}\p{N}-]/gu, "-").replace(/-+/g, "-");
  const slug = safe.replace(/^-|-$/g, "") || "chat";
  return `${streamId}-${slug}`;
}

function buildMailtoHref(email: string | undefined): string | undefined {
  if (!email) return undefined;
  const trimmed = email.trim();
  if (!isValidEmail(trimmed)) return undefined;
  return `mailto:${trimmed}`;
}

function buildTelHref(phone: string | undefined): string | undefined {
  if (!phone) return undefined;
  const normalized = phone.replace(/[^\d+]/g, "");
  if (!/^\+?\d{5,}$/.test(normalized)) return undefined;
  return `tel:${normalized}`;
}

function formatDateJoined(dateJoined: string | undefined): string | undefined {
  if (!dateJoined) return undefined;
  const trimmed = dateJoined.trim();
  if (trimmed.length === 0) return undefined;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return trimmed;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function resolveMentionNickname({
  username,
  email,
}: Pick<RightPanelUserInfo, "username" | "email">): string | undefined {
  const candidates = [username, email];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const trimmed = candidate.trim();
    if (trimmed.length === 0) continue;
    const atIndex = trimmed.indexOf("@");
    const rawNick = atIndex > 0 ? trimmed.slice(0, atIndex) : trimmed;
    const normalizedNick = rawNick.trim();
    if (normalizedNick.length > 0) return normalizedNick;
  }

  return undefined;
}

function RightPanelUser({
  user,
  onSelectCommonGroup,
  onOpenDirectMessage,
}: {
  user: RightPanelUserInfo;
  onSelectCommonGroup?: (slug: string) => void;
  onOpenDirectMessage?: (userId: number) => void;
}) {
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

  const handleCopyMentionNickname = useCallback(async () => {
    if (!mentionCopyValue) return;
    setMentionCopyState("idle");
    const copied = await copyProfileValue(mentionCopyValue, "mention nickname");
    setMentionCopyState(copied ? "success" : "error");
  }, [copyProfileValue, mentionCopyValue]);

  const handleCopyEmail = useCallback(async () => {
    if (!emailCopyValue) return;
    setEmailCopyState("idle");
    const copied = await copyProfileValue(emailCopyValue, "email");
    setEmailCopyState(copied ? "success" : "error");
  }, [copyProfileValue, emailCopyValue]);

  const handleCopyUserId = useCallback(async () => {
    if (!userIdCopyValue) return;
    setUserIdCopyState("idle");
    const copied = await copyProfileValue(userIdCopyValue, "user id");
    setUserIdCopyState(copied ? "success" : "error");
  }, [copyProfileValue, userIdCopyValue]);

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
              <p className="truncate text-sm font-medium text-text-primary">{user.name}</p>
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
              {mentionCopyValue != null && (
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-card-bg"
                  onClick={() => void handleCopyMentionNickname()}
                >
                  <Icon name="alternate_email" size={16} className="shrink-0 text-current" />
                  <span>{mentionCopyButtonLabel}</span>
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
              {userIdCopyValue != null && (
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-card-bg"
                  onClick={() => void handleCopyUserId()}
                >
                  <Icon name="profile" size={16} className="shrink-0 text-current" />
                  <span>{userIdCopyButtonLabel}</span>
                </button>
              )}
            </div>
          )}
          {contactRows.length > 0 && (
            <ul className="mt-3 space-y-2">
              {contactRows.map((row) => (
                <li
                  key={row.label}
                  className="flex items-start gap-3 rounded-lg px-1 py-1.5 text-sm"
                >
                  <Icon name={row.icon} size={20} className="mt-0.5 shrink-0 text-icon-base" />
                  <div className="min-w-0 flex-1">
                    <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                      {row.label}
                    </p>
                    {row.href ? (
                      <a
                        href={row.href}
                        target={row.external ? "_blank" : undefined}
                        rel={row.external ? "noreferrer" : undefined}
                        className="inline-flex max-w-full items-center gap-1 text-accent underline-offset-2 hover:underline"
                      >
                        <span className="truncate whitespace-nowrap">{row.value}</span>
                        {row.external && (
                          <Icon name="newWindow" size={14} className="shrink-0 text-icon-base" />
                        )}
                      </a>
                    ) : (
                      <span className="block truncate whitespace-nowrap text-text-primary">
                        {row.value}
                      </span>
                    )}
                  </div>
                </li>
              ))}
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
}

function RightPanelDmGroup({
  title,
  data,
  onOpenUserProfile,
}: {
  title: string;
  data: ChatInfoData;
  onOpenUserProfile?: (userId: number) => void;
}) {
  const users = useUsersStore((s) => s.users);
  const members = useMemo(
    () =>
      data.members.map((member) => ({
        id: member.userId,
        name: member.fullName || t("roles.member"),
        email: member.email ?? "",
        statusLabel: formatUserStatusLabel(users.get(member.userId)?.status),
        isOnline: member.isOnline,
        avatarUrl: member.avatarUrl,
      })),
    [data.members, users],
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden text-text-primary">
      <header className="flex-shrink-0 border-b border-border-subtle px-4 pb-3 pt-0">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">{t("info.information")}</h2>
        <div className="flex items-center gap-3">
          <Avatar size="lg" className="bg-bg-elevated text-text-secondary">
            {title.slice(0, 1)}
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text-primary">{title}</p>
            <p className="text-[11px] text-text-secondary">
              {t("channel.participants", { count: data.memberCount })},{" "}
              {t("channel.online", { count: data.onlineCount })}
            </p>
          </div>
        </div>
      </header>

      <ScrollArea className="flex-1 space-y-4 px-4 py-3">
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
            <Icon name="profile" size={14} className="shrink-0 text-current" />
            {t("channel.members")}
          </h3>
          {members.length === 0 ? (
            <p className="px-2 py-3 text-center text-sm text-text-muted">
              {t("channel.noMembers")}
            </p>
          ) : (
            <ul className="space-y-2">
              {members.map((member) => (
                <li key={member.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-bg-elevated"
                    onClick={() => onOpenUserProfile?.(member.id)}
                    aria-label={t("a11y.openUserProfile", { name: member.name })}
                  >
                    <div className="relative shrink-0">
                      <Avatar
                        size="sm"
                        className="bg-bg-elevated text-text-primary"
                        src={resolveAvatarSrc(member.avatarUrl) ?? undefined}
                      >
                        {member.name.slice(0, 1)}
                      </Avatar>
                      <span className="absolute -bottom-0.5 -right-0.5">
                        <PresenceIndicator
                          status={member.isOnline ? "active" : "offline"}
                          size="sm"
                        />
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-text-primary">{member.name}</p>
                      {member.statusLabel ? (
                        <p className="truncate text-[11px] text-text-secondary">
                          {member.statusLabel}
                        </p>
                      ) : member.email.length > 0 ? (
                        <p className="truncate text-[11px] text-text-secondary">{member.email}</p>
                      ) : (
                        <p className="truncate text-[11px] text-text-secondary">
                          {member.isOnline ? t("presence.online") : t("presence.offline")}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

const RightPanelInfo: React.FC<RightPanelInfoProps> = ({
  title,
  participantsCount = 0,
  onlineCount = 0,
  user,
  onSelectCommonGroup,
  onOpenDirectMessage,
}) => {
  const navigate = useNavigate();
  const rightDrawer = useRightDrawer();
  const chatInfoData = useChatInfoStore((s) => s.data);
  const currentUserId = useChatListStore((s) => s.currentUserId);
  const currentUserRoleCode = useUsersStore((s) =>
    currentUserId != null ? s.getUser(currentUserId)?.role : undefined,
  );
  const users = useUsersStore((s) => s.users);
  const context = useCurrentChatMessagesStore((s) => s.context);
  const streamId = context?.type === "stream" ? context.streamId : null;
  const currentUserRole = parseRole(currentUserRoleCode);
  const canEditChannel = streamId != null && hasPermission(currentUserRole, "channel:edit");
  const canDeleteChannel = streamId != null && hasPermission(currentUserRole, "channel:delete");
  const isStreamMuted = useMuteStore((s) => (streamId ? s.isStreamMuted(streamId) : false));
  const [mutePending, setMutePending] = useState(false);
  const [muteError, setMuteError] = useState<string | null>(null);
  const [channelActionPending, setChannelActionPending] = useState(false);
  const [channelActionError, setChannelActionError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const handleToggleMute = useCallback(async () => {
    if (streamId == null || mutePending) return;

    setMutePending(true);
    setMuteError(null);
    try {
      if (isStreamMuted) {
        log.info("Unmuting stream from right panel", { streamId });
        const ok = await unmuteStream(streamId);
        if (ok) {
          useMuteStore.getState().unmuteStream(streamId);
        } else {
          setMuteError(t("app.error"));
        }
      } else {
        log.info("Muting stream from right panel", { streamId });
        const ok = await muteStream(streamId);
        if (ok) {
          useMuteStore.getState().muteStream(streamId);
        } else {
          setMuteError(t("app.error"));
        }
      }
    } finally {
      setMutePending(false);
    }
  }, [streamId, isStreamMuted, mutePending]);

  const handleOpenDirectMessage = useCallback(
    (userId: number) => {
      if (onOpenDirectMessage) {
        onOpenDirectMessage(userId);
        return;
      }
      void navigate(withCurrentOrgRoute(`/dm/${userId}`));
    },
    [navigate, onOpenDirectMessage],
  );
  const handleOpenUserProfile = useCallback(
    (userId: number) => {
      rightDrawer?.openUserProfile?.(userId);
    },
    [rightDrawer],
  );
  const memberStatusIds = useMemo(() => {
    if (chatInfoData?.type !== "dm" && chatInfoData?.type !== "stream") {
      return [];
    }
    const ids = chatInfoData.members
      .map((member) => member.userId)
      .filter((userId) => Number.isFinite(userId) && userId > 0);
    return Array.from(new Set(ids));
  }, [chatInfoData]);

  useEffect(() => {
    for (const userId of memberStatusIds) {
      void ensureUserStatusLoaded(userId);
    }
  }, [memberStatusIds]);

  const streamInfoName = chatInfoData?.type === "stream" ? chatInfoData.name : undefined;
  const handleOpenTopic = useCallback(
    (topicName: string) => {
      if (streamId == null) {
        return;
      }
      const streamName = streamInfoName?.trim() || title;
      void navigate(
        withCurrentOrgRoute(
          `/stream/${buildStreamSlug(streamId, streamName)}/topic/${encodeURIComponent(topicName)}`,
        ),
      );
    },
    [navigate, streamId, streamInfoName, title],
  );

  if (user) {
    return (
      <RightPanelUser
        user={user}
        onSelectCommonGroup={onSelectCommonGroup}
        onOpenDirectMessage={handleOpenDirectMessage}
      />
    );
  }

  if (chatInfoData?.type === "dm") {
    return (
      <RightPanelDmGroup
        title={title}
        data={chatInfoData}
        onOpenUserProfile={handleOpenUserProfile}
      />
    );
  }

  const streamInfoData = chatInfoData?.type === "stream" ? chatInfoData : null;
  const hasRealMembers = streamInfoData != null && streamInfoData.members.length > 0;
  const members = hasRealMembers
    ? streamInfoData.members.map((m, i) => ({
        userId: m.userId,
        name: m.fullName || t("roles.member"),
        status:
          formatUserStatusLabel(users.get(m.userId)?.status) ??
          (m.isOnline ? t("presence.online") : t("presence.offline")),
        isOwner: i === 0,
        isOnline: m.isOnline,
        avatarUrl: m.avatarUrl,
      }))
    : [];
  const rawChannelDescription =
    streamInfoData != null ? streamInfoData.description?.trim() : undefined;
  const channelDescription =
    rawChannelDescription != null && rawChannelDescription.length > 0
      ? rawChannelDescription
      : null;
  const channelTopics = streamInfoData?.topics ?? [];
  const handleOpenEdit = () => {
    setChannelActionError(null);
    setEditName(title);
    setEditDescription(channelDescription ?? "");
    setEditOpen(true);
  };
  const handleSaveEdit = async () => {
    if (streamId == null || channelActionPending) return;
    const trimmedName = editName.trim();
    if (trimmedName.length === 0) {
      setChannelActionError(t("app.error"));
      return;
    }

    setChannelActionPending(true);
    setChannelActionError(null);
    const ok = await updateStream(streamId, {
      name: trimmedName,
      description: editDescription.trim(),
    });
    if (ok) {
      useChatListStore.getState().renameStream(streamId, trimmedName);
      const nextInfo = useChatInfoStore.getState().data;
      if (nextInfo?.type === "stream") {
        useChatInfoStore.getState().setData({
          ...nextInfo,
          name: trimmedName,
          description: editDescription.trim().length > 0 ? editDescription.trim() : null,
        });
      }
      void navigate(withCurrentOrgRoute(`/stream/${buildStreamSlug(streamId, trimmedName)}`), {
        replace: true,
      });
      setEditOpen(false);
    } else {
      setChannelActionError(t("app.error"));
    }
    setChannelActionPending(false);
  };
  const handleDeleteChannel = async () => {
    if (streamId == null || channelActionPending) return;
    if (!window.confirm(t("channel.deleteChannel"))) return;

    setChannelActionPending(true);
    setChannelActionError(null);
    const ok = await deleteStream(streamId);
    if (ok) {
      const chatList = useChatListStore.getState();
      chatList.removeStream(streamId);
      useChatInfoStore.getState().clear();
      useCurrentChatMessagesStore.getState().setContext(null);
      useCurrentChatMessagesStore.getState().setMessages([]);

      const nextStream = chatList.streams()[0];
      if (nextStream) {
        void navigate(
          withCurrentOrgRoute(`/stream/${buildStreamSlug(nextStream.stream_id, nextStream.name)}`),
          {
            replace: true,
          },
        );
      } else {
        void navigate("/", { replace: true });
      }
    } else {
      setChannelActionError(t("app.error"));
    }
    setChannelActionPending(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden text-text-primary">
      <header className="flex-shrink-0 border-b border-border-subtle px-4 pb-3 pt-0">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">{t("info.channelInfo")}</h2>
        <div className="flex items-center gap-3">
          <Avatar size="lg" className="bg-bg-elevated text-text-secondary">
            {title.slice(0, 1)}
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text-primary">{title}</p>
            <p className="text-[11px] text-text-secondary">
              {t("channel.participants", { count: participantsCount })},{" "}
              {t("channel.online", { count: onlineCount })}
            </p>
          </div>
        </div>
      </header>

      <ScrollArea className="flex-1 space-y-4 px-4 py-3">
        {streamId != null && (
          <div>
            <button
              type="button"
              onClick={handleToggleMute}
              disabled={mutePending}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
            >
              <Icon
                name="bell"
                size={20}
                className={`shrink-0 ${isStreamMuted ? "text-notice-base" : "text-current"}`}
              />
              <span>{isStreamMuted ? t("channel.unmuteChannel") : t("channel.muteChannel")}</span>
            </button>
            {muteError && (
              <div className="mt-1 flex items-center justify-between gap-2 px-2 text-xs text-notice-base">
                <span>{muteError}</span>
                <button
                  type="button"
                  onClick={handleToggleMute}
                  className="hover:bg-notice-base/20 rounded px-1.5 py-0.5 text-notice-base hover:text-notice-base"
                >
                  {t("common.retry")}
                </button>
              </div>
            )}
            {(canEditChannel || canDeleteChannel) && (
              <div className="mt-2 space-y-1.5">
                {canEditChannel && (
                  <button
                    type="button"
                    onClick={handleOpenEdit}
                    disabled={channelActionPending}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
                  >
                    <Icon name="pen" size={20} className="shrink-0 text-current" />
                    <span>{t("channel.editChannel")}</span>
                  </button>
                )}
                {canDeleteChannel && (
                  <button
                    type="button"
                    onClick={handleDeleteChannel}
                    disabled={channelActionPending}
                    className="hover:bg-notice-base/10 flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm text-notice-base hover:text-notice-base"
                  >
                    <Icon name="close" size={20} className="shrink-0 text-current" />
                    <span>{t("channel.deleteChannel")}</span>
                  </button>
                )}
                {channelActionError && (
                  <p className="px-2 text-xs text-notice-base">{channelActionError}</p>
                )}
              </div>
            )}
            {editOpen && (
              <div className="mt-2 rounded-lg bg-bg-elevated px-2 py-2">
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-text-secondary">
                    {t("channel.channelName")}
                    <input
                      type="text"
                      aria-label={t("channel.channelName")}
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      className="mt-1 w-full rounded-md border border-border-subtle bg-bg px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                    />
                  </label>
                  <label className="block text-xs font-medium text-text-secondary">
                    {t("channel.description")}
                    <textarea
                      aria-label={t("channel.description")}
                      value={editDescription}
                      onChange={(event) => setEditDescription(event.target.value)}
                      rows={3}
                      className="mt-1 w-full resize-none rounded-md border border-border-subtle bg-bg px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                    />
                  </label>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      className="rounded-md px-2 py-1 text-xs text-text-secondary hover:bg-bg hover:text-text-primary"
                      onClick={() => setEditOpen(false)}
                      disabled={channelActionPending}
                    >
                      {t("common.cancel")}
                    </button>
                    <button
                      type="button"
                      className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-on-accent hover:opacity-90 disabled:opacity-60"
                      onClick={handleSaveEdit}
                      disabled={channelActionPending}
                    >
                      {t("common.save")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {channelDescription && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              {t("chatInfo.description")}
            </h3>
            <p className="rounded-lg bg-bg-elevated px-2 py-2 text-sm text-text-primary">
              {channelDescription}
            </p>
          </div>
        )}

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {t("channel.topics")}
          </h3>
          {channelTopics.length === 0 ? (
            <p className="px-2 py-2 text-sm text-text-muted">{t("channel.noTopics")}</p>
          ) : (
            <ul className="space-y-1.5">
              {channelTopics.map((topic) => (
                <li key={topic.name}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-text-primary transition-colors hover:bg-bg-elevated"
                    onClick={() => handleOpenTopic(topic.name)}
                  >
                    <span className="truncate">{topic.name}</span>
                    {topic.unreadCount > 0 && (
                      <span className="flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-medium text-on-accent">
                        {topic.unreadCount}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-text-secondary">
            <span className="flex items-center gap-2">
              <Icon name="profile" size={14} className="shrink-0 text-current" />
              {t("channel.members")}
            </span>
          </h3>
          {members.length === 0 ? (
            <p className="px-2 py-3 text-center text-sm text-text-muted">
              {t("channel.noMembers")}
            </p>
          ) : (
            <ul className="space-y-2">
              {members.map((p, i) => (
                <li key={p.userId}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-bg-elevated"
                    onClick={() => handleOpenUserProfile(p.userId)}
                    aria-label={t("a11y.openUserProfile", { name: p.name })}
                  >
                    <div className="relative shrink-0">
                      <Avatar
                        size="sm"
                        className="bg-bg-elevated text-text-primary"
                        src={resolveAvatarSrc(p.avatarUrl) ?? undefined}
                      >
                        {p.name.slice(0, 1)}
                      </Avatar>
                      <span className="absolute -bottom-0.5 -right-0.5">
                        <PresenceIndicator status={p.isOnline ? "active" : "offline"} size="sm" />
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm text-text-primary">
                        {p.name}
                        {p.isOwner && (
                          <span className="text-[10px] font-normal text-text-secondary">
                            {t("roles.owner")}
                          </span>
                        )}
                      </p>
                      {p.status && (
                        <p className="truncate text-[11px] text-text-secondary">{p.status}</p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export const RightPanel: React.FC<RightPanelProps> = ({ mode = "info", ...props }) => {
  const [menuSubview, setMenuSubview] = useState<"menu" | "about" | "builds">("menu");

  useEffect(() => {
    setMenuSubview("menu");
  }, [mode]);

  const handleOpenAbout = useCallback(() => {
    if (props.onOpenAboutDrawer != null) {
      props.onOpenAboutDrawer();
      return;
    }
    setMenuSubview("about");
  }, [props.onOpenAboutDrawer]);

  const handleOpenBuilds = useCallback(() => {
    if (props.onOpenBuildsDrawer != null) {
      props.onOpenBuildsDrawer();
      return;
    }
    setMenuSubview("builds");
  }, [props.onOpenBuildsDrawer]);

  if (mode === "settings" || mode === "user-menu") {
    if (menuSubview === "about") {
      return <RightPanelAbout />;
    }
    if (menuSubview === "builds") {
      return <RightPanelBuilds />;
    }

    return (
      <RightPanelUserMenu
        heading={mode === "settings" ? t("settings.settings") : undefined}
        onOpenAboutDrawer={handleOpenAbout}
        onOpenBuildsDrawer={handleOpenBuilds}
      />
    );
  }

  if (mode === "about") {
    return <RightPanelAbout />;
  }

  if (mode === "builds") {
    return <RightPanelBuilds />;
  }

  return <RightPanelInfo {...props} />;
};
