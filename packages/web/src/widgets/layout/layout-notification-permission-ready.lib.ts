export function shouldEnableLayoutNotificationPermission(options: {
  workspaceScopeKey: string | null;
  workspaceMessengerActive: boolean;
}): boolean {
  if (options.workspaceMessengerActive) return options.workspaceScopeKey != null;
  return false;
}
