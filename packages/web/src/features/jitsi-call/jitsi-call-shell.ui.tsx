import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { t } from "~/i18n/i18n";
import { CALL_INCOMING_MODAL_VARIANT } from "~/shared/config/constants";
import { IncomingCallCompact } from "./jitsi-call-incoming-compact.ui";
import { IncomingCallLarge } from "./jitsi-call-incoming-large.ui";
import { useIncomingCallLifecycle } from "./jitsi-call-incoming-lifecycle.hook";
import { JitsiCallPresentation } from "./jitsi-call-presentation.ui";
import { useJitsiCallStore } from "./jitsi-call.model";

interface JitsiActiveCallHostProps {
  openInSeparateWindow?: boolean;
  ownerKey?: string | null;
}

export const JitsiActiveCallHost: React.FC<JitsiActiveCallHostProps> = ({
  openInSeparateWindow = true,
  ownerKey,
}) => {
  const activeCall = useJitsiCallStore((s) => s.activeCall);
  const closeCall = useJitsiCallStore((s) => s.closeCall);
  const hasOwner = ownerKey !== undefined;
  const wrongOwner = hasOwner && activeCall?.ownerKey != null && activeCall.ownerKey !== ownerKey;

  useEffect(() => {
    if (wrongOwner && activeCall != null) closeCall(activeCall.callId);
  }, [activeCall, closeCall, wrongOwner]);

  useEffect(() => {
    if (!hasOwner) return;
    // Logout can unmount the chat shell in the same render as the owner change.
    return useWorkspaceAuthStore.subscribe((state) => {
      const call = useJitsiCallStore.getState().activeCall;
      if (call?.ownerKey == null) return;
      const runtime = state.getCurrentRuntimeContext();
      if (runtime == null || workspaceRuntimeOwnerKey(runtime) !== call.ownerKey) {
        closeCall(call.callId);
      }
    });
  }, [closeCall, hasOwner]);

  if (activeCall == null || wrongOwner) {
    return null;
  }

  return (
    <JitsiCallPresentation
      key={activeCall.callId}
      call={activeCall}
      openInSeparateWindow={openInSeparateWindow}
    />
  );
};

export const JitsiIncomingInviteHost: React.FC = () => {
  const incomingInvite = useJitsiCallStore((s) => s.incomingInvite);
  const activeCall = useJitsiCallStore((s) => s.activeCall);
  const acceptIncomingInvite = useJitsiCallStore((s) => s.acceptIncomingInvite);
  const declineIncomingInvite = useJitsiCallStore((s) => s.declineIncomingInvite);
  const [videoEnabledByInvite, setVideoEnabledByInvite] = useState<Record<string, boolean>>({});

  const trimmedCallerName = incomingInvite?.callerName.trim() ?? "";
  const inviteTitle = trimmedCallerName.length > 0 ? trimmedCallerName : t("call.participant");
  const inviteAvatarUrn = incomingInvite?.avatarUrl;
  const inviteAvatarLetter = inviteTitle[0]?.toUpperCase() ?? "?";
  const incomingMessageId = incomingInvite?.messageId ?? null;
  const incomingMessageKey = incomingMessageId == null ? null : String(incomingMessageId);
  const videoEnabled =
    incomingMessageKey != null ? (videoEnabledByInvite[incomingMessageKey] ?? false) : false;
  const isCompactIncomingVariant = CALL_INCOMING_MODAL_VARIANT === "compact";

  const clearVideoPreference = useCallback((messageId: string | null) => {
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
    clearVideoPreference(incomingMessageKey);
  }, [acceptIncomingInvite, videoEnabled, clearVideoPreference, incomingMessageKey]);

  const handleDeclineIncomingInvite = useCallback(() => {
    clearVideoPreference(incomingMessageKey);
    declineIncomingInvite();
  }, [clearVideoPreference, declineIncomingInvite, incomingMessageKey]);

  const handleToggleVideo = useCallback(() => {
    if (incomingMessageKey == null) return;
    setVideoEnabledByInvite((current) => ({
      ...current,
      [incomingMessageKey]: !(current[incomingMessageKey] ?? false),
    }));
  }, [incomingMessageKey]);

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
          inviteAvatarUrn={inviteAvatarUrn}
          inviteAvatarLetter={inviteAvatarLetter}
          onAccept={handleAcceptIncomingInvite}
          onDecline={handleDeclineIncomingInvite}
        />
      );
    }

    return (
      <IncomingCallLarge
        inviteTitle={inviteTitle}
        inviteAvatarUrn={inviteAvatarUrn}
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
    inviteAvatarUrn,
    inviteAvatarLetter,
    videoEnabled,
    handleToggleVideo,
    handleAcceptIncomingInvite,
    handleDeclineIncomingInvite,
  ]);

  return incomingInviteView;
};

export const JitsiCallShell: React.FC = () => {
  return (
    <>
      <JitsiIncomingInviteHost />
      <JitsiActiveCallHost />
    </>
  );
};
