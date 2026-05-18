import React, { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { resolvePersonalDmSidebarTitle } from "~/entities/chat-list/chat-list-format.lib";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { ensureUserStatusLoaded } from "~/entities/user/api/user.api";
import { useUsersStore } from "~/entities/user/user.model";
import { useTypingIndicatorStore } from "~/features/typing-indicator/typing-indicator.model";
import { t } from "~/i18n/i18n";
import { getRealmBaseUrl } from "~/shared/api/zulip-client.internal";
import { resolveAvatarUrl } from "~/shared/lib/avatar";
import { computeIsGroupDmView, normalizeDmRouteUserIds } from "~/shared/lib/dm-route.lib";
import { sidebarRowClass, getPresenceState } from "~/shared/lib/format";
import { Avatar } from "~/shared/ui/avatar";
import { Badge } from "~/shared/ui/badge";
import { Icon } from "~/shared/ui/icon";
import { PresenceIndicator } from "~/shared/ui/presence-indicator";
import { isDmPartnerTyping } from "./sidebar-dm-list.lib";
import { SidebarUserStatusEmoji } from "./sidebar-user-status-emoji.ui";
import { parseDmSlugToUserIds } from "./sidebar.lib";
import type { DmChatRowProps } from "./sidebar-folder-dm-chat-row.types";

function getAvatarUrl(avatarUrl: string | undefined): string | null {
  return resolveAvatarUrl(avatarUrl, getRealmBaseUrl()) ?? null;
}

export const DmChatRow = React.memo<DmChatRowProps>(function DmChatRow({
  chat,
  isActive,
  isPinned,
  compact,
  onContextMenu,
  onKeyDown,
}) {
  const currentUserId = useChatListStore((s) => s.currentUserId);
  const slugUserIds = useMemo(() => parseDmSlugToUserIds(chat.slug), [chat.slug]);
  const normalizedPeerIds = useMemo(
    () => normalizeDmRouteUserIds(slugUserIds, currentUserId),
    [slugUserIds, currentUserId],
  );
  const isGroupDm = useMemo(
    () => computeIsGroupDmView({ isGroup: chat.isGroup }, normalizedPeerIds, currentUserId),
    [chat.isGroup, normalizedPeerIds, currentUserId],
  );
  const partnerUserId = isGroupDm ? null : (normalizedPeerIds[0] ?? chat.id);
  const typingMap = useTypingIndicatorStore((s) => s.typingMap);
  const user = useUsersStore((s) => (partnerUserId != null ? s.getUser(partnerUserId) : undefined));
  const storeDisplayName = useUsersStore((s) =>
    partnerUserId != null ? s.getDisplayName(partnerUserId) : "Unknown",
  );
  const rowTitle =
    isGroupDm || partnerUserId == null
      ? chat.name
      : resolvePersonalDmSidebarTitle({
          chatName: chat.name,
          userFullName: user?.full_name,
          storeDisplayName,
        });
  const partnerIsTyping = isDmPartnerTyping({
    partnerUserId,
    currentUserId,
    typingMap,
  });
  const secondaryText = partnerIsTyping ? t("chat.typing") : (chat.lastMessage ?? "");
  const partnerDeactivated = user?.is_active === false;
  const presenceState =
    user?.presence != null ? getPresenceState(user.presence.timestamp, user.presence.status) : null;
  const avatarSrc = !isGroupDm
    ? (getAvatarUrl(user?.avatar_url ?? undefined) ?? getAvatarUrl(chat.avatar_url))
    : null;
  const rowClass = compact
    ? "flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors"
    : "flex items-start gap-3 rounded-lg px-2.5 py-2.5 transition-colors";

  useEffect(() => {
    if (partnerUserId == null) {
      return;
    }
    void ensureUserStatusLoaded(partnerUserId);
  }, [partnerUserId]);

  return (
    <Link
      to={`/dm/${chat.slug}`}
      className={`${rowClass} ${sidebarRowClass(isActive)}`}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
    >
      <div className="relative shrink-0">
        <Avatar size={compact ? "sm" : "md"} src={avatarSrc ?? undefined}>
          {isGroupDm ? (
            <span data-testid={`group-avatar-icon-${chat.slug}`}>
              <Icon name="group" size={16} className="text-text-primary" />
            </span>
          ) : (
            rowTitle.slice(0, 1)
          )}
        </Avatar>
        {!isGroupDm && (
          <PresenceIndicator
            status={presenceState}
            size="sm"
            deactivated={partnerDeactivated}
            className="absolute bottom-0 right-0"
          />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate text-sm font-medium text-text-primary">{rowTitle}</span>
          {!isGroupDm && <SidebarUserStatusEmoji status={user?.status} />}
        </div>
        {!compact && (
          <span
            className={`mt-0.5 block truncate text-[11px] ${
              partnerIsTyping ? "italic text-text-primary" : "text-text-secondary"
            }`}
          >
            {secondaryText}
          </span>
        )}
      </div>
      <div className={`flex flex-shrink-0 flex-col items-end ${compact ? "gap-0.5" : "gap-1"}`}>
        <div className="flex items-center gap-1">
          {isPinned && <Icon name="pin" size={12} className="text-text-muted" />}
          <span className="text-xs text-text-muted">{chat.time ?? "10:13"}</span>
          {chat.badge !== undefined && <Badge count={chat.badge} variant="unread" />}
        </div>
      </div>
    </Link>
  );
});
