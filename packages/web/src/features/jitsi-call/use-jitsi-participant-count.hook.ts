import { useEffect, useRef, useState } from "react";

/** Minimal type for Jitsi External API. */
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

  const updateCount = () => {
    const n = apiRef.current?.getNumberOfParticipants?.();
    if (typeof n === "number") setParticipantCount(n);
  };

  const onApiReady = (api: JitsiExternalApi) => {
    apiRef.current = api;
    setParticipantCount(api.getNumberOfParticipants());
    api.on("participantJoined", updateCount);
    api.on("participantLeft", updateCount);
  };

  useEffect(() => {
    if (open) return;
    apiRef.current = null;
    void Promise.resolve().then(() => {
      setParticipantCount(null);
    });
  }, [open]);

  return { participantCount, onApiReady };
}

