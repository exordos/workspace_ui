import { useCallback } from "react";

type ComposerTypingTarget =
  | { kind: "dm"; userIds: number[] }
  | { kind: "stream"; streamId: number; topic: string };

export function useComposerTypingController(options: {
  enabled: boolean;
  target: ComposerTypingTarget | null;
  idleStopDelayMs?: number;
}): { onComposerValueChange: (value: string) => void; stopNow: () => void } {
  void options;

  const stopNow = useCallback(() => {
    // Workspace API has no typing contract yet.
  }, []);

  const onComposerValueChange = useCallback((_value: string) => {
    // Workspace API has no typing contract yet.
  }, []);

  return { onComposerValueChange, stopNow };
}
