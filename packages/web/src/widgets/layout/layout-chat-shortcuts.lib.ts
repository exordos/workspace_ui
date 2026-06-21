import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import type { SidebarChat } from "~/shared/types/sidebar-chat";
import { slugForStream } from "~/widgets/sidebar/sidebar.lib";
import type { ResolveChatShortcutRouteOptions } from "./layout-chat-shortcuts.types";

function toChatRoute(chat: SidebarChat): string | null {
  if (chat.type !== "stream") {
    return null;
  }
  return withCurrentOrgRoute(`/stream/${slugForStream(chat)}`);
}

function getActiveChatRoute(activeStreamSlug: string | null | undefined): string | null {
  if (activeStreamSlug != null && activeStreamSlug.length > 0) {
    return withCurrentOrgRoute(`/stream/${activeStreamSlug}`);
  }
  return null;
}

export function resolveChatShortcutRoute({
  sidebarChats,
  direction,
  activeStreamSlug,
}: ResolveChatShortcutRouteOptions): string | null {
  if (sidebarChats.length === 0) return null;

  const routes = sidebarChats.map(toChatRoute).filter((route): route is string => route != null);
  if (routes.length === 0) return null;
  const activeRoute = getActiveChatRoute(activeStreamSlug);
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
