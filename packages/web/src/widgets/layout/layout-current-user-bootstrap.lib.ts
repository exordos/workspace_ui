import type { ZulipInstance } from "~/entities/instance/instance.model";

export function getCurrentUserIdFromActiveInstance(
  instances: readonly ZulipInstance[],
  currentInstanceId: string | null,
): number | null {
  return instances.find((instance) => instance.id === currentInstanceId)?.userId ?? null;
}

export function syncCurrentUserIdFromActiveInstance({
  instances,
  currentInstanceId,
  currentUserId,
  setCurrentUserId,
}: {
  instances: readonly ZulipInstance[];
  currentInstanceId: string | null;
  currentUserId: number | null;
  setCurrentUserId: (id: number | null) => void;
}): void {
  const nextUserId = getCurrentUserIdFromActiveInstance(instances, currentInstanceId);
  if (currentUserId !== nextUserId) {
    setCurrentUserId(nextUserId);
  }
}
