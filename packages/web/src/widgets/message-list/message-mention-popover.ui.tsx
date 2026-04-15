import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { ensureUserStatusLoaded } from "~/entities/user/api/user.api";
import { ProfileCustomFieldsBlock } from "~/entities/user/profile-custom-fields-block.ui";
import { formatUserStatusLabel } from "~/entities/user/user-status.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { t } from "~/i18n/i18n";
import { fetchUser } from "~/shared/api/zulip";
import { getRealmBaseUrl } from "~/shared/api/zulip-client.internal";
import { formatLastSeen, getPresenceState } from "~/shared/lib/format";
import { getRoleLabel, parseRole } from "~/shared/lib/roles";
import { isValidEmail } from "~/shared/lib/validation";
import { Avatar } from "~/shared/ui/avatar";
import { Icon } from "~/shared/ui/icon";
import { resolveAvatarSrc } from "./message-avatar.lib";
import {
  computeMentionPopoverPosition,
  MENTION_POPOVER_EST_HEIGHT,
  MENTION_POPOVER_WIDTH,
} from "./message-mention-popover-position.lib";
import { extractMentionNicknameFromEmail } from "./message-mention-popover-user.lib";
import type { MessageMentionPopoverProps } from "./message-mention-popover.types";

type MentionInfoIcon = "profile" | "mail" | "at" | "group";

const MentionPopoverInfoRow = React.memo(function MentionPopoverInfoRow({
  icon,
  label,
  children,
}: {
  icon: MentionInfoIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-2">
      <Icon name={icon} size={16} className="mt-0.5 shrink-0 text-icon-base" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
          {label}
        </p>
        <div className="truncate text-sm text-text-primary">{children}</div>
      </div>
    </li>
  );
});

MentionPopoverInfoRow.displayName = "MentionPopoverInfoRow";

