function instanceScopedKey(instanceId: string, baseKey: string): string {
  return `${instanceId}::${baseKey}`;
}

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
  return instanceScopedKey(normalizedInstanceId, baseKey);
}

export function buildNotificationAggregateTag(
  bucketKey: string,
  instanceId: string | null | undefined = null,
): string {
  return `bucket:${buildScopedNotificationKey(bucketKey, instanceId)}`;
}

export function buildWorkspaceNotificationFallbackTag(
  ownerKey: string,
  messageUuid: string,
): string {
  return `msg:${buildScopedNotificationKey(messageUuid, ownerKey)}`;
}

export function buildWorkspaceNotificationMessageScopeKey(
  ownerKey: string,
  messageUuid: string,
): string {
  return buildScopedNotificationKey(`message:${messageUuid}`, ownerKey);
}

export function buildWorkspaceNotificationBucketKey(ownerKey: string, bucketKey: string): string {
  return buildScopedNotificationKey(bucketKey, ownerKey);
}
