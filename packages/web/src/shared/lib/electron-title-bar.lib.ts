/**
 * Electron macOS title bar layout constants.
 *
 * When the main process uses `titleBarStyle: "hiddenInset"`, traffic lights sit in
 * the top-left. A dedicated top strip clears that vertical band so the toolbar row
 * can use the same horizontal padding as the web app (`pl-5` on the left slot).
 * Keep strip height in sync with `trafficLightPosition` in `packages/electron/src/main.ts`.
 */
/** Empty row under the traffic-light cluster (~28px). */
export const ELECTRON_MAC_TITLEBAR_STRIP_CLASS = "h-7";
