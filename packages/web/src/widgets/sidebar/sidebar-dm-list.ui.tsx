import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { resolvePersonalDmSidebarTitle } from "~/entities/chat-list/chat-list-format.lib";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useUsersStore } from "~/entities/user/user.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import { useTypingIndicatorStore } from "~/features/typing-indicator/typing-indicator.model";
import { t } from "~/i18n/i18n";
import { getRealmBaseUrl } from "~/shared/api/zulip";
import { resolveAvatarUrl } from "~/shared/lib/avatar";
import { effectiveDmIsGroupFromSlug } from "~/shared/lib/dm-route.lib";
import { getPresenceState, sidebarRowClass } from "~/shared/lib/format";
import { Avatar } from "~/shared/ui/avatar";
import { Badge } from "~/shared/ui/badge";
import { Icon } from "~/shared/ui/icon";
import { PresenceIndicator } from "~/shared/ui/presence-indicator";
import { isDmPartnerTyping, sortDmAllUsersForDisplay } from "./sidebar-dm-list.lib";
import { SidebarUserStatusEmoji } from "./sidebar-user-status-emoji.ui";
import { MOCK_DMS, parseDmSlugToUserIds } from "./sidebar.lib";
import type { SidebarDmListProps, SidebarDmTab } from "./sidebar-dm-list.types";
import type { SidebarChat } from "./sidebar.types";

function isPersonalDmChat(
  chat: SidebarChat,
  currentUserId: number | null,
): chat is Extract<SidebarChat, { type: "dm" }> {
  if (chat.type !== "dm") return false;
  return !effectiveDmIsGroupFromSlug(chat.isGroup, parseDmSlugToUserIds(chat.slug), currentUserId);
}

function resolvePersonalDmListAvatarSrc(
  chatAvatarUrl: string | undefined,
  userAvatarUrl: string | undefined | null,
): string | undefined {
  const base = getRealmBaseUrl();
  return (
    resolveAvatarUrl(chatAvatarUrl, base) ?? resolveAvatarUrl(userAvatarUrl ?? undefined, base)
  );
}

