import type { WorkspaceAuthSession } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceInboxRoute } from "~/shared/lib/workspace-messenger-route.lib";
import { preserveWorkspaceProfileShareHash } from "~/shared/lib/workspace-profile-link.lib";

export function resolveProfileShareEntryRoute({
  sessions,
  currentAccountId,
  browserOrigin,
  hash,
}: {
  sessions: WorkspaceAuthSession[];
  currentAccountId: string | null;
  browserOrigin: string;
  hash: string;
}): string {
  const current = sessions.find((session) => session.accountId === currentAccountId);
  const matching =
    current?.organizationOrigin === browserOrigin
      ? current
      : sessions.find((session) => session.organizationOrigin === browserOrigin);
  if (matching == null) {
    const query = new URLSearchParams({
      redirectTo: preserveWorkspaceProfileShareHash("/", hash),
      realm: browserOrigin,
    });
    return `/login?${query.toString()}`;
  }
  return preserveWorkspaceProfileShareHash(
    workspaceInboxRoute(matching.organizationId, matching.projectId),
    hash,
  );
}
