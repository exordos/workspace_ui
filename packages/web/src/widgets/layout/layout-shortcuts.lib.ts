import type { TopBarSection } from "~/widgets/top-bar/top-bar.types";

export function resolveShortcutPanelToggle(
  currentOpen: boolean,
  activeSection: TopBarSection,
): boolean {
  if (activeSection !== "chat") {
    return currentOpen;
  }
  return !currentOpen;
}
