declare module "@jitsi/electron-sdk/main" {
  import type { BrowserWindow } from "electron";

  interface ScreenSharingMainHook {
    cleanup: () => void;
    _screenShareTracker?: BrowserWindow;
  }

  export function setupScreenSharingMain(
    jitsiMeetWindow: BrowserWindow,
    identity: string,
    osxBundleId?: string,
  ): ScreenSharingMainHook;
}

declare module "@jitsi/electron-sdk/preload" {
  export function install(): void;
}
