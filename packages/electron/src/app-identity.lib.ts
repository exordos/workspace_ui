/**
 * OS-visible identity of the desktop app.
 *
 * Electron derives its name from the app package.json, so without pinning it
 * the shell introduces itself as "Electron" in dev (window class, `~/.config/Electron`)
 * and as the npm package name in packaged builds.
 *
 * Keep in sync with `electron-builder.yml` (productName / appId / executableName /
 * linux.desktop.StartupWMClass) and with the web brand defaults
 * (`packages/web/src/shared/lib/brand-defaults.lib.ts`).
 */

/** Human-readable name: window title, tray tooltip, notification header, macOS app menu. */
export const APP_DISPLAY_NAME = "Exordos Workspace";

/** Path- and WM-safe identifier: user data directory, X11 WM_CLASS, deb/rpm package name. */
export const APP_SLUG = "exordos-workspace";

/** Reverse-DNS id: macOS bundle, Windows AppUserModelID, electron-builder appId. */
export const APP_ID = "com.exordos.workspace";

/**
 * User data directory names written by earlier builds, newest naming first.
 *
 * `Electron` is deliberately absent: unpackaged Electron apps all share
 * `~/.config/Electron`, so adopting it would hijack another app's profile.
 */
export const LEGACY_USER_DATA_DIR_NAMES = [APP_DISPLAY_NAME, "electron-app"] as const;

/** Directory name for the app profile; dev builds stay out of the installed app's data. */
export function getUserDataDirName(isPackaged: boolean): string {
  return isPackaged ? APP_SLUG : `${APP_SLUG}-dev`;
}

/**
 * First legacy profile directory that exists, or `null`.
 *
 * The caller moves it to {@link APP_SLUG} so renaming the app does not log
 * everybody out — the session lives in the Chromium profile under userData.
 */
export function pickLegacyUserDataDirName(exists: (dirName: string) => boolean): string | null {
  return LEGACY_USER_DATA_DIR_NAMES.find((name) => exists(name)) ?? null;
}
