import { useCallback, useEffect, useState } from "react";
import { ensureJitsiExternalApiLoaded } from "~/shared/lib/jitsi-external-api.loader";

export type JitsiExternalApiLoadState = "idle" | "loading" | "ready" | "error";

export function useJitsiExternalApiLoader(enabled: boolean): {
  loadState: JitsiExternalApiLoadState;
  retry: () => void;
} {
  const [loadState, setLoadState] = useState<JitsiExternalApiLoadState>("idle");
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoadState("idle");
      return;
    }

    let cancelled = false;
    setLoadState("loading");

    void ensureJitsiExternalApiLoaded()
      .then(() => {
        if (!cancelled) {
          setLoadState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadState("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, attempt]);

  return { loadState, retry };
}
