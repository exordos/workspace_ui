import React, { useCallback } from "react";
import {
  resolveUserPresenceVisual,
  selectUserDisplayName,
  selectUserStatusLabel,
} from "~/entities/user/user-selectors.lib";
import { useUsersStore } from "~/entities/user/user.model";
import type { User } from "~/entities/user/user.types";
import {
  useWorkspaceAuthStore,
  type WorkspaceAuthProfile,
} from "~/entities/workspace-auth/workspace-auth.model";
import { WorkspaceAvatar } from "~/features/workspace-avatar/workspace-avatar.ui";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { PresenceIndicator } from "~/shared/ui/presence-indicator";
import { useRightDrawerStore } from "~/widgets/right-panel/right-drawer.model";
import {
  getTopBarProfileStatusMaxWidthClass,
  shouldShowTopBarProfileStatusTooltip,
} from "./top-bar.lib";

function trimToOptional(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed != null && trimmed.length > 0 ? trimmed : undefined;
}

function resolveWorkspaceDisplayName(
  profile: WorkspaceAuthProfile | undefined,
): string | undefined {
  const fullName = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ").trim();
  return (
    trimToOptional(fullName) ?? trimToOptional(profile?.username) ?? trimToOptional(profile?.email)
  );
}

function resolveDisplayName(
  currentUser: User | undefined,
  workspaceDisplayName: string | undefined,
): string {
  if (currentUser == null) {
    return workspaceDisplayName ?? t("nav.profile");
  }
  return (
    trimToOptional(selectUserDisplayName(currentUser, "")) ??
    workspaceDisplayName ??
    t("nav.profile")
  );
}

function resolveDisplayEmail(
  userEmail: string | null | undefined,
  workspaceEmail: string | null | undefined,
): string | undefined {
  return trimToOptional(userEmail) ?? trimToOptional(workspaceEmail);
}

function resolveWorkspacePresenceState(
  status: string | undefined,
): "active" | "idle" | "offline" | null {
  if (status === "active" || status === "idle" || status === "offline") {
    return status;
  }
  return null;
}

function resolveStatusLabel(
  customStatusLabel: string | null,
  presenceState: "active" | "idle" | "offline" | null,
): string | undefined {
  if (customStatusLabel != null) {
    return customStatusLabel;
  }

  const labelByPresence = {
    active: t("presence.online"),
    idle: t("presence.away"),
    offline: t("presence.offline"),
  } satisfies Record<"active" | "idle" | "offline", string>;

  return presenceState == null ? undefined : labelByPresence[presenceState];
}

export const TopBarProfileTrigger = React.memo(function TopBarProfileTrigger() {
  const isUserMenuOpen = useRightDrawerStore((s) => s.open && s.mode === "user-menu");
  const openUserMenu = useRightDrawerStore((s) => s.openUserMenu);
  const closeDrawer = useRightDrawerStore((s) => s.close);
  const workspaceSession = useWorkspaceAuthStore((s) => {
    const accountId = s.currentAccountId;
    return accountId != null
      ? s.sessions.find((session) => session.accountId === accountId)
      : undefined;
  });
  const workspaceProfile = workspaceSession?.profile;
  const currentUser = useUsersStore((s) => {
    if (workspaceSession?.userUuid != null) {
      return s.usersById[workspaceSession.userUuid];
    }
    return undefined;
  });

  const workspaceDisplayName = resolveWorkspaceDisplayName(workspaceProfile);
  const displayName = resolveDisplayName(currentUser, workspaceDisplayName);
  const displayEmail = resolveDisplayEmail(currentUser?.email, workspaceProfile?.email);
  const avatarLetter = displayName[0]?.toUpperCase() ?? "?";
  const statusMaxWidthClass = getTopBarProfileStatusMaxWidthClass();
  const userPresenceState = resolveUserPresenceVisual(currentUser?.status);
  const workspacePresenceState = resolveWorkspacePresenceState(workspaceProfile?.status);
  const presenceState = userPresenceState ?? workspacePresenceState;
  const statusLabel = resolveStatusLabel(selectUserStatusLabel(currentUser), presenceState);

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
        <WorkspaceAvatar size="xs" avatarUrn={currentUser?.avatarUrl}>
          {avatarLetter}
        </WorkspaceAvatar>
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
        {statusLabel && (
          <span
            className={`block truncate text-[11px] text-text-secondary ${statusMaxWidthClass}`}
            title={
              statusLabel != null && shouldShowTopBarProfileStatusTooltip(statusLabel)
                ? statusLabel
                : undefined
            }
          >
            {statusLabel}
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
