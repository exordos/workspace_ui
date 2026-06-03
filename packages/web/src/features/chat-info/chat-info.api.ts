import { fetchStreamMembers, fetchStreams } from "~/shared/api/zulip-streams";
import type { MockStream } from "~/shared/api/zulip.types";

// chat-info data layer: eager members/metadata load, TTL cache, in-flight dedupe, invalidation.
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const MEMBERS_TTL_MS = 60_000;
const STREAMS_TTL_MS = 5 * 60_000;

const streamMembersCache = new Map<string, CacheEntry<number[]>>();
const streamsSnapshotCache = new Map<string, CacheEntry<MockStream[]>>();

const streamMembersInFlight = new Map<string, Promise<number[]>>();
const streamsSnapshotInFlight = new Map<string, Promise<MockStream[]>>();

function streamMembersCacheKey(instanceId: string, streamId: number): string {
  return `${instanceId}:${streamId}`;
}

function isEntryFresh<T>(entry: CacheEntry<T> | undefined, now: number): entry is CacheEntry<T> {
  return entry != null && entry.expiresAt > now;
}

export async function loadStreamMembers(
  instanceId: string,
  streamId: number,
  options?: { force?: boolean },
): Promise<number[]> {
  // cache → in-flight → network → cache
  const key = streamMembersCacheKey(instanceId, streamId);
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

  const request = fetchStreamMembers(streamId)
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
  streamId: number,
  options?: { force?: boolean },
): Promise<{ name: string | null; description: string | null }> {
  // Name + description come from the streams list snapshot.
  const streams = await loadStreamsSnapshot(instanceId, options);
  const stream = streams.find((entry) => entry.stream_id === streamId);
  return {
    name: stream?.name ?? null,
    description: stream?.description ?? null,
  };
}

export function invalidateStream(instanceId: string, streamId: number): void {
  const key = streamMembersCacheKey(instanceId, streamId);
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
