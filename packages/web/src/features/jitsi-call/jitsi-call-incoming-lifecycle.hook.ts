import { useEffect } from "react";
import { useSettingsStore } from "~/features/settings/settings.model";
import { playNotificationSound } from "~/shared/lib/notification-sound";
import type { ActiveJitsiCall, IncomingDmCallInvite } from "./jitsi-call.model";

const INCOMING_INVITE_AUTO_DECLINE_MS = 45_000;
const INCOMING_INVITE_RING_INTERVAL_MS = 1_500;
const INCOMING_INVITE_RINGTONE_PRESET = "soft_call";

interface UseIncomingCallLifecycleParams {
  incomingInvite: IncomingDmCallInvite | null;
  activeCall: ActiveJitsiCall | null;
  onDeclineIncomingInvite: () => void;
}

export function useIncomingCallLifecycle({
  incomingInvite,
  activeCall,
  onDeclineIncomingInvite,
}: UseIncomingCallLifecycleParams): void {
  const isIncomingVisible = incomingInvite != null && activeCall == null;

  useEffect(() => {
    if (!isIncomingVisible) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      onDeclineIncomingInvite();
    }, INCOMING_INVITE_AUTO_DECLINE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isIncomingVisible, onDeclineIncomingInvite]);

  useEffect(() => {
    if (!isIncomingVisible) {
      return;
    }

    const playRing = () => {
      const userSoundPreference = useSettingsStore.getState().notificationSound;
      if (userSoundPreference === "none") {
        return;
      }
      playNotificationSound(INCOMING_INVITE_RINGTONE_PRESET);
    };

    playRing();
    const intervalId = window.setInterval(playRing, INCOMING_INVITE_RING_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isIncomingVisible]);
}
