import type { WorkspaceRightPanelInfoView } from "~/entities/messenger/messenger-right-panel.lib";
import type {
  RightDrawerAccountScreen,
  RightDrawerMode,
} from "~/widgets/right-panel/right-drawer.model";

export type RightDrawerInfoKind = WorkspaceRightPanelInfoView["kind"];

export function resolveLayoutAccountScreenTitle(
  screen: RightDrawerAccountScreen | null,
  translate: (key: string) => string,
): string | null {
  if (screen === "settings") return translate("settings.settings");
  if (screen === "appearance") return translate("settings.appearance");
  if (screen === "about") return translate("settings.appVersion");
  if (screen === "personal-info") return translate("settings.personalInfo");
  return null;
}

/**
 * Resolves the right-drawer shell title (panel purpose), not the entity name.
 * Channel/user names stay inside panel body content.
 */
export function resolveLayoutRightPanelTitle(
  mode: RightDrawerMode,
  translate: (key: string) => string,
  infoKind: RightDrawerInfoKind | null = null,
): string {
  // Same unified panel for settings and user-menu: shell title is the whole account drawer.
  if (mode === "settings" || mode === "user-menu") return translate("nav.account");
  // Preserve titles for dedicated legacy drawer modes and the update indicator entry point.
  if (mode === "personal-info" || mode === "about") {
    return resolveLayoutAccountScreenTitle(mode, translate) ?? "";
  }
  if (infoKind === "directPrivate" || infoKind === "userProfile") {
    return translate("info.information");
  }
  return translate("info.channelInfo");
}
