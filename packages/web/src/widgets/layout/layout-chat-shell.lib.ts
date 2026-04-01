import { extractOrgRouteFromPathname } from "~/shared/lib/org-route";
import type { TopBarSection } from "~/widgets/top-bar/top-bar.types";

const FULL_PAGE_CHAT_SHELL_EXCLUDED_ROUTES = new Set(["/settings/logs", "/logs"]);

export function isFullPageDiagnosticsRoute(pathname: string): boolean {
  const { scopedPathname } = extractOrgRouteFromPathname(pathname);
  return FULL_PAGE_CHAT_SHELL_EXCLUDED_ROUTES.has(scopedPathname);
}

export function shouldRenderChatShell(pathname: string, activeSection: TopBarSection): boolean {
  if (activeSection !== "chat") return false;
  return !isFullPageDiagnosticsRoute(pathname);
}
