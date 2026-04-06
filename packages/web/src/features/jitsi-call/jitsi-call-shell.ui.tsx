import React from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { useJitsiCallStore } from "./jitsi-call.model";
import { JitsiCallModal } from "./jitsi-call.ui";

export const JitsiCallShell: React.FC = () => {
  const activeCall = useJitsiCallStore((s) => s.activeCall);
  const incomingInvite = useJitsiCallStore((s) => s.incomingInvite);
  const acceptIncomingInvite = useJitsiCallStore((s) => s.acceptIncomingInvite);
  const declineIncomingInvite = useJitsiCallStore((s) => s.declineIncomingInvite);
  const closeCall = useJitsiCallStore((s) => s.closeCall);

  const inviteTitle = incomingInvite?.callerName.trim() || t("call.participant");

  return (
    <>
      {incomingInvite != null && (
        <div className="pointer-events-none fixed right-4 top-20 z-toast w-[320px] max-w-[calc(100vw-2rem)]">
          <section className="pointer-events-auto rounded-xl border border-border-subtle bg-bg-elevated p-3 shadow-xl">
            <div className="mb-2 flex items-center gap-2">
              <span className="bg-call-green/15 inline-flex h-8 w-8 items-center justify-center rounded-full text-call-green">
                <Icon name="phone" size={16} className="text-current" />
              </span>
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
              <button
                type="button"
                className="rounded-md border border-border-subtle px-3 py-1.5 text-xs text-text-muted hover:bg-bg hover:text-text-primary"
                onClick={declineIncomingInvite}
              >
                {t("call.decline")}
              </button>
              <button
                type="button"
                className="text-badge-text rounded-md bg-call-green px-3 py-1.5 text-xs font-medium hover:opacity-90"
                onClick={acceptIncomingInvite}
              >
                {t("call.accept")}
              </button>
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
