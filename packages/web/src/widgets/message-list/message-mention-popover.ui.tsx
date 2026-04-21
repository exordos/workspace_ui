import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useChatDmCallBridgeStore } from "~/features/chat-dm-call-bridge/chat-dm-call-bridge.model";
import { ensureUserStatusLoaded } from "~/entities/user/api/user.api";
import { ProfileCustomFieldsBlock } from "~/entities/user/profile-custom-fields-block.ui";
import { formatUserStatusLabel } from "~/entities/user/user-status.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { t } from "~/i18n/i18n";
import { fetchUser } from "~/shared/api/zulip";
import { getRealmBaseUrl } from "~/shared/api/zulip-client.internal";
import { formatLastSeen, getPresenceState } from "~/shared/lib/format";
import { isValidEmail } from "~/shared/lib/validation";
import { Avatar } from "~/shared/ui/avatar";
import { Copyable } from "~/shared/ui/copyable";
import { Icon } from "~/shared/ui/icon";
import { resolveAvatarSrc } from "./message-avatar.lib";
import {
  computeMentionPopoverPosition,
  MENTION_POPOVER_EST_HEIGHT,
  MENTION_POPOVER_WIDTH,
} from "./message-mention-popover-position.lib";
import type { MessageMentionPopoverProps } from "./message-mention-popover.types";

type MentionInfoIcon = "profile" | "mail";

const MentionPopoverInfoRow = React.memo(function MentionPopoverInfoRow({
  icon,
  label,
  children,
  copyValue,
  copyAriaLabel,
}: {
  icon: MentionInfoIcon;
  label: string;
  children: React.ReactNode;
  copyValue?: string;
  copyAriaLabel?: string;
}) {
  return (
    <li className="flex gap-2">
      <Icon name={icon} size={16} className="mt-0.5 shrink-0 text-icon-base" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
          {label}
        </p>
        {copyValue != null ? (
          <Copyable
            value={copyValue}
            copyAriaLabel={copyAriaLabel}
            className="max-w-full"
            contentClassName="min-w-0 truncate text-sm text-text-primary"
          >
            {children}
          </Copyable>
        ) : (
          <div className="truncate text-sm text-text-primary">{children}</div>
        )}
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
    onOpenUserProfile,
  ]);

  const handleOpenDm = useCallback(() => {
    onOpenDirectMessage(userId);
    onClose();
  }, [onClose, onOpenDirectMessage, userId]);

  const currentUserId = useChatListStore((s) => s.currentUserId);
  const profileDmCallHandlerReady = useChatDmCallBridgeStore(
    (s) => s.invokeDmCallFromProfileHandler != null,
  );
  const handleProfileDmCall = useCallback(() => {
    useChatDmCallBridgeStore.getState().invokeDmCallFromProfile(userId);
    onClose();
  }, [onClose, userId]);

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
            <Copyable value={displayName} className="w-full">
              <p className="truncate text-sm font-semibold text-text-primary">{displayName}</p>
            </Copyable>
            <p className="truncate text-xs text-text-muted">{statusLine}</p>
          </div>
        </div>
        <div className="mt-3 max-h-[calc(100dvh-12rem)] min-h-0 overflow-y-auto overscroll-contain border-t border-border-subtle pt-3">
          <div className="flex flex-col gap-3">
            <ProfileCustomFieldsBlock
              profileData={user?.profile_data}
              baseUrl={getRealmBaseUrl() || undefined}
              density="compact"
              showSectionTitle={false}
              onOpenUserProfile={onOpenUserProfile}
            />
            <ul className="space-y-2 border-t border-border-subtle pt-3 first:border-t-0 first:pt-0">
              <MentionPopoverInfoRow
                icon="profile"
                label={t("info.userId")}
                copyValue={String(userId)}
                copyAriaLabel={t("info.copyUserId")}
              >
                {String(userId)}
              </MentionPopoverInfoRow>
              {mailtoHref != null && emailTrimmed != null ? (
                <MentionPopoverInfoRow
                  icon="mail"
                  label={t("common.email")}
                  copyValue={emailTrimmed}
                  copyAriaLabel={t("info.copyEmail")}
                >
                  <a
                    href={mailtoHref}
                    className="text-accent underline-offset-2 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {emailTrimmed}
                  </a>
                </MentionPopoverInfoRow>
              ) : null}
            </ul>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-on-accent hover:opacity-90"
            onClick={handleOpenDm}
          >
            <Icon name="chatBubble" size={16} className="shrink-0 text-current" />
            <span className="truncate">{t("info.openDirectMessages")}</span>
          </button>
          {profileDmCallHandlerReady && currentUserId != null && userId !== currentUserId && (
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
      </div>
    </>,
    document.body,
  );
});

MessageMentionPopover.displayName = "MessageMentionPopover";