export const SidebarDmList: React.FC<SidebarDmListProps> = ({ activeDmId, dms }) => {
  const [tab, setTab] = useState<SidebarDmTab>("recent");
  const currentUserId = useChatListStore((s) => s.currentUserId);
  const allUsers = useUsersStore((s) => s.users);
  const isCompactDensity = useSettingsStore((s) => s.chatListDensity === "compact");
  const typingMap = useTypingIndicatorStore((s) => s.typingMap);

  const recentDms = useMemo(
    () => (dms ?? MOCK_DMS).filter((c) => isPersonalDmChat(c, currentUserId)),
    [dms, currentUserId],
  );
  const unreadByUserId = useMemo(() => {
    const unreadByUser = new Map<number, number>();
    for (const chat of recentDms) {
      unreadByUser.set(chat.id, chat.badge ?? 0);
    }
    return unreadByUser;
  }, [recentDms]);

  const allUsersList = useMemo(() => {
    if (tab !== "all") return [];
    return sortDmAllUsersForDisplay(Array.from(allUsers.values()), unreadByUserId, currentUserId);
  }, [allUsers, currentUserId, tab, unreadByUserId]);

  return (
    <div className="px-3">
      <div className="mb-2 flex gap-1 rounded-lg bg-card-bg p-0.5">
        <button
          type="button"
          onClick={() => setTab("recent")}
          className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
            tab === "recent"
              ? "bg-accent text-on-accent"
              : "text-text-muted hover:text-text-primary"
          }`}
        >
          {t("dm.recentDms")}
        </button>
        <button
          type="button"
          onClick={() => setTab("all")}
          className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
            tab === "all" ? "bg-accent text-on-accent" : "text-text-muted hover:text-text-primary"
          }`}
        >
          {t("dm.allUsers")}
        </button>
      </div>

      <div className="space-y-0.5">
        {tab === "recent" &&
          recentDms.map((chat) => {
            const isActive = chat.id === activeDmId;
            const recentDmUser = allUsers.get(chat.id);
            const storeDisplayName = useUsersStore.getState().getDisplayName(chat.id);
            const rowTitle = resolvePersonalDmSidebarTitle({
              chatName: chat.name,
              userFullName: recentDmUser?.full_name,
              storeDisplayName,
            });
            const recentPresenceState =
              recentDmUser?.presence != null
                ? getPresenceState(recentDmUser.presence.timestamp, recentDmUser.presence.status)
                : null;
            const isTyping = isDmPartnerTyping({
              partnerUserId: chat.id,
              currentUserId,
              typingMap,
            });
            const secondaryText = isTyping ? t("chat.typing") : (chat.lastMessage ?? "");
            const avatarSrc = resolvePersonalDmListAvatarSrc(
              chat.avatar_url,
              recentDmUser?.avatar_url,
            );
            return (
              <Link
                key={`dm-${chat.id}`}
                to={`/dm/${chat.slug}`}
                className={`flex items-start ${
                  isCompactDensity
                    ? "gap-2 rounded-md px-2 py-1.5"
                    : "gap-3 rounded-lg px-2.5 py-2.5"
                } transition-colors ${sidebarRowClass(isActive)}`}
              >
                <div className="relative shrink-0">
                  <Avatar size={isCompactDensity ? "sm" : "md"} src={avatarSrc}>
                    {rowTitle.slice(0, 1)}
                  </Avatar>
                  <PresenceIndicator
                    status={recentPresenceState}
                    size="sm"
                    className="absolute bottom-0 right-0"
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="min-w-0 truncate text-sm font-medium text-text-primary">
                      {rowTitle}
                    </span>
                    <SidebarUserStatusEmoji status={recentDmUser?.status} />
                  </div>
                  {!isCompactDensity && (
                    <span
                      className={`mt-0.5 block truncate text-[11px] ${
                        isTyping ? "italic text-text-primary" : "text-text-secondary"
                      }`}
                    >
                      {secondaryText}
                    </span>
                  )}
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-0.5">
                  <div className="flex items-center gap-1">
                    {chat.pinned && <Icon name="pin" size={12} className="text-text-muted" />}
                    <span className="text-xs text-text-muted">{chat.time ?? ""}</span>
                  </div>
                  {chat.badge !== undefined && <Badge count={chat.badge} variant="unread" />}
                </div>
              </Link>
            );
          })}

        {tab === "all" &&
          allUsersList.map((user) => {
            const presenceState =
              user.presence != null
                ? getPresenceState(user.presence.timestamp, user.presence.status)
                : null;
            const isTyping = isDmPartnerTyping({
              partnerUserId: user.user_id,
              currentUserId,
              typingMap,
            });
            const allUsersAvatarSrc = resolveAvatarUrl(user.avatar_url, getRealmBaseUrl());
            return (
              <Link
                key={`user-${user.user_id}`}
                to={`/dm/${user.user_id}-${user.full_name.toLowerCase().replace(/\s+/g, "-")}`}
                className={`flex items-center ${
                  isCompactDensity ? "gap-2 rounded-md px-2 py-1.5" : "gap-3 rounded-lg px-2.5 py-2"
                } transition-colors ${sidebarRowClass(false)}`}
              >
                <div className="relative shrink-0">
                  <Avatar size={isCompactDensity ? "sm" : "md"} src={allUsersAvatarSrc}>
                    {user.full_name.slice(0, 1)}
                  </Avatar>
                  <PresenceIndicator
                    status={presenceState}
                    size="sm"
                    className="absolute bottom-0 right-0"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="min-w-0 truncate text-sm font-medium text-text-primary">
                      {user.full_name}
                    </span>
                    <SidebarUserStatusEmoji status={user.status} />
                  </div>
                  {!isCompactDensity && isTyping ? (
                    <span className="block truncate text-[11px] italic text-text-primary">
                      {t("chat.typing")}
                    </span>
                  ) : !isCompactDensity ? (
                    <span className="block truncate text-[11px] text-text-secondary">
                      {user.email ?? ""}
                    </span>
                  ) : null}
                </div>
              </Link>
            );
          })}
      </div>
    </div>
  );
};
