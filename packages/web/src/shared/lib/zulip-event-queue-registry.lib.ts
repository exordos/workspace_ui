/**
 * In-memory registry of active Zulip event `queue_id` values per logged-in instance.
 *
 * Used when sending messages so the server can correlate the send with our long-poll queue.
 */
import { getCurrentInstance } from "~/shared/api/client";

const queueIdByInstanceId = new Map<string, string>();

export function setZulipEventQueueId(instanceId: string, queueId: string): void {
  const safeInstanceId = instanceId.trim();
  const safeQueueId = queueId.trim();
  if (safeInstanceId.length === 0 || safeQueueId.length === 0) return;
  queueIdByInstanceId.set(safeInstanceId, safeQueueId);
}

export function clearZulipEventQueueId(instanceId: string): void {
  const safeInstanceId = instanceId.trim();
  if (safeInstanceId.length === 0) return;
  queueIdByInstanceId.delete(safeInstanceId);
}

export function clearAllZulipEventQueueIds(): void {
  queueIdByInstanceId.clear();
}

/** Active event queue for the currently selected instance, if the loop has registered one. */
export function getZulipEventQueueIdForCurrentInstance(): string | undefined {
  const instance = getCurrentInstance();
  if (instance == null) return undefined;
  return queueIdByInstanceId.get(instance.id);
}
