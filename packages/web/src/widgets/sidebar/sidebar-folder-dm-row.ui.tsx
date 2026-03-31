import React from "react";
import { Link } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useUsersStore } from "~/entities/user/user.model";
import { formatUserStatusLabel } from "~/entities/user/user-status.lib";
import { useTypingIndicatorStore } from "~/features/typing-indicator/typing-indicator.model";
import { t } from "~/i18n/i18n";
import { getRealmBaseUrl } from "~/shared/api/zulip";
import { resolveAvatarUrl } from "~/shared/lib/avatar";
import { sidebarRowClass, getPresenceState } from "~/shared/lib/format";
import { Avatar } from "~/shared/ui/avatar";
import { Badge } from "~/shared/ui/badge";
import { Icon } from "~/shared/ui/icon";
import { isDmPartnerTyping } from "./sidebar-dm-list.lib";
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
  const partnerUserId = chat.isGroup ? null : chat.id;
  const currentUserId = useChatListStore((s) => s.currentUserId);
  const typingMap = useTypingIndicatorStore((s) => s.typingMap);
  const user = useUsersStore((s) => (partnerUserId != null ? s.getUser(partnerUserId) : undefined));
  const partnerIsTyping = isDmPartnerTyping({
    partnerUserId,
    currentUserId,
    typingMap,
  });
  const statusLabel = formatUserStatusLabel(user?.status);
  const secondaryText = partnerIsTyping
    ? t("chat.typing")
    : statusLabel != null && statusLabel.length > 0
      ? chat.lastMessage != null && chat.lastMessage.length > 0
        ? `${statusLabel} · ${chat.lastMessage}`
        : statusLabel
      : (chat.lastMessage ?? "");
  const presenceState =
    user?.presence != null ? getPresenceState(user.presence.timestamp, user.presence.status) : null;
  const avatarSrc = !chat.isGroup ? getAvatarUrl(chat.avatar_url) : null;
  const rowClass = compact
    ? "flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors"
    : "flex items-start gap-3 rounded-lg px-2.5 py-2.5 transition-colors";

  return (
    <Link
      to={`/dm/${chat.slug}`}
      className={`${rowClass} ${sidebarRowClass(isActive)}`}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
    >
      <div className="relative shrink-0">
        <Avatar size={compact ? "sm" : "md"} src={avatarSrc ?? undefined}>
          {chat.isGroup ? (
            <span data-testid={`group-avatar-icon-${chat.slug}`}>
              <Icon name="group" size={16} className="text-text-primary" />
            </span>
          ) : (
            chat.name.slice(0, 1)
          )}
        </Avatar>
        {presenceState === "active" && (
          <span
            className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-bg bg-indicator-green"
            aria-label={t("a11y.online")}
          />
        )}
        {presenceState === "idle" && (
          <span
            className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-bg bg-indicator-orange"
            aria-label={t("a11y.away")}
          />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <span className="block truncate text-sm font-medium text-text-primary">{chat.name}</span>
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
