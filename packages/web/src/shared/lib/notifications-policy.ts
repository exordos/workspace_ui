/**
 * Notification policy — pure decision helpers.
 *
 * Keeps "should we notify?" logic separate from side effects (sound, OS notifications),
 * so it can be unit-tested and reused across runtimes (web/electron).
 *
 * Usage:
 *   import { shouldNotify } from "~/shared/lib/notifications-policy";
 *   if (shouldNotify({ isFromSelf, isForCurrentChat, isMuted })) { ... }
 */

export function shouldNotify(options: {
  isFromSelf: boolean;
  isForCurrentChat: boolean;
  isMuted: boolean;
}): boolean {
  const { isFromSelf, isForCurrentChat, isMuted } = options;
  return !isFromSelf && !isForCurrentChat && !isMuted;
}

