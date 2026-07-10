import type { SidebarChat } from "~/shared/types/sidebar-chat";
import type { ResolveChatShortcutRouteOptions } from "./layout-chat-shortcuts.types";

function toChatRoute(_chat: SidebarChat): string | null {
  return null;
}

function getActiveChatRoute(
  activeStreamSlug: string | null | undefined,
  activeDmIdParam: string | null | undefined,
): string | null {
  if (activeDmIdParam != null && activeDmIdParam.length > 0) {
    return null;
  }
  if (activeStreamSlug != null && activeStreamSlug.length > 0) {
    return null;
  }
  return null;
}

export function resolveChatShortcutRoute({
  sidebarChats,
  direction,
  activeStreamSlug,
  activeDmIdParam,
}: ResolveChatShortcutRouteOptions): string | null {
  if (sidebarChats.length === 0) return null;

  const routes = sidebarChats.map(toChatRoute).filter((route): route is string => route != null);
  const activeRoute = getActiveChatRoute(activeStreamSlug, activeDmIdParam);
  const activeIndex = activeRoute != null ? routes.indexOf(activeRoute) : -1;

  if (activeIndex < 0) {
    return direction === "next" ? routes[0]! : routes[routes.length - 1]!;
  }

  const targetIndex =
    direction === "next"
      ? (activeIndex + 1) % routes.length
      : (activeIndex - 1 + routes.length) % routes.length;
  return routes[targetIndex] ?? null;
}
