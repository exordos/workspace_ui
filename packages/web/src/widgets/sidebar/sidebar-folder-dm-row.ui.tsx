import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { resolvePersonalDmSidebarTitle } from "~/entities/chat-list/chat-list-format.lib";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useUsersStore } from "~/entities/user/user.model";
import { useTypingIndicatorStore } from "~/features/typing-indicator/typing-indicator.model";
import { t } from "~/i18n/i18n";
import { getRealmBaseUrl } from "~/shared/api/zulip-client.internal";
import { resolveAvatarUrl } from "~/shared/lib/avatar";
import { computeIsGroupDmView, normalizeDmRouteUserIds } from "~/shared/lib/dm-route.lib";
import { sidebarRowClass, getPresenceState } from "~/shared/lib/format";
import { Avatar } from "~/shared/ui/avatar";
import { Icon } from "~/shared/ui/icon";
import { PresenceIndicator } from "~/shared/ui/presence-indicator";
import { sidebarDmRoute } from "./sidebar-chat-routes.lib";
import { sidebarChatRowBodyClass, sidebarChatRowLinkClass } from "./sidebar-chat-row-layout.lib";
import { SidebarChatRowMeta } from "./sidebar-chat-row-meta.ui";
import { isDmPartnerTyping } from "./sidebar-dm-list.lib";
import { SidebarMessagePreview } from "./sidebar-message-preview.ui";
import { SidebarUserStatusEmoji } from "./sidebar-user-status-emoji.ui";
import { parseDmSlugToUserIds } from "./sidebar.lib";
import type { SidebarChat } from "./sidebar.types";

function getAvatarUrl(avatarUrl: string | undefined): string | null {
  return resolveAvatarUrl(avatarUrl, getRealmBaseUrl()) ?? null;
}

export const DmChatRow = React.memo(function DmChatRow({
  chat,
  isActive,
  isPinned,
  compact,
  onContextMenu,
  onKeyDown,
}: {
  chat: Extract<SidebarChat, { type: "dm" }>;
  isActive: boolean;
  isPinned: boolean;
  compact: boolean;
  onContextMenu?: React.MouseEventHandler;
  onKeyDown?: React.KeyboardEventHandler;
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
  const rowClass = sidebarChatRowLinkClass(compact);
  const dmRoute = useMemo(() => sidebarDmRoute(chat.slug), [chat.slug]);

  return (
    <Link
      to={dmRoute}
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
      <div className={sidebarChatRowBodyClass(compact)}>
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate text-sm font-medium text-text-primary">{rowTitle}</span>
          {!isGroupDm && <SidebarUserStatusEmoji status={user?.status} />}
        </div>
        {!compact && (
          <SidebarMessagePreview
            message={secondaryText}
            messageClassName={partnerIsTyping ? "italic text-text-primary" : undefined}
          />
        )}
      </div>
      <SidebarChatRowMeta
        compact={compact}
        isPinned={isPinned}
        unreadCount={chat.badge}
        hasMention={chat.hasMention}
        time={chat.time}
      />
    </Link>
  );
});
