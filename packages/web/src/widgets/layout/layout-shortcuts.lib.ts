import type { TopBarSection } from "~/widgets/top-bar";

export function resolveShortcutPanelToggle(
  currentOpen: boolean,
  activeSection: TopBarSection,
): boolean {
  if (activeSection !== "chat") {
    return currentOpen;
  }
  return !currentOpen;
}
