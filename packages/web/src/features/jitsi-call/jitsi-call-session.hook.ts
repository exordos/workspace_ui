import { useCallback, useEffect, useMemo, useRef } from "react";
import { useCallParticipantsStore, type CallParticipant } from "~/entities/call/call.model";
import { t } from "~/i18n/i18n";
import {
  JITSI_PARTICIPANTS_POLL_MS,
  JITSI_PARTICIPANTS_POLL_UNFOCUSED_MS,
} from "~/shared/config/constants";
import { callState } from "~/shared/lib/call-state";
import { parseJitsiUrl } from "~/shared/lib/jitsi";
import { createActivityAwareInterval, type ActivityAwareInterval } from "~/shared/lib/visibility";
import { configureJitsiIframe } from "./jitsi-call-permissions.lib";
import { setupJitsiScreenSharing } from "./jitsi-call-screen-sharing.lib";
import { parseJitsiMeetingUrlLoose } from "./jitsi-call-url.lib";
import { useJitsiParticipantCount } from "./jitsi-participant-count.hook";
import type {
  JitsiCallEmbedProps,
  JitsiCallProps,
  JitsiExternalApiWithParticipants,
} from "./jitsi-call.types";

export function useJitsiCallSession(
  {
    open,
    meetingUrl,
    locationName,
    displayName: displayNameFromCall,
    startWithVideoMuted = true,
    onClose,
  }: JitsiCallProps,
  onParticipants?: (participants: CallParticipant[]) => void,
): { callName: string; participantCount: number | null; embedProps: JitsiCallEmbedProps } {
  const onCloseRef = useRef(onClose);
  const callLocationNameRef = useRef(locationName?.trim() ?? "");
  const participantPollRef = useRef<ActivityAwareInterval | null>(null);
  const parsedMeeting = useMemo(
    () =>
      meetingUrl ? (parseJitsiUrl(meetingUrl) ?? parseJitsiMeetingUrlLoose(meetingUrl)) : null,
    [meetingUrl],
  );
  const parsedDomain = parsedMeeting?.domain ?? null;
  const parsedRoomName = parsedMeeting?.roomName ?? null;
  const { participantCount, onApiReady: onParticipantCountApiReady } =
    useJitsiParticipantCount(open);
  const trimmedDisplayName = displayNameFromCall?.trim() ?? "";
  const displayName = trimmedDisplayName.length > 0 ? trimmedDisplayName : t("call.participant");
  const callLocationName = locationName?.trim() ?? "";

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    callLocationNameRef.current = callLocationName;
  }, [callLocationName]);

  const clearParticipantPolling = useCallback(() => {
    if (participantPollRef.current != null) {
      participantPollRef.current.stop();
      participantPollRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (open && parsedRoomName != null) {
      const activeDisplayName = callLocationNameRef.current;
      callState.start({
        roomName: parsedRoomName,
        participants: 1,
        displayName: activeDisplayName.length > 0 ? activeDisplayName : undefined,
      });
      return () => {
        callState.end();
        clearParticipantPolling();
        if (onParticipants == null)
          useCallParticipantsStore.getState().clearParticipants(meetingUrl);
      };
    }

    callState.end();
    clearParticipantPolling();
    if (meetingUrl.length > 0 && onParticipants == null) {
      useCallParticipantsStore.getState().clearParticipants(meetingUrl);
    }
    return undefined;
  }, [open, meetingUrl, parsedRoomName, onParticipants, clearParticipantPolling]);

  const handleIframeReady = useCallback((ref: HTMLElement | null) => {
    configureJitsiIframe(ref);
  }, []);

  const handleReadyToClose = useCallback(() => {
    onCloseRef.current();
  }, []);

  const handleApiReady = useCallback(
    (api: JitsiExternalApiWithParticipants) => {
      setupJitsiScreenSharing(api);
      clearParticipantPolling();
      onParticipantCountApiReady(api);

      const updateParticipants = () => {
        try {
          const list = api.getParticipantsInfo?.() ?? [];
          const participants = list.map(
            (participant: { displayName?: string; displayname?: string }) => ({
              displayName:
                participant.displayName ?? participant.displayname ?? t("call.participant"),
            }),
          );
          if (onParticipants != null) {
            onParticipants(participants);
          } else {
            useCallParticipantsStore.getState().setParticipants(meetingUrl, participants);
          }
        } catch {
          // ignore
        }
      };

      updateParticipants();
      // Joins and leaves already arrive as Jitsi callbacks below; this poll only
      // reconciles them, so it can back off hard while nobody is watching.
      participantPollRef.current = createActivityAwareInterval(updateParticipants, {
        delayFor: (state) =>
          state === "active" ? JITSI_PARTICIPANTS_POLL_MS : JITSI_PARTICIPANTS_POLL_UNFOCUSED_MS,
        runOnFocus: true,
      });

      const syncCallState = () => {
        const nextParticipantCount = api.getNumberOfParticipants?.();
        if (typeof nextParticipantCount === "number") {
          callState.updateParticipants(nextParticipantCount);
        }
      };

      syncCallState();
      api.on("participantJoined", syncCallState);
      api.on("participantLeft", syncCallState);
    },
    [clearParticipantPolling, meetingUrl, onParticipantCountApiReady, onParticipants],
  );

  return {
    callName: callLocationName.length > 0 ? callLocationName : (parsedRoomName ?? ""),
    participantCount,
    embedProps: {
      domain: parsedDomain,
      roomName: parsedRoomName,
      displayName,
      startWithVideoMuted,
      onApiReady: handleApiReady,
      onIframeReady: handleIframeReady,
      onReadyToClose: handleReadyToClose,
    },
  };
}
