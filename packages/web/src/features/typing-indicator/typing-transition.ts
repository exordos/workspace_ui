export interface ComposerTypingTransition {
  action: "start" | "stop" | null;
  nextWasTyping: boolean;
  restartCooldown: boolean;
}

export interface IdleTypingTransition {
  action: "stop" | null;
  nextWasTyping: boolean;
}

export function resolveComposerTypingTransition(
  value: string,
  wasTyping: boolean,
): ComposerTypingTransition {
  const isTyping = value.trim().length > 0;

  if (isTyping) {
    return {
      action: wasTyping ? null : "start",
      nextWasTyping: true,
      restartCooldown: true,
    };
  }

  return {
    action: wasTyping ? "stop" : null,
    nextWasTyping: false,
    restartCooldown: false,
  };
}

export function resolveTypingIdleTransition(wasTyping: boolean): IdleTypingTransition {
  return {
    action: wasTyping ? "stop" : null,
    nextWasTyping: false,
  };
}
