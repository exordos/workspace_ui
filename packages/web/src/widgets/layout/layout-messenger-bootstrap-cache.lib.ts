/** Cache-first, single-flight bootstrap for messenger entity snapshots. */
import {
  fetchMyStreams,
  fetchStreamBindings,
  fetchStreamTopics,
} from "~/shared/api/messenger-streams";
import { fetchUsers, getCurrentUserIdFromAccessToken } from "~/shared/api/messenger-users";
import type {
  MessengerMeStream,
  MessengerStreamTopic,
  MessengerUserMember,
  WorkspaceStreamBinding,
} from "~/shared/api/messenger.types";
import { resolveCurrentMessengerCacheAccountScope } from "~/shared/lib/messenger-cache-scope.lib";
import {
  buildMessengerEntitiesCacheKey,
  loadMessengerEntitiesSnapshotRow,
  persistMessengerEntitiesSnapshotRow,
} from "~/shared/lib/messenger-entities-snapshot-db";
import type { UserId } from "~/shared/lib/user-id.lib";

export interface LayoutMessengerBootstrapEntities {
  source: "cache" | "network";
  currentUserId: UserId | null;
  users: MessengerUserMember[];
  streams: MessengerMeStream[];
  topics: MessengerStreamTopic[];
  bindings: WorkspaceStreamBinding[];
  cacheKey: string | null;
}

const inFlightByScope = new Map<string, Promise<LayoutMessengerBootstrapEntities>>();

async function loadBootstrapEntities(): Promise<LayoutMessengerBootstrapEntities> {
  const scope = resolveCurrentMessengerCacheAccountScope();
  const cacheKey =
    scope == null ? null : buildMessengerEntitiesCacheKey(scope.accountScope, scope.projectId);
  const cached = cacheKey == null ? null : await loadMessengerEntitiesSnapshotRow(cacheKey);
  if (cached != null) {
    return {
      source: "cache",
      currentUserId: cached.currentUserId,
      users: cached.users,
      streams: cached.streams,
      topics: cached.topics,
      bindings: cached.bindings,
      cacheKey: cached.cacheKey,
    };
  }

  const currentUserId = scope?.userUuid ?? getCurrentUserIdFromAccessToken();
  const [users, streams, topics, bindings] = await Promise.all([
    fetchUsers(),
    fetchMyStreams(),
    fetchStreamTopics(),
    fetchStreamBindings(),
  ]);
  if (currentUserId != null && users.length > 0 && scope != null) {
    await persistMessengerEntitiesSnapshotRow({
      cacheKey: buildMessengerEntitiesCacheKey(scope.accountScope, scope.projectId),
      accountScope: scope.accountScope,
      projectId: scope.projectId,
      version: 1,
      savedAt: Date.now(),
      currentUserId,
      users,
      streams,
      topics,
      bindings,
    });
  }
  return {
    source: "network",
    currentUserId,
    users,
    streams,
    topics,
    bindings,
    cacheKey,
  };
}

export function loadLayoutMessengerBootstrapEntities(
  instanceId: string,
): Promise<LayoutMessengerBootstrapEntities> {
  const scope = resolveCurrentMessengerCacheAccountScope();
  const singleFlightKey = scope?.accountScope ?? `instance:${instanceId}`;
  const existing = inFlightByScope.get(singleFlightKey);
  if (existing != null) {
    return existing;
  }
  const request = loadBootstrapEntities().finally(() => {
    if (inFlightByScope.get(singleFlightKey) === request) {
      inFlightByScope.delete(singleFlightKey);
    }
  });
  inFlightByScope.set(singleFlightKey, request);
  return request;
}

export function resetLayoutMessengerBootstrapCacheForTests(): void {
  inFlightByScope.clear();
}
