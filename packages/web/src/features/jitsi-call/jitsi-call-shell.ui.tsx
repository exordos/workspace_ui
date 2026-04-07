import React from "react";
import { t } from "~/i18n/i18n";
import { getRealmBaseUrl } from "~/shared/api/zulip-client.internal";
import { resolveAvatarUrl } from "~/shared/lib/avatar";
import { Avatar } from "~/shared/ui/avatar";
import { Button } from "~/shared/ui/button";
import { Icon } from "~/shared/ui/icon";
import { useJitsiCallStore } from "./jitsi-call.model";
import { JitsiCallModal } from "./jitsi-call.ui";

export const JitsiCallShell: React.FC = () => {
  const activeCall = useJitsiCallStore((s) => s.activeCall);
  const incomingInvite = useJitsiCallStore((s) => s.incomingInvite);
  const acceptIncomingInvite = useJitsiCallStore((s) => s.acceptIncomingInvite);
  const declineIncomingInvite = useJitsiCallStore((s) => s.declineIncomingInvite);
  const closeCall = useJitsiCallStore((s) => s.closeCall);

  const trimmedCallerName = incomingInvite?.callerName.trim();
  const inviteTitle =
    trimmedCallerName != null && trimmedCallerName.length > 0
      ? trimmedCallerName
      : t("call.participant");
  const inviteAvatarSrc = resolveAvatarUrl(incomingInvite?.avatarUrl, getRealmBaseUrl());
  const inviteAvatarLetter = inviteTitle[0]?.toUpperCase() ?? "?";

  return (
    <>
      {incomingInvite != null && (
        <div className="pointer-events-none fixed right-4 top-20 z-toast w-[320px] max-w-[calc(100vw-2rem)]">
          <section className="pointer-events-auto rounded-xl border border-border-subtle bg-bg-elevated p-3 shadow-xl">
            <div className="mb-2 flex items-center gap-2">
              {inviteAvatarSrc != null ? (
                <Avatar
                  size="sm"
                  src={inviteAvatarSrc}
                  className="bg-bg-elevated text-text-primary"
                >
                  {inviteAvatarLetter}
                </Avatar>
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
              <Button type="button" variant="ghost" size="sm" onClick={declineIncomingInvite}>
                {t("call.decline")}
              </Button>
              <Button type="button" variant="primary" size="sm" onClick={acceptIncomingInvite}>
                {t("call.accept")}
              </Button>
            </div>
          </section>
        </div>
      )}

      {activeCall != null && (
        <JitsiCallModal
          open={true}
          meetingUrl={activeCall.meetingUrl}
          locationName={activeCall.locationName}
          onClose={closeCall}
        />
      )}
    </>
  );
};
