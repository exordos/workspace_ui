// Participant count for the active Jitsi session — independent of modal shell state.

import { useCallback, useEffect, useRef, useState } from "react";

/** Minimal Jitsi External API surface for join/leave participant subscriptions. */
export interface JitsiExternalApi {
  getNumberOfParticipants: () => number;
  on: (event: string, callback: () => void) => void;
}

export function useJitsiParticipantCount(open: boolean): {
  participantCount: number | null;
  onApiReady: (api: JitsiExternalApi) => void;
} {
  const [participantCount, setParticipantCount] = useState<number | null>(null);
  const apiRef = useRef<JitsiExternalApi | null>(null);

  // Stable callback — shell re-renders must not recreate subscriptions.
  const updateCount = useCallback(() => {
    const n = apiRef.current?.getNumberOfParticipants?.();
    if (typeof n === "number") setParticipantCount(n);
  }, []);

  const onApiReady = useCallback(
    (api: JitsiExternalApi) => {
      apiRef.current = api;
      setParticipantCount(api.getNumberOfParticipants());
      api.on("participantJoined", updateCount);
      api.on("participantLeft", updateCount);
    },
    [updateCount],
  );

  useEffect(() => {
    if (open) return;
    // Reset on close so the next open starts with clean session state.
    apiRef.current = null;
    void Promise.resolve().then(() => {
      setParticipantCount(null);
    });
  }, [open]);

  return { participantCount, onApiReady };
}
