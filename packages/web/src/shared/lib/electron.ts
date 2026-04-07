/**
 * Electron integration helpers.
 *
 * In Electron, `window.electronAPI` is available via preload/contextBridge.
 * In browser mode it's undefined.
 */

export function isElectron(): boolean {
  return typeof window !== "undefined" && window.electronAPI != null;
}

export function getElectronAPI() {
  return window.electronAPI ?? null;
}

export async function showDesktopNotification(title: string, body: string): Promise<void> {
  const api = getElectronAPI();
  if (api) {
    await api.notifications.show(title, body);
  } else if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body });
  }
}
