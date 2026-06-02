/**
 * Desktop notification decision logic aligned with Zulip web client.
 *
 * Combines message flags, server user settings, mute state, and viewport/focus
 * to decide whether to show OS notifications and play sounds.
 */

import type { ZulipNotificationSettings } from "./zulip-notification-settings.lib";

export type NotificationMessageTrigger =
  | "dm"
  | "mention"
  | "wildcard_mention"
  | "followed_topic"
  | "stream";

export interface DesktopNotificationMessageContext {
  /** Zulip message type (`"private"` for DMs, `"stream"` for channels). */
  type: string;
  flags?: string[];
  isTopicFollowed: boolean;
}

export interface DesktopNotificationViewportContext {
  isFromSelf: boolean;
  /** Message is visible at the live tail of the open chat. */
  isOnScreenInCurrentChat: boolean;
  isMuted: boolean;
  windowFocused: boolean;
  windowHidden: boolean;
}

export interface ShouldDesktopNotifyInput {
  message: DesktopNotificationMessageContext;
  viewport: DesktopNotificationViewportContext;
  settings: ZulipNotificationSettings;
}

export interface ShouldDesktopNotifyResult {
  notify: boolean;
  playSound: boolean;
  trigger: NotificationMessageTrigger;
  soundPreset: string;
}

export function classifyNotificationTrigger(
  message: DesktopNotificationMessageContext,
): NotificationMessageTrigger {
  if (message.type === "private") {
    return "dm";
  }

  const flags = message.flags ?? [];
  if (flags.includes("wildcard_mentioned")) {
    return "wildcard_mention";
  }
  if (flags.includes("mentioned")) {
    return "mention";
  }
  if (message.isTopicFollowed) {
    return "followed_topic";
  }
  return "stream";
}

export function isDesktopEnabledForTrigger(
  settings: ZulipNotificationSettings,
  trigger: NotificationMessageTrigger,
): boolean {
  switch (trigger) {
    case "dm":
    case "mention":
      return settings.enableDesktopNotifications;
    case "wildcard_mention":
      return settings.enableDesktopNotifications && settings.wildcardMentionsNotify;
    case "followed_topic":
      return settings.enableFollowedTopicDesktopNotifications;
    case "stream":
      return settings.enableStreamDesktopNotifications;
    default:
      return false;
  }
}

export function isSoundEnabledForTrigger(
  settings: ZulipNotificationSettings,
  trigger: NotificationMessageTrigger,
): boolean {
  switch (trigger) {
    case "dm":
    case "mention":
      return settings.enableSounds;
    case "wildcard_mention":
      return settings.enableSounds && settings.wildcardMentionsNotify;
    case "followed_topic":
      return settings.enableFollowedTopicAudibleNotifications;
    case "stream":
      return settings.enableStreamAudibleNotifications;
    default:
      return false;
  }
}

/**
 * Whether the user should get audible / desktop alerts for this message.
 *
 * Tab in background → alert even when the open chat is with this sender (DM or live tail).
 * Tab focused → alert only when the message is not on screen in the current chat.
 */
export function isMessageOffscreenOrAppUnfocused(
  viewport: DesktopNotificationViewportContext,
): boolean {
  const appFocused = viewport.windowFocused && !viewport.windowHidden;
  if (!appFocused) {
    return true;
  }
  return !viewport.isOnScreenInCurrentChat;
}

export function shouldDesktopNotify(input: ShouldDesktopNotifyInput): ShouldDesktopNotifyResult {
  const trigger = classifyNotificationTrigger(input.message);
  const soundPreset = input.settings.notificationSound;

  const blocked =
    input.viewport.isFromSelf ||
    input.viewport.isMuted ||
    !isDesktopEnabledForTrigger(input.settings, trigger) ||
    !isMessageOffscreenOrAppUnfocused(input.viewport);

  if (blocked) {
    return { notify: false, playSound: false, trigger, soundPreset };
  }

  const playSound = isSoundEnabledForTrigger(input.settings, trigger);
  return { notify: true, playSound, trigger, soundPreset };
}
