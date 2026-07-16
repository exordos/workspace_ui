/** Applies canonical realtime entity snapshots to the persistent bootstrap cache. */
import {
  parseMeStream,
  parseStreamBinding,
  parseStreamTopic,
} from "~/shared/api/messenger-streams";
import { parseMessengerGatewayUser } from "~/shared/api/messenger-users.lib";
import { resolveCurrentMessengerEntitiesCacheKey } from "~/shared/lib/messenger-cache-scope.lib";
import {
  type MessengerEntitiesSnapshotRow,
  updateMessengerEntitiesSnapshotRow,
} from "~/shared/lib/messenger-entities-snapshot-db";
import type { WorkspaceEvent } from "~/shared/types/workspace-event";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function replaceByUuid<T extends { uuid?: string; user_id?: string | number }>(
  rows: readonly T[],
  next: T,
): T[] {
  const nextId = String(next.uuid ?? next.user_id ?? "")
    .trim()
    .toLowerCase();
  if (nextId.length === 0) return [...rows];
  const index = rows.findIndex(
    (row) =>
      String(row.uuid ?? row.user_id ?? "")
        .trim()
        .toLowerCase() === nextId,
  );
  return index < 0
    ? [...rows, next]
    : rows.map((row, rowIndex) => (rowIndex === index ? next : row));
}

function removeByUuid<T extends { uuid?: string }>(rows: readonly T[], uuid: string): T[] {
  const normalized = uuid.trim().toLowerCase();
  return rows.filter((row) => row.uuid?.trim().toLowerCase() !== normalized);
}

function updateStreamSnapshot(
  current: MessengerEntitiesSnapshotRow,
  payload: Record<string, unknown>,
  kind: string,
): MessengerEntitiesSnapshotRow {
  const uuid = typeof payload.uuid === "string" ? payload.uuid : "";
  if (kind === "stream.deleted") {
    return {
      ...current,
      savedAt: Date.now(),
      streams: removeByUuid(current.streams, uuid),
      topics: current.topics.filter((topic) => topic.stream_uuid !== uuid),
      bindings: current.bindings.filter((binding) => binding.stream_uuid !== uuid),
    };
  }
  const stream = parseMeStream(payload);
  return stream == null
    ? current
    : { ...current, savedAt: Date.now(), streams: replaceByUuid(current.streams, stream) };
}

function updateTopicSnapshot(
  current: MessengerEntitiesSnapshotRow,
  payload: Record<string, unknown>,
  kind: string,
): MessengerEntitiesSnapshotRow {
  const uuid = typeof payload.uuid === "string" ? payload.uuid : "";
  if (kind === "topic.deleted") {
    return { ...current, savedAt: Date.now(), topics: removeByUuid(current.topics, uuid) };
  }
  const topic = parseStreamTopic(payload);
  return topic == null
    ? current
    : { ...current, savedAt: Date.now(), topics: replaceByUuid(current.topics, topic) };
}

function updateBindingSnapshot(
  current: MessengerEntitiesSnapshotRow,
  payload: Record<string, unknown>,
  kind: string,
): MessengerEntitiesSnapshotRow {
  const uuid = typeof payload.uuid === "string" ? payload.uuid : "";
  if (kind === "stream_binding.deleted") {
    return { ...current, savedAt: Date.now(), bindings: removeByUuid(current.bindings, uuid) };
  }
  const rawItems =
    kind === "stream_bindings.created" && Array.isArray(payload.items) ? payload.items : [payload];
  const bindings = rawItems
    .map((item) => parseStreamBinding(item))
    .filter((item): item is NonNullable<typeof item> => item != null);
  if (bindings.length === 0) return current;
  return {
    ...current,
    savedAt: Date.now(),
    bindings: bindings.reduce((rows, binding) => replaceByUuid(rows, binding), current.bindings),
  };
}

function updateSnapshotForEntityEvent(
  current: MessengerEntitiesSnapshotRow,
  event: WorkspaceEvent,
  payload: Record<string, unknown>,
  kind: string,
): MessengerEntitiesSnapshotRow {
  if (event.object_type === "user" && kind === "user.updated") {
    const user = parseMessengerGatewayUser(payload);
    return user == null
      ? current
      : { ...current, savedAt: Date.now(), users: replaceByUuid(current.users, user) };
  }
  if (event.object_type === "stream") return updateStreamSnapshot(current, payload, kind);
  if (event.object_type === "topic") return updateTopicSnapshot(current, payload, kind);
  if (event.object_type === "stream_binding") {
    return updateBindingSnapshot(current, payload, kind);
  }
  return current;
}

export function persistWorkspaceEntityEventToCache(event: WorkspaceEvent): Promise<void> {
  const payload = isRecord(event.payload) ? event.payload : null;
  if (payload == null) return Promise.resolve();
  const cacheKey = resolveCurrentMessengerEntitiesCacheKey();
  if (cacheKey == null) return Promise.resolve();
  const kind = typeof payload.kind === "string" ? payload.kind : "";

  return updateMessengerEntitiesSnapshotRow(cacheKey, (current) =>
    updateSnapshotForEntityEvent(current, event, payload, kind),
  );
}
