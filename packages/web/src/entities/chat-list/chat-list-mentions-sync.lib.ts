export interface EnsureMentionsUnreadSyncedOptions {
  currentInstanceId: string | null;
  currentUserId: number | null;
  forceRefresh?: boolean;
  pageSize?: number;
}

export function ensureMentionsUnreadSynced(
  options: EnsureMentionsUnreadSyncedOptions,
): Promise<void> {
  void options;
  return Promise.resolve();
}
