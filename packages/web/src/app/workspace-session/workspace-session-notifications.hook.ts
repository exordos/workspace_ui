import { useMemo } from "react";
import { useMessengerBackgroundProjectionStore } from "~/applications/messenger/runtime/sync/messenger-background-projection.model";
import {
  useWorkspaceAuthStore,
  type WorkspaceAuthSession,
} from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/platform/sessions/workspace-runtime.lib";
import type { WorkspaceNotificationOwner } from "~/widgets/layout/layout-workspace-notifications.hook";
import { readWorkspaceSession } from "./workspace-session-bootstrap.lib";

// Use only the account display name and its public host for a generic notification.
function accountLabel(session: WorkspaceAuthSession): string {
  const username = session.profile.username?.trim();
  let hostname: string | null = null;
  try {
    const url = new URL(session.organizationOrigin);
    if (url.protocol === "https:" || url.protocol === "http:") hostname = url.hostname;
  } catch {
    // An invalid origin must not expose a raw URL or internal identifiers.
  }
  return [username, hostname].filter(Boolean).join(" · ");
}

// Supply notification data only for projections belonging to a currently authorized owner.
export function useWorkspaceNotificationOwners(): readonly WorkspaceNotificationOwner[] {
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const projections = useMessengerBackgroundProjectionStore((state) => state.projectionsByOwnerKey);
  return useMemo(() => {
    const owners = new Map<string, WorkspaceNotificationOwner>();
    for (const session of sessions) {
      const ownerKey = workspaceRuntimeOwnerKey(session);
      const projection = projections[ownerKey];
      if (projection == null || owners.has(ownerKey)) continue;
      owners.set(ownerKey, {
        ownerKey,
        projection,
        accountLabel: accountLabel(session),
        isSelected: () => useWorkspaceAuthStore.getState().currentAccountId === session.accountId,
        isAuthorized: () => readWorkspaceSession(session) != null,
      });
    }
    return [...owners.values()];
  }, [currentAccountId, projections, sessions]);
}
