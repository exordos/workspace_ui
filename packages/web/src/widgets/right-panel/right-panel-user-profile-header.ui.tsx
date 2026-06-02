import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { Avatar } from "~/shared/ui/avatar";
import { Copyable } from "~/shared/ui/copyable";
import { Icon } from "~/shared/ui/icon";
import { resolveLastSeenLabel } from "./right-panel-presence-label.lib";
import { RightPanelUserContactRowItem } from "./right-panel-user-contact-row.ui";
import type { RightPanelUserContactRow } from "./right-panel-user-contact.lib";
import type { RightPanelUserInfo } from "./right-panel.types";

export interface RightPanelUserProfileHeaderProps {
  user: RightPanelUserInfo;
  showBackToChatInfo: boolean;
  onBackFromNestedProfile: () => void;
  avatarSrc: string | undefined;
  isOwnProfile: boolean;
  statusLabel: string | undefined;
  contactRows: RightPanelUserContactRow[];
  directMessageUserId: number | undefined;
  onOpenDirectMessage?: (userId: number) => void;
  showProfileCallButton: boolean;
  onProfileDmCall: () => void;
  onAvatarAction: () => void;
}

export const RightPanelUserProfileHeader = React.memo(function RightPanelUserProfileHeader({
  user,
  showBackToChatInfo,
  onBackFromNestedProfile,
  avatarSrc,
  isOwnProfile,
  statusLabel,
  contactRows,
  directMessageUserId,
  onOpenDirectMessage,
  showProfileCallButton,
  onProfileDmCall,
  onAvatarAction,
}: RightPanelUserProfileHeaderProps) {
  const handleOpenDm = useCallback(() => {
    if (directMessageUserId != null) onOpenDirectMessage?.(directMessageUserId);
  }, [directMessageUserId, onOpenDirectMessage]);

  const lastSeenLabel = resolveLastSeenLabel(user.lastSeen);

  return (
    <header className="border-b border-border-subtle pb-3">
      {showBackToChatInfo ? (
        <div className="mb-3 flex min-h-8 items-center gap-2">
          <button
            type="button"
            onClick={onBackFromNestedProfile}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg p-0 leading-none text-text-muted transition-colors hover:bg-card-bg-active hover:text-text-primary"
            aria-label={t("common.back")}
          >
            <Icon
              name="chevron-right"
              size={14}
              className="translate-x-px rotate-180 text-current"
            />
          </button>
          <h2 className="min-w-0 flex-1 text-sm font-semibold text-text-primary">
            {t("info.information")}
          </h2>
        </div>
      ) : (
        <h2 className="mb-3 text-sm font-semibold text-text-primary">{t("info.information")}</h2>
      )}
      <div className="flex items-center gap-3">
        {isOwnProfile || avatarSrc != null ? (
          <button
            type="button"
            onClick={onAvatarAction}
            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
            aria-label={isOwnProfile ? t("settings.changeAvatar") : t("info.openAvatarPreview")}
          >
            <Avatar size="lg" className="bg-bg-elevated text-text-secondary" src={avatarSrc}>
              {user.name.slice(0, 1)}
            </Avatar>
          </button>
        ) : (
          <Avatar size="lg" className="bg-bg-elevated text-text-secondary">
            {user.name.slice(0, 1)}
          </Avatar>
        )}
        <div className="min-w-0 flex-1">
          <Copyable value={user.name} className="w-full">
            <p className="truncate text-sm font-medium text-text-primary">{user.name}</p>
          </Copyable>
          {statusLabel && <p className="truncate text-[11px] text-text-secondary">{statusLabel}</p>}
          {lastSeenLabel && <p className="text-[11px] text-text-secondary">{lastSeenLabel}</p>}
        </div>
      </div>
      {directMessageUserId != null && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-on-accent hover:opacity-90"
            onClick={handleOpenDm}
          >
            <Icon name="chatBubble" size={16} className="shrink-0 text-current" />
            <span className="truncate">{t("info.openDirectMessages")}</span>
          </button>
          {showProfileCallButton && (
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-sm font-medium text-text-primary hover:bg-bg"
              onClick={onProfileDmCall}
              aria-label={t("call.call")}
            >
              <Icon name="phone" size={16} className="shrink-0 text-current" />
              <span className="truncate">{t("call.call")}</span>
            </button>
          )}
        </div>
      )}
      {contactRows.length > 0 && (
        <ul className="mt-3 space-y-2">
          {contactRows.map((row) => (
            <RightPanelUserContactRowItem key={row.label} row={row} />
          ))}
        </ul>
      )}
    </header>
  );
});
