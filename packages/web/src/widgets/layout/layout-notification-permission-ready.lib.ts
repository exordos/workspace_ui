import { isLayoutUserConnectionReady } from "./layout-user-connection-status.types";
import type { LayoutUserConnectionStatus } from "./layout-user-connection-status.types";

export function shouldEnableLayoutNotificationPermission(options: {
  legacyOrganizationId: string | null;
  workspaceScopeKey: string | null;
  workspaceMessengerActive: boolean;
  currentUserStatus: LayoutUserConnectionStatus;
}): boolean {
  if (options.workspaceMessengerActive) return options.workspaceScopeKey != null;
  if (options.legacyOrganizationId == null) return false;
  return isLayoutUserConnectionReady(options.currentUserStatus);
}
