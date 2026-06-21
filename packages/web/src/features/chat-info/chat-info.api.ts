import { fetchStreamMembers, fetchStreams } from "~/shared/api/messenger-streams";
import type { MockStream } from "~/shared/api/messenger.types";
import type { UserId } from "~/shared/lib/user-id.lib";

// chat-info data layer: eager members/metadata load, TTL cache, in-flight dedupe, invalidation.
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const MEMBERS_TTL_MS = 60_000;
const STREAMS_TTL_MS = 5 * 60_000;

const streamMembersCache = new Map<string, CacheEntry<UserId[]>>();
const streamsSnapshotCache = new Map<string, CacheEntry<MockStream[]>>();

const streamMembersInFlight = new Map<string, Promise<UserId[]>>();
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

export async function loadStreamMembers(
  instanceId: string,
  streamUuid: string,
  options?: { force?: boolean },
): Promise<UserId[]> {
  // cache -> in-flight -> network -> cache
  const key = streamMembersCacheKey(instanceId, streamUuid);
  const now = Date.now();
  if (!options?.force) {
    const cached = streamMembersCache.get(key);
    if (isEntryFresh(cached, now)) {
      return [...cached.value];
    }
  }

  const inFlight = streamMembersInFlight.get(key);
  if (inFlight) {
    return inFlight;
  }

  const request = fetchStreamMembers(streamUuid)
    .then((memberIds) => {
      const next = [...memberIds];
      streamMembersCache.set(key, {
        value: next,
        expiresAt: Date.now() + MEMBERS_TTL_MS,
      });
      return next;
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
