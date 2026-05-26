import { useCallback, useEffect, useRef } from "react";
import {
  sendStreamTypingStart,
  sendStreamTypingStop,
  sendTypingStart,
  sendTypingStop,
} from "./typing-indicator.api";
import { resolveComposerTypingTransition, resolveTypingIdleTransition } from "./typing-transition";

type ComposerTypingTarget =
  | { kind: "dm"; userIds: number[] }
  | { kind: "stream"; streamId: number; topic: string };

function startTyping(target: ComposerTypingTarget): void {
  if (target.kind === "dm") {
    void sendTypingStart(target.userIds);
  } else {
    void sendStreamTypingStart(target.streamId, target.topic);
  }
}

function stopTyping(target: ComposerTypingTarget): void {
  if (target.kind === "dm") {
    void sendTypingStop(target.userIds);
  } else {
    void sendStreamTypingStop(target.streamId, target.topic);
  }
}

export function useComposerTypingController(options: {
  enabled: boolean;
  target: ComposerTypingTarget | null;
  idleStopDelayMs?: number;
}): { onComposerValueChange: (value: string) => void; stopNow: () => void } {
  const { enabled, target, idleStopDelayMs = 3000 } = options;

  const typingCooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasPreviouslyTypingRef = useRef(false);

  const stopNow = useCallback(() => {
    if (typingCooldownRef.current != null) {
      clearTimeout(typingCooldownRef.current);
      typingCooldownRef.current = null;
    }
    if (!enabled || target == null) {
      wasPreviouslyTypingRef.current = false;
      return;
    }
    if (wasPreviouslyTypingRef.current) {
      wasPreviouslyTypingRef.current = false;
      stopTyping(target);
    }
  }, [enabled, target]);

  const onComposerValueChange = useCallback(
    (value: string) => {
      if (!enabled || target == null) {
        stopNow();
        return;
      }

      const transition = resolveComposerTypingTransition(value, wasPreviouslyTypingRef.current);
      if (transition.action === "start") {
        startTyping(target);
      } else if (transition.action === "stop") {
        stopTyping(target);
      }
      wasPreviouslyTypingRef.current = transition.nextWasTyping;

      if (transition.restartCooldown) {
        if (typingCooldownRef.current != null) clearTimeout(typingCooldownRef.current);
        typingCooldownRef.current = setTimeout(() => {
          const idleTransition = resolveTypingIdleTransition(wasPreviouslyTypingRef.current);
          wasPreviouslyTypingRef.current = idleTransition.nextWasTyping;
          if (idleTransition.action === "stop") {
            stopTyping(target);
          }
          typingCooldownRef.current = null;
        }, idleStopDelayMs);
        return;
      }

      if (typingCooldownRef.current != null) {
        clearTimeout(typingCooldownRef.current);
        typingCooldownRef.current = null;
      }
    },
    [enabled, target, stopNow, idleStopDelayMs],
  );

  useEffect(() => stopNow, [stopNow]);

  return { onComposerValueChange, stopNow };
}
