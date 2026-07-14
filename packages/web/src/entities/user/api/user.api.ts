/**
 * Public user API facade for backend-only user data.
 *
 * The unified backend exposes account data through /api/workspace/v1/users/.
 * Presence is reported through the Workspace users presence action.
 */

import {
  getCurrentInstance,
  getWorkspaceCommonApiBaseForCurrentInstance,
  messengerApi,
} from "~/shared/api/client";
import { parseMessengerGatewayUser } from "~/shared/api/messenger-users.lib";
import type {
  MessengerUserMember,
  WorkspaceUserPresenceStatus,
} from "~/shared/api/messenger.types";
import { resolveUserUuidFromAccessToken } from "~/shared/lib/access-token-claims.lib";
import { resolveIamAccessToken } from "~/shared/lib/iam-instance.lib";
import {
  applyUserStatusAwayPreference,
  readUserStatusAwayPreference,
  writeUserStatusAwayPreference,
} from "../user-status-away-preference.lib";
import { useUsersStore } from "../user.model";
import type { UserStatus, UserStatusReactionType } from "../user.model";
import type { OwnStatusMutationErrorKind, OwnStatusMutationResult } from "./user.api.types";

export type { OwnStatusMutationResult } from "./user.api.types";

type ReportablePresenceStatus = Exclude<WorkspaceUserPresenceStatus, "offline">;

interface CurrentUserContext {
  instanceId: string | null;
  userUuid: string;
}

export interface UpdateOwnStatusParams {
  text: string;
  emojiName?: string;
  emojiCode?: string;
  reactionType?: UserStatusReactionType;
  away?: boolean;
}

function normalizeSubmittedStatus(params: UpdateOwnStatusParams): UserStatus | null {
  const text = params.text.trim();
  const emojiName = params.emojiName?.trim() ?? "";
  const emojiCode = emojiName ? (params.emojiCode?.trim() ?? "") : "";
  const reactionType = emojiName ? params.reactionType : undefined;
  const away = params.away === true;

  if (!text && !emojiName && !away) {
    return null;
  }

  return {
    text,
    emojiName: emojiName || undefined,
    emojiCode: emojiCode || undefined,
    reactionType,
    away,
  };
}

function resolveCurrentUserContext(): CurrentUserContext | null {
  const instance = getCurrentInstance();
  if (instance == null) {
    return null;
  }
  const userUuid = resolveUserUuidFromAccessToken(resolveIamAccessToken(instance));
  if (userUuid == null) {
    return null;
  }
  return {
    instanceId: instance.id ?? null,
    userUuid,
  };
}

function currentPresenceStatusForHeartbeat(
  context: CurrentUserContext,
  status: ReportablePresenceStatus,
): ReportablePresenceStatus {
  const awayPreference = readUserStatusAwayPreference(context.userUuid, context.instanceId);
  if (awayPreference === true) {
    return "idle";
  }
  const user = useUsersStore.getState().getUser(context.userUuid);
  if (user?.presence?.status === "do_not_disturb") {
    return "do_not_disturb";
  }
  if (awayPreference === false) {
    return status;
  }
  return user?.status?.away === true ? "idle" : status;
}

async function fetchAndMergeCurrentUserSnapshot(
  base: string,
  context: CurrentUserContext,
): Promise<MessengerUserMember | null> {
  const res = await messengerApi.getWithBase(base, `/users/${context.userUuid}`);
  if (!res.ok) {
    return null;
  }
  const parsedUser = parseMessengerGatewayUser(res.data);
  if (parsedUser == null) {
    return null;
  }
  const user = applyUserStatusAwayPreference(parsedUser, context.userUuid, context.instanceId);
  const store = useUsersStore.getState();
  store.mergeUser(user);
  store.setStatus(user.user_id, user.status ?? null, Date.now());
  return user;
}

async function ensureOwnStatusLoadedBeforeHeartbeat(
  base: string,
  context: CurrentUserContext,
): Promise<boolean> {
  if (readUserStatusAwayPreference(context.userUuid, context.instanceId) != null) {
    return true;
  }
  const user = useUsersStore.getState().getUser(context.userUuid);
  if (user?.statusFetchedAt != null) {
    return true;
  }
  try {
    return (await fetchAndMergeCurrentUserSnapshot(base, context)) != null;
  } catch {
    return false;
  }
}

function statusMutationErrorKind(status: number): OwnStatusMutationErrorKind {
  if (status === 400) {
    return "invalid";
  }
  if (status === 403) {
    return "forbidden";
  }
  return "transient";
}

export async function reportPresence(status: ReportablePresenceStatus): Promise<void> {
  const context = resolveCurrentUserContext();
  if (context == null) {
    return;
  }
  const base = getWorkspaceCommonApiBaseForCurrentInstance();
  const isStatusLoaded = await ensureOwnStatusLoadedBeforeHeartbeat(base, context);
  if (!isStatusLoaded) {
    return;
  }
  const outgoingStatus = currentPresenceStatusForHeartbeat(context, status);
  const res = await messengerApi.postJsonWithBase(
    base,
    `/users/${context.userUuid}/actions/presence/invoke`,
    { status: outgoingStatus },
  );
  if (!res.ok) {
    return;
  }
  const parsedUser = parseMessengerGatewayUser(res.data);
  if (parsedUser != null) {
    useUsersStore
      .getState()
      .mergeUser(applyUserStatusAwayPreference(parsedUser, context.userUuid, context.instanceId));
  }
}

export async function fetchOwnStatus(): Promise<UserStatus | null> {
  const context = resolveCurrentUserContext();
  if (context == null) {
    return null;
  }
  try {
    const user = await fetchAndMergeCurrentUserSnapshot(
      getWorkspaceCommonApiBaseForCurrentInstance(),
      context,
    );
    return user?.status ?? null;
  } catch {
    return null;
  }
}

export async function updateOwnStatus(
  params: UpdateOwnStatusParams,
): Promise<OwnStatusMutationResult> {
  const context = resolveCurrentUserContext();
  if (context == null) {
    return {
      ok: false,
      status: 401,
      kind: "forbidden",
      message: "Current user identity is unavailable",
    };
  }

  const status = normalizeSubmittedStatus(params);
  const text = status?.text.trim() ?? "";
  const emojiName = status?.emojiName?.trim() ?? "";
  const res = await messengerApi.postJsonWithBase(
    getWorkspaceCommonApiBaseForCurrentInstance(),
    `/users/${context.userUuid}/actions/presence/invoke`,
    {
      status: status?.away === true ? "idle" : "active",
      emoji: emojiName.length > 0 ? emojiName : null,
      text: text.length > 0 ? text : null,
    },
  );

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      kind: statusMutationErrorKind(res.status),
      message: "Failed to update status",
    };
  }

  writeUserStatusAwayPreference(context.userUuid, context.instanceId, status?.away === true);
  const parsedUser = parseMessengerGatewayUser(res.data);
  if (parsedUser != null) {
    const user = applyUserStatusAwayPreference(parsedUser, context.userUuid, context.instanceId);
    const store = useUsersStore.getState();
    store.mergeUser(user);
    store.setStatus(user.user_id, status, Date.now());
  }
  return { ok: true, status };
}
