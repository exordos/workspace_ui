/**
 * Application settings type definitions.
 *
 * Persisted to localStorage. Controls chat sorting order,
 * notification sound preference, and UI language.
 */

import type { MessengerSidebarSortMode } from "~/entities/messenger/messenger-sidebar.lib";

export type NotificationSound = "default" | "subtle" | "digital" | "glass" | "pulse" | "none";
export type AppLanguage = "en" | "ru";
export type FolderRailLayout = "vertical" | "horizontal";
export type ChatListDensity = "standard" | "compact";
export type ChatClickAction = "general" | "latestTopic";
export type AuthIdleTimeout = "6h" | "12h" | "24h" | "3d" | "7d" | "never";

export interface AppSettings {
  prioritizePersonalUnread: boolean;
  prioritizeUnmutedUnreadChannels: boolean;
  messengerSidebarSortMode: MessengerSidebarSortMode;
  notificationSound: NotificationSound;
  dockBounceEnabled: boolean;
  language: AppLanguage;
  folderRailLayout: FolderRailLayout;
  showSystemFolders: boolean;
  chatListDensity: ChatListDensity;
  chatClickAction: ChatClickAction;
  composerToolbarExpanded: boolean;
  authIdleTimeout: AuthIdleTimeout;
}
