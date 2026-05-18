/**
 * Unified OS integration — badge count, progress bar, attention request, startup.
 *
 * Electron: native APIs via IPC (dock badge, taskbar progress, flash frame, tray)
 * PWA: navigator.setAppBadge (Chrome 81+, Edge 81+)
 * Browser: no-op
 *
 * Usage:
 *   import { osIntegration } from "~/lib/os-integration";
 *
 *   osIntegration.setBadgeCount(totalUnread); // >0 → dot on PWA/Electron icons
 *   osIntegration.setProgressBar(0.75);       // download progress
 *   osIntegration.requestAttention();         // flash taskbar / bounce dock
 *   osIntegration.clearProgressBar();
 *   osIntegration.setStartupEnabled(true);    // open at login
 */

import { getElectronAPI, isElectron } from "./electron";

export interface OsIntegration {
  setBadgeCount(count: number): void;
  setProgressBar(progress: number): void;
  clearProgressBar(): void;
  requestAttention(): void;
  setStartupEnabled(enabled: boolean): void;
  getStartupEnabled(): Promise<boolean>;
}

function createElectronIntegration(): OsIntegration {
  return {
    setBadgeCount(count) {
      getElectronAPI()?.os.setBadgeCount(count);
    },
    setProgressBar(progress) {
      getElectronAPI()?.os.setProgressBar(progress);
    },
    clearProgressBar() {
      getElectronAPI()?.os.setProgressBar(-1);
    },
    requestAttention() {
      getElectronAPI()?.os.requestAttention();
    },
    setStartupEnabled(enabled) {
      getElectronAPI()?.os.setLoginItemSettings(enabled);
    },
    async getStartupEnabled() {
      const result = await getElectronAPI()?.os.getLoginItemSettings();
      return result?.openAtLogin ?? false;
    },
  };
}

function createWebIntegration(): OsIntegration {
  return {
    setBadgeCount(count) {
      if ("setAppBadge" in navigator) {
        if (count > 0) {
          void (
            navigator as Navigator & { setAppBadge: (contents?: string) => Promise<void> }
          ).setAppBadge();
        } else {
          void (navigator as Navigator & { clearAppBadge: () => Promise<void> }).clearAppBadge();
        }
      }
    },
    setProgressBar() {},
    clearProgressBar() {},
    requestAttention() {},
    setStartupEnabled() {},
    getStartupEnabled() {
      return Promise.resolve(false);
    },
  };
}

export const osIntegration: OsIntegration = isElectron()
  ? createElectronIntegration()
  : createWebIntegration();
