/**
 * Application settings type definitions.
 *
 * Persisted to localStorage. Controls chat sorting order,
 * notification sound preference, and UI language.
 */

export type ChatSorting = "recent" | "unread" | "alphabetical";
export type NotificationSound = "default" | "subtle" | "digital" | "glass" | "pulse" | "none";
export type AppLanguage = "en" | "ru";
export type FolderRailLayout = "vertical" | "horizontal";
export type ChatListDensity = "standard" | "compact";

export interface AppSettings {
  /**
   * Legacy persisted mode kept for migration compatibility.
   * New sorting behavior is driven by explicit unread-priority flags below.
   */
  chatSorting: ChatSorting;
  prioritizePersonalUnread: boolean;
  prioritizeUnmutedUnreadChannels: boolean;
  notificationSound: NotificationSound;
  language: AppLanguage;
  folderRailLayout: FolderRailLayout;
  showSystemFolders: boolean;
  chatListDensity: ChatListDensity;
}
