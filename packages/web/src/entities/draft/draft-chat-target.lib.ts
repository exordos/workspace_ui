import type { UserId } from "~/shared/lib/user-id.lib";
import type { DraftTargetId } from "./draft.types";

interface ResolveDraftTargetIdsOptions {
  isDmView: boolean;
  activeDmUserIds: UserId[] | null;
  activeStreamId: string | null;
  fallbackStreamId: string | null;
}

export function resolveDraftTargetIds(options: ResolveDraftTargetIdsOptions): DraftTargetId[] {
  const { isDmView, activeDmUserIds, activeStreamId, fallbackStreamId } = options;

  if (isDmView && activeDmUserIds != null) {
    return activeDmUserIds;
  }

  if (activeStreamId != null) {
    return [activeStreamId];
  }

  if (fallbackStreamId != null) {
    return [fallbackStreamId];
  }

  return [];
}
