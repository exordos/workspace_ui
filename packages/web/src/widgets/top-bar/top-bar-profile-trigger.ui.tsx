import React, { useCallback } from "react";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useUsersStore } from "~/entities/user/user.model";
import { useUserStatus } from "~/entities/user/user-status.hooks";
import { t } from "~/i18n/i18n";
import { getPresenceState } from "~/shared/lib/format";
import { Avatar } from "~/shared/ui/avatar";
import { Icon } from "~/shared/ui/icon";
import { useRightDrawerStore } from "~/widgets/right-panel/right-drawer.model";
import { resolveTopBarAvatarSrc } from "./top-bar.lib";

export const TopBarProfileTrigger = React.memo(function TopBarProfileTrigger() {
  const openUserMenu = useRightDrawerStore((s) => s.openUserMenu);
  const currentUserId = useChatListStore((s) => s.currentUserId);
  const currentUser = useUsersStore((s) =>
    currentUserId != null ? s.getUser(currentUserId) : undefined,
  );
  const currentStatus = useUserStatus(currentUserId);

  const trimmedDisplayName = currentUser?.full_name?.trim();
  const displayName =
    trimmedDisplayName != null && trimmedDisplayName.length > 0
      ? trimmedDisplayName
      : t("nav.profile");
  const trimmedEmail = currentUser?.email?.trim();
  const displayEmail = trimmedEmail != null && trimmedEmail.length > 0 ? trimmedEmail : undefined;
  const emailMaxWidth = `${Math.max(displayName.length, 1)}ch`;
  const avatarLetter = displayName[0]?.toUpperCase() ?? "?";
  const avatarSrc = resolveTopBarAvatarSrc(currentUser?.avatar_url ?? undefined);
  const presenceState =
    currentUser?.presence != null
      ? getPresenceState(currentUser.presence.timestamp, currentUser.presence.status)
      : null;
  const statusLabel = currentStatus.statusLabel;

  const handleClick = useCallback(() => {
    openUserMenu();
  }, [openUserMenu]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className="hover:bg-bg/50 relative flex items-center gap-2 rounded-lg p-1.5 text-left transition-colors"
      aria-label={t("nav.profile")}
    >
      <div className="relative flex-shrink-0">
        <Avatar size="xs" src={avatarSrc}>
          {avatarLetter}
        </Avatar>
        {presenceState === "active" && (
          <span
            className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-bg-elevated bg-indicator-green"
            aria-label={t("a11y.online")}
          />
        )}
        {presenceState === "idle" && (
          <span
            className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-bg-elevated bg-indicator-orange"
            aria-label={t("a11y.away")}
          />
        )}
      </div>
      <div className="hidden min-w-0 flex-col items-start leading-tight sm:flex">
        <span className="text-sm font-medium text-text-primary">{displayName}</span>
        {statusLabel && (
          <span
            className="block truncate text-[11px] text-text-secondary"
            style={{ maxWidth: emailMaxWidth }}
          >
            {statusLabel}
          </span>
        )}
        {displayEmail && (
          <span
            className="block truncate text-[11px] text-text-secondary"
            style={{ maxWidth: emailMaxWidth }}
          >
            {displayEmail}
          </span>
        )}
      </div>
      <Icon name="chevron-down" size={16} className="shrink-0 text-text-muted" />
    </button>
  );
});

TopBarProfileTrigger.displayName = "TopBarProfileTrigger";
