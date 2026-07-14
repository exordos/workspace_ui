import React from "react";
import { WorkspaceAvatar } from "~/features/workspace-avatar/workspace-avatar.ui";
import { t } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import { Icon } from "~/shared/ui/icon";

export interface IncomingCallCompactProps {
  inviteTitle: string;
  inviteAvatarUrn?: string;
  inviteAvatarLetter: string;
  onAccept: () => void;
  onDecline: () => void;
}

export const IncomingCallCompact: React.FC<IncomingCallCompactProps> = ({
  inviteTitle,
  inviteAvatarUrn,
  inviteAvatarLetter,
  onAccept,
  onDecline,
}) => {
  return (
    <div
      className="pointer-events-none fixed right-4 top-20 z-toast w-[320px] max-w-[calc(100vw-2rem)]"
      data-testid="incoming-call-compact"
    >
      <section className="pointer-events-auto rounded-xl border border-border-subtle bg-bg-elevated p-3 shadow-xl">
        <div className="mb-2 flex items-center gap-2">
          {inviteAvatarUrn != null ? (
            <WorkspaceAvatar
              size="sm"
              avatarUrn={inviteAvatarUrn}
              className="bg-bg-elevated text-text-primary"
            >
              {inviteAvatarLetter}
            </WorkspaceAvatar>
          ) : (
            <span className="bg-call-green/15 inline-flex h-8 w-8 items-center justify-center rounded-full text-call-green">
              <Icon name="phone" size={16} className="text-current" />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text-primary">
              {t("call.incomingCall")}
            </p>
            <p className="truncate text-xs text-text-muted">
              {t("call.incomingFrom", { name: inviteTitle })}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDecline}
            data-testid="incoming-call-decline"
          >
            {t("call.decline")}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onAccept}
            data-testid="incoming-call-accept"
          >
            {t("call.accept")}
          </Button>
        </div>
      </section>
    </div>
  );
};
