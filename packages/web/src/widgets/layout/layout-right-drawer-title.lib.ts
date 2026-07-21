import type { WorkspaceRightPanelInfoView } from "~/entities/messenger/messenger-right-panel.lib";
import type { RightDrawerMode } from "~/widgets/right-panel/right-drawer.model";

export type RightDrawerInfoKind = WorkspaceRightPanelInfoView["kind"];

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
  if (mode === "about") return translate("settings.appVersion");
  if (mode === "builds") return translate("settings.selectBuild");
  if (infoKind === "directPrivate" || infoKind === "userProfile") {
    return translate("info.information");
  }
  return translate("info.channelInfo");
}
