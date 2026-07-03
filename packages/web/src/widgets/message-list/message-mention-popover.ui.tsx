import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { ProfileCustomFieldsBlock } from "~/entities/user/profile-custom-fields-block.ui";
import { useUsersStore } from "~/entities/user/user.model";
import { useChatDmCallBridgeStore } from "~/features/chat-dm-call-bridge/chat-dm-call-bridge.model";
import { t } from "~/i18n/i18n";
import { getRealmBaseUrl } from "~/shared/api/zulip-client.internal";
import { APP_DIALOG_BACKDROP_STATIC_CLASS } from "~/shared/ui/app-dialog.ui";
import { Avatar } from "~/shared/ui/avatar";
import { Copyable } from "~/shared/ui/copyable";
import { Icon } from "~/shared/ui/icon";
import { SectionLabel } from "~/shared/ui/section-label.ui";
import { resolveAvatarSrc } from "./message-avatar.lib";
import {
  resolveMessageSenderDisplayName,
  resolveMessageSenderPresence,
  resolveMessageSenderUser,
} from "./message-list-user.lib";
import {
  computeMentionPopoverPosition,
  MENTION_POPOVER_EST_HEIGHT,
  MENTION_POPOVER_WIDTH,
} from "./message-mention-popover-position.lib";
import { resolveMentionPresenceText } from "./message-mention-popover-presence.lib";
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
        <SectionLabel>{label}</SectionLabel>
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
  userUuid,
  anchorRect,
  fallbackName,
  onClose,
  onOpenDirectMessage,
  onOpenDirectMessageByUuid,
  onOpenUserProfile,
}: MessageMentionPopoverProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [popoverHeight, setPopoverHeight] = useState(MENTION_POPOVER_EST_HEIGHT);
  const usersById = useUsersStore((s) => s.usersById);
  const user = resolveMessageSenderUser(usersById, {
    ...(userId != null ? { sender_id: userId } : {}),
    ...(userUuid != null ? { authorUuid: userUuid } : {}),
  });

  const fallbackDisplayName = fallbackName.replace(/^@/, "").trim();
  const displayName = resolveMessageSenderDisplayName(
    user,
    fallbackDisplayName.length > 0
      ? fallbackDisplayName
      : (userUuid ?? (userId != null ? `#${userId}` : "")),
  );

  const presenceState = resolveMessageSenderPresence(user);
  const lastSeen = undefined;

  const presenceText = resolveMentionPresenceText({ presenceState, lastSeen });
  const statusLine = presenceText;

  const avatarSrc = resolveAvatarSrc(user?.avatarUrl ?? undefined);

  const userEmail = user?.email?.trim();
  const emailTrimmed = userEmail != null && userEmail.length > 0 ? userEmail : undefined;
  const mailtoHref: string | undefined = undefined;
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
  }, [displayName, statusLine, emailTrimmed, onOpenUserProfile]);

  const handleOpenDm = useCallback(() => {
    if (userUuid != null && onOpenDirectMessageByUuid != null) {
      onOpenDirectMessageByUuid(userUuid);
      onClose();
      return;
    }
    if (userId != null && onOpenDirectMessage != null) {
      onOpenDirectMessage(userId);
      onClose();
    }
  }, [onClose, onOpenDirectMessage, onOpenDirectMessageByUuid, userId, userUuid]);

  const currentUserId = useChatListStore((s) => s.currentUserId);
  const profileDmCallHandlerReady = useChatDmCallBridgeStore(
    (s) => s.invokeDmCallFromProfileHandler != null,
  );
  const handleProfileDmCall = useCallback(() => {
    if (userId == null) return;
    useChatDmCallBridgeStore.getState().invokeDmCallFromProfile(userId);
    onClose();
  }, [onClose, userId]);
  const canOpenDm =
    (userUuid != null && onOpenDirectMessageByUuid != null) ||
    (userId != null && onOpenDirectMessage != null);

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
        className={APP_DIALOG_BACKDROP_STATIC_CLASS}
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
              profileData={undefined}
              baseUrl={getRealmBaseUrl() || undefined}
              density="compact"
              showSectionTitle={false}
              onOpenUserProfile={onOpenUserProfile}
            />
            <ul className="space-y-2 border-t border-border-subtle pt-3 first:border-t-0 first:pt-0">
              {userId != null ? (
                <MentionPopoverInfoRow
                  icon="profile"
                  label={t("info.userId")}
                  copyValue={String(userId)}
                  copyAriaLabel={t("info.copyUserId")}
                >
                  {String(userId)}
                </MentionPopoverInfoRow>
              ) : null}
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
          {canOpenDm && (
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-on-accent hover:opacity-90"
              onClick={handleOpenDm}
            >
              <Icon name="chatBubble" size={16} className="shrink-0 text-current" />
              <span className="truncate">{t("info.openDirectMessages")}</span>
            </button>
          )}
          {profileDmCallHandlerReady &&
            currentUserId != null &&
            userId != null &&
            userId !== currentUserId && (
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
