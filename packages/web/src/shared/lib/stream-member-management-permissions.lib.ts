/**
 * Runtime stream action capabilities aligned with Workspace stream-binding roles.
 */
import type { WorkspaceStreamRole } from "~/shared/api/messenger.types";

export interface ResolveCurrentUserChannelCapabilitiesInput {
  currentUserStreamRole?: WorkspaceStreamRole | null;
}

export interface ChannelActionCapabilities {
  canAddSubscribers: boolean;
  canRemoveSubscribers: boolean;
  canEditChannelMetadata: boolean;
  canArchiveChannel: boolean;
}

function canManageStream(role: WorkspaceStreamRole | null | undefined): boolean {
  return role === "owner" || role === "administrator";
}

export function resolveCurrentUserChannelCapabilities(
  input: ResolveCurrentUserChannelCapabilitiesInput,
): ChannelActionCapabilities {
  const canManage = canManageStream(input.currentUserStreamRole);
  return {
    canAddSubscribers: canManage,
    canRemoveSubscribers: canManage,
    canEditChannelMetadata: canManage,
    canArchiveChannel: canManage,
  };
}
