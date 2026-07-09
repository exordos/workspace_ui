export interface RefreshRealmPresenceOptions {
  isCancelled?: () => boolean;
}

/** Legacy presence refresh is intentionally disabled; Workspace realtime owns presence. */
export function refreshRealmPresenceFromApi(options?: RefreshRealmPresenceOptions): void {
  void options;
}
