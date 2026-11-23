import { workspaceInboxRoute } from "~/shared/lib/workspace-messenger-route.lib";
import type { WorkspaceAuthSession } from "./workspace-auth.model";

export const WORKSPACE_AUTH_EMPTY_ROUTE = "/login";

export function resolveWorkspacePostLogoutRoute(
  nextSession: Pick<WorkspaceAuthSession, "organizationId" | "projectId"> | null | undefined,
): string {
  if (nextSession == null) {
    return WORKSPACE_AUTH_EMPTY_ROUTE;
  }
  return workspaceInboxRoute(nextSession.organizationId, nextSession.projectId);
}
