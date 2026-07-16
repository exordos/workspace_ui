import { fetchStreamMemberBindings, fetchStreams } from "~/shared/api/messenger-streams";
import type { MockStream, WorkspaceStreamRole } from "~/shared/api/messenger.types";
import { resolveCurrentMessengerCacheAccountScope } from "~/shared/lib/messenger-cache-scope.lib";
import {
  buildMessengerEntitiesCacheKey,
  loadMessengerEntitiesSnapshotRow,
} from "~/shared/lib/messenger-entities-snapshot-db";
import type { UserId } from "~/shared/lib/user-id.lib";
import { userIdStorageKey } from "~/shared/lib/user-id.lib";

// chat-info data layer: eager members/metadata load, TTL cache, in-flight dedupe, invalidation.
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const MEMBERS_TTL_MS = 60_000;
const STREAMS_TTL_MS = 5 * 60_000;

export interface StreamMembersSnapshot {
  memberIds: UserId[];
  rolesByUserId: Record<string, WorkspaceStreamRole>;
  bindingUuidsByUserId: Record<string, string>;
}

const streamMembersCache = new Map<string, CacheEntry<StreamMembersSnapshot>>();
const streamsSnapshotCache = new Map<string, CacheEntry<MockStream[]>>();

const streamMembersInFlight = new Map<string, Promise<StreamMembersSnapshot>>();
const streamsSnapshotInFlight = new Map<string, Promise<MockStream[]>>();

function normalizeStreamUuid(streamUuid: string): string {
  return streamUuid.trim().toLowerCase();
}

function streamMembersCacheKey(instanceId: string, streamUuid: string): string {
  return `${instanceId}:${normalizeStreamUuid(streamUuid)}`;
}

function isEntryFresh<T>(entry: CacheEntry<T> | undefined, now: number): entry is CacheEntry<T> {
  return entry != null && entry.expiresAt > now;
}

async function loadPersistentEntitiesSnapshot() {
  const scope = resolveCurrentMessengerCacheAccountScope();
  if (scope == null) return null;
  return loadMessengerEntitiesSnapshotRow(
    buildMessengerEntitiesCacheKey(scope.accountScope, scope.projectId),
  );
}

export async function loadStreamMembers(
  instanceId: string,
  streamUuid: string,
  options?: { force?: boolean },
): Promise<UserId[]> {
  const snapshot = await loadStreamMembersSnapshot(instanceId, streamUuid, options);
  return [...snapshot.memberIds];
}

export async function loadStreamMembersSnapshot(
  instanceId: string,
  streamUuid: string,
  options?: { force?: boolean },
): Promise<StreamMembersSnapshot> {
  // cache -> in-flight -> network -> cache
  const key = streamMembersCacheKey(instanceId, streamUuid);
  const now = Date.now();
  if (!options?.force) {
    const cached = streamMembersCache.get(key);
    if (isEntryFresh(cached, now)) {
      return {
        memberIds: [...cached.value.memberIds],
        rolesByUserId: { ...cached.value.rolesByUserId },
        bindingUuidsByUserId: { ...cached.value.bindingUuidsByUserId },
      };
    }
    const persisted = await loadPersistentEntitiesSnapshot();
    if (persisted != null) {
      const bindings = persisted.bindings.filter(
        (binding) => binding.stream_uuid === normalizeStreamUuid(streamUuid),
      );
      const value: StreamMembersSnapshot = {
        memberIds: bindings.map((binding) => binding.user_uuid),
        rolesByUserId: Object.fromEntries(
          bindings.map((binding) => [userIdStorageKey(binding.user_uuid), binding.role]),
        ),
        bindingUuidsByUserId: Object.fromEntries(
          bindings.map((binding) => [userIdStorageKey(binding.user_uuid), binding.uuid]),
        ),
      };
      streamMembersCache.set(key, { value, expiresAt: Number.POSITIVE_INFINITY });
      return value;
    }
  }

  const inFlight = streamMembersInFlight.get(key);
  if (inFlight) {
    return inFlight;
  }

  const request = fetchStreamMemberBindings(streamUuid)
    .then((bindings) => {
      const memberIds = bindings.map((binding) => binding.user_uuid);
      const rolesByUserId: Record<string, WorkspaceStreamRole> = {};
      const bindingUuidsByUserId: Record<string, string> = {};
      for (const binding of bindings) {
        const userKey = userIdStorageKey(binding.user_uuid);
        rolesByUserId[userKey] = binding.role;
        bindingUuidsByUserId[userKey] = binding.uuid;
      }
      const next: StreamMembersSnapshot = {
        memberIds,
        rolesByUserId,
        bindingUuidsByUserId,
      };
      streamMembersCache.set(key, {
        value: next,
        expiresAt: Date.now() + MEMBERS_TTL_MS,
      });
      return {
        memberIds: [...next.memberIds],
        rolesByUserId: { ...next.rolesByUserId },
        bindingUuidsByUserId: { ...next.bindingUuidsByUserId },
      };
    })
    .finally(() => {
      streamMembersInFlight.delete(key);
    });
  streamMembersInFlight.set(key, request);
  return request;
}