export const MessageMentionPopover = React.memo(function MessageMentionPopover({
  userId,
  anchorRect,
  fallbackName,
  onClose,
  onOpenDirectMessage,
  onOpenUserProfile,
}: MessageMentionPopoverProps) {
  const user = useUsersStore((s) => s.getUser(userId));
  const cardRef = useRef<HTMLDivElement>(null);
  const [popoverHeight, setPopoverHeight] = useState(MENTION_POPOVER_EST_HEIGHT);

  useEffect(() => {
    void ensureUserStatusLoaded(userId);
  }, [userId]);

  useEffect(() => {
    if (useUsersStore.getState().getUser(userId) != null) {
      return;
    }
    let cancelled = false;
    void fetchUser(userId).then((u) => {
      if (cancelled || u == null) return;
      useUsersStore.getState().mergeUser({
        user_id: u.user_id,
        full_name: u.full_name ?? "",
        email: u.email,
        avatar_url: u.avatar_url ?? undefined,
        role: u.role,
        profile_data: u.profile_data,
      });
      useChatListStore.getState().patchPersonalDmRowLabelsForUser(u.user_id);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const trimmedName = user?.full_name?.trim();
  const displayName =
    trimmedName != null && trimmedName.length > 0
      ? trimmedName
      : fallbackName.replace(/^@/, "").trim() || `#${userId}`;

  const presenceState =
    user?.presence != null ? getPresenceState(user.presence.timestamp, user.presence.status) : null;
  const lastSeen =
    user?.presence != null
      ? formatLastSeen(user.presence.timestamp, user.presence.status)
      : undefined;
  const customStatus = formatUserStatusLabel(user?.status);

  const presenceText =
    presenceState === "active"
      ? t("presence.online")
      : presenceState === "idle"
        ? t("presence.away")
        : lastSeen != null
          ? lastSeen === t("presence.online")
            ? t("presence.online")
            : t("presence.lastSeen", { time: lastSeen })
          : t("presence.offline");
  const statusLine = customStatus ?? presenceText;

  const avatarSrc = resolveAvatarSrc(user?.avatar_url ?? undefined);

  const emailTrimmed = user?.email?.trim();
  const mailtoHref =
    emailTrimmed != null && emailTrimmed.length > 0 && isValidEmail(emailTrimmed)
      ? `mailto:${emailTrimmed}`
      : undefined;
  const mentionNickname = extractMentionNicknameFromEmail(user?.email);
  const mentionDisplay =
    mentionNickname != null && mentionNickname.length > 0 ? `@${mentionNickname}` : undefined;
  const roleLabel = user?.role != null ? getRoleLabel(parseRole(user.role)) : undefined;

  const positionStyle = useMemo(() => {
    if (typeof window === "undefined") {
      return { left: 0, top: 0, width: MENTION_POPOVER_WIDTH };
    }
    const { left, top, width } = computeMentionPopoverPosition({
      anchorRect,
      popoverWidth: MENTION_POPOVER_WIDTH,
      popoverHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    return { left, top, width };
  }, [anchorRect, popoverHeight]);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (el == null) return;
    const { height } = el.getBoundingClientRect();
    if (height > 0) {
      setPopoverHeight((prev) => (Math.abs(height - prev) > 1 ? height : prev));
    }
  }, [
    displayName,
    statusLine,
    user?.avatar_url,
    user?.profile_data,
    emailTrimmed,
    mentionDisplay,
    roleLabel,
    onOpenUserProfile,
  ]);

  const handleOpenDm = useCallback(() => {
    onOpenDirectMessage(userId);
    onClose();
  }, [onClose, onOpenDirectMessage, userId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    const onScroll = () => {
      onClose();
    };
    const onResize = () => {
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [onClose]);

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-overlay bg-black/50"
        role="presentation"
        aria-hidden
        onMouseDown={onClose}
      />
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("message.mentionUserCard")}
        className="fixed z-modal rounded-lg border border-border-subtle bg-card-bg p-3 shadow-lg"
        style={{
          left: positionStyle.left,
          top: positionStyle.top,
          width: positionStyle.width,
        }}
      >
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <Avatar
              size="md"
              className="border-border-subtle bg-bg-elevated text-text-muted"
              src={avatarSrc}
              imageLoading="lazy"
            >
              {displayName.slice(0, 1).toUpperCase()}
            </Avatar>
            {presenceState === "active" && (
              <span
                className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-border-subtle bg-indicator-green"
                aria-label={t("a11y.online")}
              />
            )}
            {presenceState === "idle" && (
              <span
                className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-border-subtle bg-indicator-orange"
                aria-label={t("a11y.away")}
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-text-primary">{displayName}</p>
            <p className="truncate text-xs text-text-muted">{statusLine}</p>
          </div>
        </div>
        <div className="mt-2 max-h-44 overflow-y-auto border-t border-border-subtle pt-2">
          <ProfileCustomFieldsBlock
            profileData={user?.profile_data}
            baseUrl={getRealmBaseUrl() || undefined}
            density="compact"
            showSectionTitle={false}
            className=""
            onOpenUserProfile={onOpenUserProfile}
          />
          <ul className="space-y-2 border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
            <MentionPopoverInfoRow icon="profile" label={t("info.userId")}>
              {String(userId)}
            </MentionPopoverInfoRow>
            {mailtoHref != null && emailTrimmed != null ? (
              <MentionPopoverInfoRow icon="mail" label={t("common.email")}>
                <a
                  href={mailtoHref}
                  className="text-accent underline-offset-2 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {emailTrimmed}
                </a>
              </MentionPopoverInfoRow>
            ) : null}
            {mentionDisplay != null ? (
              <MentionPopoverInfoRow icon="at" label={t("info.atMention")}>
                <span className="text-accent">{mentionDisplay}</span>
              </MentionPopoverInfoRow>
            ) : null}
            {roleLabel != null ? (
              <MentionPopoverInfoRow icon="group" label={t("info.role")}>
                {roleLabel}
              </MentionPopoverInfoRow>
            ) : null}
          </ul>
        </div>
        <button
          type="button"
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-on-accent hover:opacity-90"
          onClick={handleOpenDm}
        >
          <Icon name="chatBubble" size={16} className="shrink-0 text-current" />
          <span>{t("info.openDirectMessages")}</span>
        </button>
      </div>
    </>,
    document.body,
  );
});

MessageMentionPopover.displayName = "MessageMentionPopover";
