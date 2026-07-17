import { buildWorkspaceRequestOptions } from "~/entities/messenger/messenger-request-options.lib";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { WorkspaceMessengerUserDto } from "~/shared/api/messenger.types";
import {
  invokeUserPresence as defaultInvokeUserPresence,
  type InvokeWorkspaceUserPresenceBody,
  type WorkspaceClientOptions,
} from "~/shared/api/workspace-client";
import { adaptWorkspaceMessengerUserDto } from "./user-adapters.lib";
import { useUsersStore, type UsersStoreState } from "./user.model";
import type { User } from "./user.types";

export const WORKSPACE_STATUS_TEXT_MAX_LENGTH = 256;
export const WORKSPACE_STATUS_EMOJI_MAX_LENGTH = 64;

export interface UpdateWorkspaceOwnStatusParams {
  runtimeContext: WorkspaceRuntimeContext;
  statusText: string;
  statusEmoji: string | null;
  away: boolean;
  signal?: AbortSignal;
  invokePresence?: (
    options: WorkspaceClientOptions,
    userUuid: string,
    body: InvokeWorkspaceUserPresenceBody,
  ) => Promise<WorkspaceMessengerUserDto>;
  store?: {
    getState: () => Pick<UsersStoreState, "ownerKey" | "upsertUser" | "upsertUserForOwner">;
  };
}

export type UpdateWorkspaceOwnStatusResult =
  | { ok: true; user: User }
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

function buildWorkspaceStatusRequestOptions(
  runtimeContext: WorkspaceRuntimeContext,
  signal?: AbortSignal,
): WorkspaceClientOptions {
  return buildWorkspaceRequestOptions(runtimeContext, undefined, signal);
}

function upsertWorkspaceStatusUser(
  runtimeContext: WorkspaceRuntimeContext,
  user: User,
  store: NonNullable<UpdateWorkspaceOwnStatusParams["store"]>,
): void {
  const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
  const state = store.getState();
  if (state.ownerKey == null) {
    state.upsertUser(user);
    return;
  }
  state.upsertUserForOwner(ownerKey, user);
}

export async function updateWorkspaceOwnStatus({
  runtimeContext,
  statusText,
  statusEmoji,
  away,
  signal,
  invokePresence = defaultInvokeUserPresence,
  store = useUsersStore,
}: UpdateWorkspaceOwnStatusParams): Promise<UpdateWorkspaceOwnStatusResult> {
  try {
    const userDto = await invokePresence(
      buildWorkspaceStatusRequestOptions(runtimeContext, signal),
      runtimeContext.userUuid,
      buildWorkspaceOwnStatusBody({ statusText, statusEmoji, away }),
    );
    const user = adaptWorkspaceMessengerUserDto(userDto);
    upsertWorkspaceStatusUser(runtimeContext, user, store);
    return { ok: true, user };
  } catch (error) {
    return {
      ok: false,
      kind: "transient",
      message: error instanceof Error ? error.message : "Workspace status update failed",
    };
  }
}
