import React, { useCallback } from "react";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { UserStatusLabel } from "~/entities/user/user-status-label.ui";
import { useUserStatus } from "~/entities/user/user-status.hooks";
import { useUsersStore } from "~/entities/user/user.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { t } from "~/i18n/i18n";
import { getPresenceState } from "~/shared/lib/format";
import { Avatar } from "~/shared/ui/avatar";
import { Icon } from "~/shared/ui/icon";
import { PresenceIndicator } from "~/shared/ui/presence-indicator";
import { useRightDrawerStore } from "~/widgets/right-panel/right-drawer.model";
import {
  getTopBarProfileStatusMaxWidthClass,
  resolveTopBarAvatarSrc,
  shouldShowTopBarProfileStatusTooltip,
} from "./top-bar.lib";

export const TopBarProfileTrigger = React.memo(function TopBarProfileTrigger() {
  const isUserMenuOpen = useRightDrawerStore((s) => s.open && s.mode === "user-menu");
  const openUserMenu = useRightDrawerStore((s) => s.openUserMenu);
  const closeDrawer = useRightDrawerStore((s) => s.close);
  const currentUserId = useChatListStore((s) => s.currentUserId);
  const currentUser = useUsersStore((s) =>
    currentUserId != null ? s.getUser(currentUserId) : undefined,
  );
  const workspaceProfile = useWorkspaceAuthStore((s) => {
    const accountId = s.currentAccountId;
    return accountId != null
      ? s.sessions.find((session) => session.accountId === accountId)?.profile
      : undefined;
  });
  const currentStatus = useUserStatus(currentUserId);

  const trimmedDisplayName = currentUser?.full_name?.trim();
  const workspaceFullName = [workspaceProfile?.firstName, workspaceProfile?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const workspaceDisplayName =
    workspaceFullName ||
    workspaceProfile?.username?.trim() ||
    workspaceProfile?.email?.trim() ||
    undefined;
  const displayName =
    trimmedDisplayName != null && trimmedDisplayName.length > 0
      ? trimmedDisplayName
      : (workspaceDisplayName ?? t("nav.profile"));
  const trimmedEmail = currentUser?.email?.trim();
  const workspaceEmail = workspaceProfile?.email?.trim();
  const displayEmail =
    trimmedEmail != null && trimmedEmail.length > 0
      ? trimmedEmail
      : workspaceEmail != null && workspaceEmail.length > 0
        ? workspaceEmail
        : undefined;
  const avatarLetter = displayName[0]?.toUpperCase() ?? "?";
  const statusMaxWidthClass = getTopBarProfileStatusMaxWidthClass();
  const avatarSrc = resolveTopBarAvatarSrc(currentUser?.avatar_url ?? undefined);
  const presenceState =
    currentUser?.presence != null
      ? getPresenceState(currentUser.presence.timestamp, currentUser.presence.status)
      : workspaceProfile?.status === "active" ||
          workspaceProfile?.status === "idle" ||
          workspaceProfile?.status === "offline"
        ? workspaceProfile.status
        : null;
  const statusLabel = currentStatus.statusLabel;
  const shouldRenderRichStatus = currentUser?.status?.reactionType === "realm_emoji";

  const handleClick = useCallback(() => {
    if (isUserMenuOpen) {
      closeDrawer();
    } else {
      openUserMenu();
    }
  }, [closeDrawer, isUserMenuOpen, openUserMenu]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className="hover:bg-bg/50 relative flex items-center gap-2 rounded-lg p-1.5 text-left transition-colors"
      aria-label={t("nav.profile")}
      aria-expanded={isUserMenuOpen}
    >
      <div className="relative flex-shrink-0">
        <Avatar size="xs" src={avatarSrc}>
          {avatarLetter}
        </Avatar>
        <PresenceIndicator
          status={presenceState}
          size="md"
          tone="header"
          pulse={false}
          className="absolute right-0 top-0 ring-bg-elevated"
        />
      </div>
      <div className="hidden w-max min-w-0 flex-col items-start leading-tight sm:flex">
        <span className="whitespace-nowrap text-sm font-medium text-text-primary">
          {displayName}
        </span>
        {(shouldRenderRichStatus || statusLabel) && (
          <span
            className={`block truncate text-[11px] text-text-secondary ${statusMaxWidthClass}`}
            title={
              statusLabel != null && shouldShowTopBarProfileStatusTooltip(statusLabel)
                ? statusLabel
                : undefined
            }
          >
            {shouldRenderRichStatus ? (
              <UserStatusLabel status={currentUser?.status} />
            ) : (
              statusLabel
            )}
          </span>
        )}
        {displayEmail && (
          <span className="whitespace-nowrap text-[11px] text-text-secondary">{displayEmail}</span>
        )}
      </div>
      <Icon
        name="chevron-down"
        size={16}
        className={`shrink-0 text-text-muted transition-transform ${isUserMenuOpen ? "rotate-180" : ""}`}
      />
    </button>
  );
});

TopBarProfileTrigger.displayName = "TopBarProfileTrigger";
