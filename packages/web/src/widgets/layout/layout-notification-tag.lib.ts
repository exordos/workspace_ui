import { instanceChatKey } from "~/shared/lib/message-cache-keys.lib";

function normalizeNotificationInstanceId(instanceId: string | null | undefined): string | null {
  const trimmed = instanceId?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function buildScopedNotificationKey(
  baseKey: string,
  instanceId: string | null | undefined,
): string {
  const normalizedInstanceId = normalizeNotificationInstanceId(instanceId);
  if (normalizedInstanceId == null) {
    return baseKey;
  }
  return instanceChatKey(normalizedInstanceId, baseKey);
}

export function buildNotificationAggregateTag(
  bucketKey: string,
  instanceId: string | null | undefined,
): string {
  return `bucket:${buildScopedNotificationKey(bucketKey, instanceId)}`;
}

export function buildNotificationFallbackTag(
  messageId: number,
  instanceId: string | null | undefined,
): string {
  return `msg:${buildScopedNotificationKey(String(messageId), instanceId)}`;
}

export function buildNotificationMessageScopeKey(
  messageId: number,
  instanceId: string | null | undefined,
): string {
  return buildScopedNotificationKey(`message:${messageId}`, instanceId);
}
