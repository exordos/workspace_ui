import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list";
import { ensureUserStatusLoaded, formatUserStatusLabel, useUsersStore } from "~/entities/user";
import { useSettingsStore } from "~/features/settings";
import { useTypingIndicatorStore } from "~/features/typing-indicator";
import { t } from "~/i18n";
import { getPresenceState, sidebarRowClass } from "~/shared/lib/format";
import { Avatar, Badge, Icon, PresenceIndicator } from "~/shared/ui";
import { isDmPartnerTyping, sortDmAllUsersForDisplay } from "./sidebar-dm-list.lib";
import { MOCK_DMS } from "./sidebar.lib";
import type { SidebarChat } from "./sidebar.types";

interface SidebarDmListProps {
  activeDmId: number | null;
  dms?: Extract<SidebarChat, { type: "dm" }>[];
}

function isDm(chat: SidebarChat): chat is Extract<SidebarChat, { type: "dm" }> {
  return chat.type === "dm" && !chat.isGroup;
}

type DmTab = "recent" | "all";

export const SidebarDmList: React.FC<SidebarDmListProps> = ({ activeDmId, dms }) => {
  const [tab, setTab] = useState<DmTab>("recent");
  const currentUserId = useChatListStore((s) => s.currentUserId);
  const allUsers = useUsersStore((s) => s.users);
  const isCompactDensity = useSettingsStore((s) => s.chatListDensity === "compact");
  const typingMap = useTypingIndicatorStore((s) => s.typingMap);

  const recentDms = useMemo(() => (dms ?? MOCK_DMS).filter(isDm), [dms]);
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

  useEffect(() => {
    for (const chat of recentDms) {
      if (!Number.isFinite(chat.id) || chat.id <= 0) {
        continue;
      }
      void ensureUserStatusLoaded(chat.id);
    }
  }, [recentDms]);

  useEffect(() => {
    if (tab !== "all") {
      return;
    }
    for (const user of allUsersList) {
      void ensureUserStatusLoaded(user.user_id);
    }
  }, [tab, allUsersList]);

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
            const recentPresenceState =
              recentDmUser?.presence != null
                ? getPresenceState(recentDmUser.presence.timestamp, recentDmUser.presence.status)
                : null;
            const isTyping = isDmPartnerTyping({
              partnerUserId: chat.id,
              currentUserId,
              typingMap,
            });
            const statusLabel = formatUserStatusLabel(recentDmUser?.status);
            const secondaryText = isTyping
              ? t("chat.typing")
              : statusLabel != null && statusLabel.length > 0
                ? chat.lastMessage != null && chat.lastMessage.length > 0
                  ? `${statusLabel} · ${chat.lastMessage}`
                  : statusLabel
                : (chat.lastMessage ?? "");
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
                  <Avatar size={isCompactDensity ? "sm" : "md"}>{chat.name.slice(0, 1)}</Avatar>
                  <PresenceIndicator
                    status={recentPresenceState}
                    size="sm"
                    className="absolute bottom-0 right-0"
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center">
                  <span className="block truncate text-sm font-medium text-text-primary">
                    {chat.name}
                  </span>
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
            const statusLabel = formatUserStatusLabel(user.status);
            return (
              <Link
                key={`user-${user.user_id}`}
                to={`/dm/${user.user_id}-${user.full_name.toLowerCase().replace(/\s+/g, "-")}`}
                className={`flex items-center ${
                  isCompactDensity ? "gap-2 rounded-md px-2 py-1.5" : "gap-3 rounded-lg px-2.5 py-2"
                } transition-colors ${sidebarRowClass(false)}`}
              >
                <div className="relative shrink-0">
                  <Avatar size={isCompactDensity ? "sm" : "md"}>
                    {user.full_name.slice(0, 1)}
                  </Avatar>
                  <PresenceIndicator
                    status={presenceState}
                    size="sm"
                    className="absolute bottom-0 right-0"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text-primary">
                    {user.full_name}
                  </span>
                  {!isCompactDensity && isTyping ? (
                    <span className="block truncate text-[11px] italic text-text-primary">
                      {t("chat.typing")}
                    </span>
                  ) : !isCompactDensity ? (
                    <span className="block truncate text-[11px] text-text-secondary">
                      {statusLabel ?? user.email ?? ""}
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
