import { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { JitsiCallContent } from "./jitsi-call-content.ui";
import { useJitsiCallSession } from "./jitsi-call-session.hook";

export function JitsiCallWindow({
  call,
  bridge,
}: Readonly<{
  call: JitsiCallWindowPayload;
  bridge: JitsiCallWindowRendererBridge;
}>) {
  const { callId, meetingUrl, locationName, displayName, startWithVideoMuted } = call;
  const close = useCallback(() => bridge.close(callId), [bridge, callId]);
  const updateParticipants = useCallback(
    (participants: JitsiCallWindowParticipant[]) => bridge.updateParticipants(callId, participants),
    [bridge, callId],
  );
  const { embedProps } = useJitsiCallSession(
    { open: true, meetingUrl, locationName, displayName, startWithVideoMuted, onClose: close },
    updateParticipants,
  );

  return (
    <main className="flex h-full min-h-0 flex-col" aria-label={t("call.call")}>
      <JitsiCallContent open={true} {...embedProps} />
    </main>
  );
}
