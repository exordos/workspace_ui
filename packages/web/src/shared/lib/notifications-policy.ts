/**
 * Notification policy — pure decision helpers.
 *
 * Legacy `shouldNotify` kept for simple mute/self checks.
 * Desktop decisions use `shouldDesktopNotify` from zulip-desktop-notifications.lib.ts.
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

export {
  shouldDesktopNotify,
  classifyNotificationTrigger,
  type NotificationMessageTrigger,
  type ShouldDesktopNotifyInput,
  type ShouldDesktopNotifyResult,
} from "./zulip-desktop-notifications.lib";
