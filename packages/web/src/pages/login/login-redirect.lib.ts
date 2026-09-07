import {
  isLegacyMessengerPathname,
  workspaceInboxRoute,
  workspaceMessengerRootRoute,
} from "~/shared/lib/workspace-messenger-route.lib";
import { parseWorkspaceProfileShareHash } from "~/shared/lib/workspace-profile-link.lib";

export function resolveWorkspaceLoginRedirect({
  redirectTarget,
  organizationId,
  projectId,
}: {
  redirectTarget: string | null;
  organizationId: string;
  projectId: string;
}): string {
  const userUuid = redirectTarget?.startsWith("/#")
    ? parseWorkspaceProfileShareHash(redirectTarget.slice(1))
    : null;
  // Session activation also redirects the public entry; land directly to avoid replaying it.
  if (userUuid != null) {
    return `${workspaceInboxRoute(organizationId, projectId)}#user/${userUuid}`;
  }
  return redirectTarget ?? workspaceMessengerRootRoute(organizationId, projectId);
}

export function sanitizeInternalRedirectTarget(
  rawTarget: string | null | undefined,
): string | null {
  const trimmed = rawTarget?.trim();
  if (!trimmed) {
    return null;
  }

  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return null;
  }
  if (isLegacyMessengerPathname(trimmed)) {
    return null;
  }

  return trimmed;
}
