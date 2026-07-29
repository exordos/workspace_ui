import React from "react";
import { WorkspaceAvatar } from "~/features/workspace-avatar/workspace-avatar.ui";
import { t } from "~/i18n/i18n";
import { PresenceIndicator } from "~/shared/ui/presence-indicator";
import { ChatHeaderShell } from "./chat-header-shell.ui";
import { resolveDmStatusText } from "./chat-header.lib";
import type { ChatDirectHeaderProps } from "./chat-header.types";

// The full partner block is one accessible action target.
const TITLE_ACTION_BUTTON_CLASS =
  "absolute inset-0 cursor-pointer rounded-lg bg-transparent text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft";

/** Direct chat header with the partner avatar, name, and status. */
export const ChatDirectHeader: React.FC<ChatDirectHeaderProps> = ({
  partner,
  onOpenPartnerProfile,
  onOpenSearch,
  onToggleRightPanel,
  rightPanelOpen = true,
  rightPanelLabel,
  onCallClick,
}) => {
  const infoLabel = rightPanelLabel ?? t("info.partnerInfo");
  const statusText = resolveDmStatusText(partner);

  return (
    <ChatHeaderShell
      onCallClick={onCallClick}
      onOpenSearch={onOpenSearch}
      onToggleRightPanel={onToggleRightPanel}
      rightPanelOpen={rightPanelOpen}
      infoLabel={infoLabel}
    >
      <div className="relative flex min-w-0 items-center gap-3 rounded-lg text-left">
        <span className="relative shrink-0">
          <WorkspaceAvatar
            size="md"
            className="border border-border-subtle bg-bg-elevated text-text-muted"
            avatarUrn={partner.avatarUrl}
          >
            {partner.name.slice(0, 1).toUpperCase()}
          </WorkspaceAvatar>
          <PresenceIndicator
            status={partner.presenceState}
            size="md"
            tone="header"
            pulse={false}
            deactivated={partner.isAccountDeactivated === true}
            className="absolute bottom-0 right-0 ring-border-subtle"
          />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <h1 className="truncate text-sm font-semibold text-text-primary">{partner.name}</h1>
          <span className="truncate text-xs text-text-muted">{statusText}</span>
        </span>
        {/* One overlay keeps the whole partner block clickable. */}
        {onOpenPartnerProfile != null && (
          <button
            type="button"
            onClick={onOpenPartnerProfile}
            className={TITLE_ACTION_BUTTON_CLASS}
            aria-label={t("a11y.openUserProfile", { name: partner.name })}
          />
        )}
      </div>
    </ChatHeaderShell>
  );
};
