/**
 * Notification policy — pure decision helpers.
 *
 * `shouldNotify` stays as a tiny generic helper for simple mute/self checks.
 * Workspace desktop policy is exported from this module as the only rich path.
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
  shouldWorkspaceDesktopNotify,
  classifyWorkspaceNotificationTrigger,
  isWorkspaceDesktopNotificationMuted,
  isWorkspaceDesktopNotificationEnabledForTrigger,
  type WorkspaceNotificationMessageTrigger,
  type WorkspaceDesktopNotificationMessageContext,
  type WorkspaceDesktopNotificationViewportContext,
  type ShouldWorkspaceDesktopNotifyInput,
  type ShouldWorkspaceDesktopNotifyResult,
} from "./workspace-desktop-notifications.lib";
