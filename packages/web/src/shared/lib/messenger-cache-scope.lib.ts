/** Stable messenger cache identity: server origin + project UUID + authenticated user UUID. */
import { getCurrentInstance } from "~/shared/api/client";
import {
  resolveProjectUuidFromAccessToken,
  resolveUserUuidFromAccessToken,
} from "~/shared/lib/access-token-claims.lib";
import { resolveIamAccessToken, resolveIamApiOrigin } from "~/shared/lib/iam-instance.lib";
import { buildMessengerEntitiesCacheKey } from "~/shared/lib/messenger-entities-snapshot-db";

export interface MessengerCacheAccountScope {
  accountScope: string;
  projectIdFromToken: string | null;
  userUuid: string;
}

export function resolveCurrentMessengerCacheAccountScope(): MessengerCacheAccountScope | null {
  const instance = getCurrentInstance();
  if (instance == null) return null;
  const token = resolveIamAccessToken(instance);
  const userUuid = resolveUserUuidFromAccessToken(token);
  const origin = resolveIamApiOrigin(instance).trim().replace(/\/+$/, "").toLowerCase();
  if (userUuid == null || origin.length === 0) return null;
  return {
    accountScope: `${origin}|${userUuid}`,
    projectIdFromToken: resolveProjectUuidFromAccessToken(token),
    userUuid,
  };
}

export function resolveCurrentMessengerEntitiesCacheKey(projectId: string): string | null {
  const scope = resolveCurrentMessengerCacheAccountScope();
  return scope == null ? null : buildMessengerEntitiesCacheKey(scope.accountScope, projectId);
}