export async function loadStreamsSnapshot(
  instanceId: string,
  options?: { force?: boolean },
): Promise<MockStream[]> {
  // cache → in-flight → network → cache
  const now = Date.now();
  if (!options?.force) {
    const cached = streamsSnapshotCache.get(instanceId);
    if (isEntryFresh(cached, now)) {
      return [...cached.value];
    }
    const persisted = await loadPersistentEntitiesSnapshot();
    if (persisted != null) {
      const streams = persisted.streams
        .filter((stream) => !stream.private)
        .map((stream) => ({
          stream_uuid: stream.stream_uuid,
          default_topic_uuid: stream.default_topic_uuid,
          name: stream.name,
          description: stream.description,
          is_announcement_only: stream.announce,
          invite_only: stream.invite_only,
          ...(stream.owner != null ? { owner: stream.owner } : {}),
          ...(stream.source_name != null ? { source_name: stream.source_name } : {}),
          ...(stream.source != null ? { source: stream.source } : {}),
          ...(stream.color != null ? { color: stream.color } : {}),
        }));
      streamsSnapshotCache.set(instanceId, {
        value: streams,
        expiresAt: Number.POSITIVE_INFINITY,
      });
      return streams;
    }
  }

  const inFlight = streamsSnapshotInFlight.get(instanceId);
  if (inFlight) {
    return inFlight;
  }

  const request = fetchStreams()
    .then((streams) => {
      const next = [...streams];
      streamsSnapshotCache.set(instanceId, {
        value: next,
        expiresAt: Date.now() + STREAMS_TTL_MS,
      });
      return next;
    })
    .finally(() => {
      streamsSnapshotInFlight.delete(instanceId);
    });
  streamsSnapshotInFlight.set(instanceId, request);
  return request;
}

export async function loadStreamMetadata(
  instanceId: string,
  streamUuid: string,
  options?: { force?: boolean },
): Promise<{ name: string | null; description: string | null }> {
  // Name + description come from the streams list snapshot.
  const normalizedStreamUuid = normalizeStreamUuid(streamUuid);
  const streams = await loadStreamsSnapshot(instanceId, options);
  const stream = streams.find((entry) => entry.stream_uuid === normalizedStreamUuid);
  return {
    name: stream?.name ?? null,
    description: stream?.description ?? null,
  };
}

export function invalidateStream(instanceId: string, streamUuid: string): void {
  const key = streamMembersCacheKey(instanceId, streamUuid);
  streamMembersCache.delete(key);
  streamMembersInFlight.delete(key);
  streamsSnapshotCache.delete(instanceId);
  streamsSnapshotInFlight.delete(instanceId);
}

export function invalidateInstance(instanceId: string): void {
  streamsSnapshotCache.delete(instanceId);
  streamsSnapshotInFlight.delete(instanceId);
  for (const key of streamMembersCache.keys()) {
    if (key.startsWith(`${instanceId}:`)) {
      streamMembersCache.delete(key);
    }
  }
  for (const key of streamMembersInFlight.keys()) {
    if (key.startsWith(`${instanceId}:`)) {
      streamMembersInFlight.delete(key);
    }
  }
}

export function resetChatInfoApiCacheForTests(): void {
  streamMembersCache.clear();
  streamsSnapshotCache.clear();
  streamMembersInFlight.clear();
  streamsSnapshotInFlight.clear();
}
