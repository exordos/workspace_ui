export interface StartFolderPollingOptions {
  enabled: boolean;
  refreshFolders: () => Promise<void> | void;
  pollIntervalMs?: number;
  runImmediately?: boolean;
}
