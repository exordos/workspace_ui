import type { TopBarSection } from "~/widgets/top-bar/top-bar.ui";

export function resolveShortcutPanelToggle(
  currentOpen: boolean,
  activeSection: TopBarSection,
): boolean {
  if (activeSection !== "chat") {
    return currentOpen;
  }
  return !currentOpen;
}
