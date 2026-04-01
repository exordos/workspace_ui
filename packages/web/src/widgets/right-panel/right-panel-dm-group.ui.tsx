import React, { useMemo } from "react";
import { useUsersStore } from "~/entities/user/user.model";
import { formatUserStatusLabel } from "~/entities/user/user-status.lib";
import { t } from "~/i18n/i18n";
import { Avatar } from "~/shared/ui/avatar";
import { Icon } from "~/shared/ui/icon";
import { PresenceIndicator } from "~/shared/ui/presence-indicator";
import { ScrollArea } from "~/shared/ui/scroll-area";

import { resolveAvatarSrc } from "./right-panel.lib";
import type { RightPanelDmGroupProps } from "./right-panel-dm-group.types";

export const RightPanelDmGroup = React.memo(function RightPanelDmGroup({
  title,
  data,
  onOpenUserProfile,
}: RightPanelDmGroupProps) {
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
});
