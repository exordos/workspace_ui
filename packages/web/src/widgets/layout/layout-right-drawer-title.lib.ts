import type { RightDrawerMode } from "~/widgets/right-panel/right-drawer.model";

/** Resolves right drawer header label from mode (settings / profile / about vs chat context). */
export function resolveLayoutRightPanelTitle(
  mode: RightDrawerMode,
  chatContextTitle: string,
  translate: (key: string) => string,
): string {
  if (mode === "settings") return translate("settings.settings");
  if (mode === "user-menu") return translate("nav.profile");
  if (mode === "about") return translate("settings.appVersion");
  return chatContextTitle;
}
