interface ResolveDraftTargetIdsOptions {
  isDmView: boolean;
  activeDmUserIds: number[] | null;
  activeStreamId: number | null;
  fallbackStreamId: number | null;
}

export function resolveDraftTargetIds(options: ResolveDraftTargetIdsOptions): number[] {
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
