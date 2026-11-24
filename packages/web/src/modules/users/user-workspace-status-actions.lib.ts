import { buildWorkspaceRequestOptions } from "~/entities/workspace-auth/workspace-auth.lib";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { WorkspaceMessengerUserDto } from "~/shared/api/messenger.types";
import {
  invokeUserPresence as defaultInvokeUserPresence,
  type InvokeWorkspaceUserPresenceBody,
  type WorkspaceClientOptions,
} from "~/shared/api/workspace-client";
import { adaptWorkspaceMessengerUserDto } from "./user-adapters.lib";
import { writeManualStatus } from "./user-manual-status.lib";
import { manualStatusFromAwayToggle } from "./user-presence-status.lib";
import { useUsersStore } from "./user.model";
import type { User } from "./user.types";

export const WORKSPACE_STATUS_TEXT_MAX_LENGTH = 256;
export const WORKSPACE_STATUS_EMOJI_MAX_LENGTH = 64;

export interface UpdateWorkspaceOwnStatusParams {
  runtimeContext: WorkspaceRuntimeContext; // Selected screen context at the time of the request.
  statusText: string;
  statusEmoji: string | null;
  away: boolean;
  signal?: AbortSignal;
  invokePresence?: (
    options: WorkspaceClientOptions,
    userUuid: string,
    body: InvokeWorkspaceUserPresenceBody,
  ) => Promise<WorkspaceMessengerUserDto>;
}

// An invalidated request has no result for the currently selected screen.
export type UpdateWorkspaceOwnStatusResult =
  | { ok: true; user: User }
  | { ok: false; kind: "stale" }
  | { ok: false; kind: "transient"; message: string };

function normalizeOptionalStatusValue(value: string | null, maxLength: number): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : null;
}

export function buildWorkspaceOwnStatusBody(
  params: Pick<UpdateWorkspaceOwnStatusParams, "statusText" | "statusEmoji" | "away">,
): InvokeWorkspaceUserPresenceBody {
  return {
    status: params.away ? "idle" : "active",
    emoji: normalizeOptionalStatusValue(params.statusEmoji, WORKSPACE_STATUS_EMOJI_MAX_LENGTH),
    text: normalizeOptionalStatusValue(params.statusText, WORKSPACE_STATUS_TEXT_MAX_LENGTH),
  };
}

function upsertWorkspaceStatusUser(ownerKey: string, user: User): void {
  const state = useUsersStore.getState();
  if (state.ownerKey == null) {
    state.upsertUser(user);
    return;
  }
  state.upsertUserForOwner(ownerKey, user);
}

// Apply a confirmed manual status only while the same Workspace account selection is active.
export async function updateWorkspaceOwnStatus({
  runtimeContext,
  statusText,
  statusEmoji,
  away,
  signal,
  invokePresence = defaultInvokeUserPresence,
}: UpdateWorkspaceOwnStatusParams): Promise<UpdateWorkspaceOwnStatusResult> {
  const { getCurrentRuntimeContext, sessionSelectionGeneration } = useWorkspaceAuthStore.getState();
  if (isWorkspaceRuntimeRequestInvalidated(runtimeContext, getCurrentRuntimeContext, signal)) {
    return { ok: false, kind: "stale" };
  }
  const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
  // The transport can renew credentials during the request without changing account selection.
  const isInvalidated = () => {
    const auth = useWorkspaceAuthStore.getState();
    const current = auth.getCurrentRuntimeContext();
    return (
      signal?.aborted === true ||
      auth.sessionSelectionGeneration !== sessionSelectionGeneration ||
      current == null ||
      workspaceRuntimeOwnerKey(current) !== ownerKey
    );
  };

  try {
    const userDto = await invokePresence(
      buildWorkspaceRequestOptions(runtimeContext, undefined, signal),
      runtimeContext.userUuid,
      buildWorkspaceOwnStatusBody({ statusText, statusEmoji, away }),
    );
    if (isInvalidated()) return { ok: false, kind: "stale" };
    const user = adaptWorkspaceMessengerUserDto(userDto);
    // Remember that this was a choice, not a measurement: once it reaches the
    // server the two are indistinguishable, and the heartbeat would overwrite it.
    writeManualStatus(runtimeContext.userUuid, manualStatusFromAwayToggle(away));
    upsertWorkspaceStatusUser(ownerKey, user);
    return { ok: true, user };
  } catch (error) {
    if (isInvalidated()) return { ok: false, kind: "stale" };
    return {
      ok: false,
      kind: "transient",
      message: error instanceof Error ? error.message : "Workspace status update failed",
    };
  }
}
