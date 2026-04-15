/**
 * Build-time flags for the Electron main/preload bundle (read from `process.env` when `build.mjs` runs).
 */

/** Truthy: "1", "true", "yes" (case-insensitive). Everything else is falsy. */
export function isElectronDisableAutoUpdateEnv(value) {
  if (value == null) return false;
  const s = String(value).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}
