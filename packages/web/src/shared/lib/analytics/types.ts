/**
 * Analytics type definitions.
 *
 * Provider-agnostic types for the entire analytics subsystem.
 * Every provider (GA4, Yandex Metrika, custom) implements AnalyticsProvider.
 */

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export interface AnalyticsProvider {
  readonly name: string;
  init(): void;
  track(event: string, properties?: EventProperties): void;
  page(path: string, title?: string): void;
  identify(userId: string, traits?: UserTraits): void;
  reset(): void;
  setConsent(granted: boolean): void;
}

export type EventProperties = Record<string, string | number | boolean | null | undefined>;

export interface UserTraits {
  email?: string;
  name?: string;
  role?: string;
  instanceId?: string;
  plan?: string;
  locale?: string;
  theme?: string;
  runtime?: string;
  [key: string]: string | number | boolean | undefined;
}

export type ConsentStatus = "granted" | "denied" | "pending";

// ---------------------------------------------------------------------------
// Event taxonomy — standard events for the messenger
// ---------------------------------------------------------------------------

/**
 * Predefined event names used across the app.
 * This is the source of truth — use these constants, not raw strings.
 */
export const AnalyticsEvent = {
  // Auth
  LOGIN: "login",
  LOGOUT: "logout",
  SIGNUP: "signup",

  // Messaging
  MESSAGE_SENT: "message_sent",
  MESSAGE_EDITED: "message_edited",
  MESSAGE_DELETED: "message_deleted",
  MESSAGE_REACTION: "message_reaction",
  MESSAGE_REPLY: "message_reply",
  MESSAGE_FORWARDED: "message_forwarded",
  MESSAGE_COPIED: "message_copied",
  MESSAGE_STARRED: "message_starred",

  // Navigation
  STREAM_OPENED: "stream_opened",
  TOPIC_OPENED: "topic_opened",
  DM_OPENED: "dm_opened",
  SECTION_CHANGED: "section_changed",
  SEARCH_PERFORMED: "search_performed",
  SEARCH_RESULT_CLICKED: "search_result_clicked",
  DEEP_LINK_OPENED: "deep_link_opened",

  // Calls
  CALL_STARTED: "call_started",
  CALL_JOINED: "call_joined",
  CALL_ENDED: "call_ended",

  // UI interactions
  SIDEBAR_TOGGLED: "sidebar_toggled",
  THEME_CHANGED: "theme_changed",
  SHORTCUT_USED: "shortcut_used",
  CONTEXT_MENU_OPENED: "context_menu_opened",
  EMOJI_PICKER_OPENED: "emoji_picker_opened",
  ATTACHMENT_UPLOADED: "attachment_uploaded",

  // Features
  PWA_INSTALLED: "pwa_installed",
  NOTIFICATION_ALLOWED: "notification_allowed",
  NOTIFICATION_DENIED: "notification_denied",
  NOTIFICATION_CLICKED: "notification_clicked",

  // Engagement
  SESSION_START: "session_start",
  SESSION_END: "session_end",
  APP_FOREGROUNDED: "app_foregrounded",
  APP_BACKGROUNDED: "app_backgrounded",
  NETWORK_RECONNECTED: "network_reconnected",

  // Errors (product-level, not technical)
  FEATURE_ERROR: "feature_error",
  API_ERROR_USER_FACING: "api_error_user_facing",
} as const;

export type AnalyticsEventName = (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent];
