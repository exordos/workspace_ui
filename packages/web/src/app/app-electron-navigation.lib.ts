import { isTrayMessengerOpenRoute } from "~/shared/lib/last-messenger-route.lib";
import { normalizeElectronDeeplinkRoute } from "./app-deeplink.lib";

export type ElectronTrayNavigationTarget =
  | { type: "navigate"; route: string }
  | { type: "open-messenger" };

/**
 * Maps a tray/deeplink route from the Electron main process to a renderer action.
 *
 * Returns `null` for unsafe or unrecognized routes.
 */
export function resolveElectronTrayNavigation(route: string): ElectronTrayNavigationTarget | null {
  const normalizedRoute = normalizeElectronDeeplinkRoute(route);
  if (!normalizedRoute) {
    return null;
  }
  if (isTrayMessengerOpenRoute(normalizedRoute)) {
    return { type: "open-messenger" };
  }
  return { type: "navigate", route: normalizedRoute };
}
