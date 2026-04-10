import React, { useCallback, useMemo, useState } from "react";
import { t } from "~/i18n/i18n";
import { getRealmBaseUrl } from "~/shared/api/zulip-client.internal";
import { CALL_INCOMING_MODAL_VARIANT } from "~/shared/config/constants";
import { resolveAvatarUrl } from "~/shared/lib/avatar";
import { IncomingCallCompact } from "./jitsi-call-incoming-compact.ui";
import { IncomingCallLarge } from "./jitsi-call-incoming-large.ui";
import { useIncomingCallLifecycle } from "./jitsi-call-incoming-lifecycle.hook";
import { useJitsiCallStore } from "./jitsi-call.model";
import { JitsiCallModal } from "./jitsi-call.ui";

export const JitsiCallShell: React.FC = () => {
  const activeCall = useJitsiCallStore((s) => s.activeCall);
  const incomingInvite = useJitsiCallStore((s) => s.incomingInvite);
  const acceptIncomingInvite = useJitsiCallStore((s) => s.acceptIncomingInvite);
  const declineIncomingInvite = useJitsiCallStore((s) => s.declineIncomingInvite);
  const closeCall = useJitsiCallStore((s) => s.closeCall);
  const [videoEnabledByInvite, setVideoEnabledByInvite] = useState<Record<number, boolean>>({});

  const trimmedCallerName = incomingInvite?.callerName.trim() ?? "";
  const inviteTitle = trimmedCallerName.length > 0 ? trimmedCallerName : t("call.participant");
  const inviteAvatarSrc = resolveAvatarUrl(incomingInvite?.avatarUrl, getRealmBaseUrl()) ?? null;
  const inviteAvatarLetter = inviteTitle[0]?.toUpperCase() ?? "?";
  const incomingMessageId = incomingInvite?.messageId ?? null;
  const videoEnabled =
    incomingMessageId != null ? (videoEnabledByInvite[incomingMessageId] ?? false) : false;
  const isCompactIncomingVariant = CALL_INCOMING_MODAL_VARIANT === "compact";

  const clearVideoPreference = useCallback((messageId: number | null) => {
    if (messageId == null) return;
    setVideoEnabledByInvite((current) => {
      if (current[messageId] == null) return current;
      const next = { ...current };
      delete next[messageId];
      return next;
    });
  }, []);

  const handleAcceptIncomingInvite = useCallback(() => {
    acceptIncomingInvite({ startWithVideoMuted: !videoEnabled });
    clearVideoPreference(incomingMessageId);
  }, [acceptIncomingInvite, videoEnabled, clearVideoPreference, incomingMessageId]);

  const handleDeclineIncomingInvite = useCallback(() => {
    clearVideoPreference(incomingMessageId);
    declineIncomingInvite();
  }, [clearVideoPreference, declineIncomingInvite, incomingMessageId]);

  const handleToggleVideo = useCallback(() => {
    if (incomingMessageId == null) return;
    setVideoEnabledByInvite((current) => ({
      ...current,
      [incomingMessageId]: !(current[incomingMessageId] ?? false),
    }));
  }, [incomingMessageId]);

  useIncomingCallLifecycle({
    incomingInvite,
    activeCall,
    onDeclineIncomingInvite: handleDeclineIncomingInvite,
  });

  const incomingInviteView = useMemo(() => {
    if (incomingInvite == null) return null;

    if (isCompactIncomingVariant) {
      return (
        <IncomingCallCompact
          inviteTitle={inviteTitle}
          inviteAvatarSrc={inviteAvatarSrc}
          inviteAvatarLetter={inviteAvatarLetter}
          onAccept={handleAcceptIncomingInvite}
          onDecline={handleDeclineIncomingInvite}
        />
      );
    }

    return (
      <IncomingCallLarge
        inviteTitle={inviteTitle}
        inviteAvatarSrc={inviteAvatarSrc}
        inviteAvatarLetter={inviteAvatarLetter}
        videoEnabled={videoEnabled}
        onToggleVideo={handleToggleVideo}
        onAccept={handleAcceptIncomingInvite}
        onDecline={handleDeclineIncomingInvite}
      />
    );
  }, [
    incomingInvite,
    isCompactIncomingVariant,
    inviteTitle,
    inviteAvatarSrc,
    inviteAvatarLetter,
    videoEnabled,
    handleToggleVideo,
    handleAcceptIncomingInvite,
    handleDeclineIncomingInvite,
  ]);

  return (
    <>
      {incomingInviteView}

      {activeCall != null && (
        <JitsiCallModal
          open={true}
          meetingUrl={activeCall.meetingUrl}
          locationName={activeCall.locationName}
          startWithVideoMuted={activeCall.startWithVideoMuted}
          onClose={closeCall}
        />
      )}
    </>
  );
};
