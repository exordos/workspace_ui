export type LayoutTopBannerKind = "connection" | "notification-permission" | null;

export function resolveLayoutTopBannerKind(
  connectionMessage: string | null,
  showNotificationPermission: boolean,
): LayoutTopBannerKind {
  if (connectionMessage != null) {
    return "connection";
  }
  if (showNotificationPermission) {
    return "notification-permission";
  }
  return null;
}
