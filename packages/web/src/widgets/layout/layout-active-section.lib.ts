import { extractOrgRouteFromPathname } from "~/shared/lib/org-route";
import type { TopBarSection } from "~/widgets/top-bar/top-bar.ui";

export function getSectionFromPathname(pathname: string): TopBarSection {
  const { scopedPathname } = extractOrgRouteFromPathname(pathname);
  if (scopedPathname.startsWith("/calendar")) return "calendar";
  if (scopedPathname.startsWith("/mail")) return "mail";
  if (scopedPathname.startsWith("/calls")) return "calls";
  if (scopedPathname.startsWith("/services") || scopedPathname.startsWith("/all-services")) {
    return "services";
  }
  return "chat";
}
