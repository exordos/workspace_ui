import { extractOrgRouteFromPathname } from "~/shared/lib/org-route";
import type { UpdateStatus } from "~/shared/lib/updater";

export function isForceUpdateRequiredStatus(status: UpdateStatus): boolean {
  return status === "ready";
}

export function shouldRedirectToForceUpdate({
  hasInstances,
  isForceUpdateRequired,
  pathname,
  forceUpdateEnabled = true,
}: {
  hasInstances: boolean;
  isForceUpdateRequired: boolean;
  pathname: string;
  forceUpdateEnabled?: boolean;
}): boolean {
  const { scopedPathname } = extractOrgRouteFromPathname(pathname);
  return (
    forceUpdateEnabled &&
    hasInstances &&
    isForceUpdateRequired &&
    scopedPathname !== "/force-update"
  );
}
