import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { effectiveDmIsGroupFromSlug } from "~/shared/lib/dm-route.lib";
import { Avatar } from "~/shared/ui/avatar";
import { Badge } from "~/shared/ui/badge";
import { Icon } from "~/shared/ui/icon";
import { MOCK_GROUPS, parseDmSlugToUserIds } from "./sidebar.lib";
import type { SidebarChat } from "./sidebar.types";
import type { SidebarGroupListProps } from "./sidebar-group-list.types";

export const SidebarGroupList: React.FC<SidebarGroupListProps> = ({
  activeDmIdParam,
  expandedGroupIds,
  onToggleGroup,
  groupChats,
}) => {
  const currentUserId = useChatListStore((s) => s.currentUserId);
  const source: SidebarChat[] = groupChats && groupChats.length > 0 ? groupChats : MOCK_GROUPS;
  const list = useMemo(
    () =>
      source.filter(
        (c): c is Extract<SidebarChat, { type: "dm" }> =>
          c.type === "dm" &&
          effectiveDmIsGroupFromSlug(c.isGroup, parseDmSlugToUserIds(c.slug), currentUserId),
      ),
    [source, currentUserId],
  );
  return (
    <div className="space-y-0.5 px-3">
      {list.map((chat) => {
        const isActive = chat.slug === activeDmIdParam;
        const expanded = expandedGroupIds.has(chat.id);
        return (
          <div key={`group-${chat.id}`}>
            <div
              className={`flex items-start gap-3 rounded-lg px-2.5 py-2.5 transition-colors ${expanded ? "bg-sidebar-hover" : ""} ${isActive ? "bg-sidebar-hover" : ""}`}
            >
              <Link to={`/dm/${chat.slug}`} className="flex min-w-0 flex-1 items-start gap-3">
                <Avatar size="md">
                  <Icon name="channels" size={18} className="text-text-muted" />
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-text-primary">{chat.name}</div>
                  <div className="mt-0.5 truncate text-[12px] text-text-muted">
                    {chat.lastMessage}
                  </div>
                </div>
              </Link>
              <div className="flex flex-shrink-0 flex-col items-end gap-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    onToggleGroup(chat.id);
                  }}
                  className="p-0.5 text-text-muted hover:text-text-primary"
                  aria-label={expanded ? "Collapse" : "Expand"}
                >
                  {expanded ? (
                    <Icon name="chevron-up" size={14} />
                  ) : (
                    <Icon name="chevron-down" size={14} />
                  )}
                </button>
                {chat.badge !== undefined && (
                  <Badge count={chat.badge} variant="unread" rounded="md" />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
