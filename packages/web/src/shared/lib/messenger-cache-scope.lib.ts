/** Stable messenger cache identity: server origin + project UUID + authenticated user UUID. */
import { getCurrentInstance } from "~/shared/api/client";
import { WORKSPACE_PROJECT_UUID } from "~/shared/config/workspace-project";
import { resolveUserUuidFromAccessToken } from "~/shared/lib/access-token-claims.lib";
import { resolveIamAccessToken, resolveIamApiOrigin } from "~/shared/lib/iam-instance.lib";
import { buildMessengerEntitiesCacheKey } from "~/shared/lib/messenger-entities-snapshot-db";

export interface MessengerCacheAccountScope {
  accountScope: string;
  projectId: string;
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
    projectId: WORKSPACE_PROJECT_UUID,
    userUuid,
  };
}

export function resolveCurrentMessengerEntitiesCacheKey(): string | null {
  const scope = resolveCurrentMessengerCacheAccountScope();
  return scope == null
    ? null
    : buildMessengerEntitiesCacheKey(scope.accountScope, WORKSPACE_PROJECT_UUID);
}
