import { isElectronDisableAutoUpdateEnv } from "./electron-build-flags.mjs";

/**
 * esbuild `define` map for `main.ts` — must stay in sync for `build.mjs` and `dev.mjs`.
 */
export function getMainEsbuildDefine() {
  const disableAutoUpdate = isElectronDisableAutoUpdateEnv(
    process.env.ELECTRON_DISABLE_AUTO_UPDATE,
  );
  return {
    __ELECTRON_DISABLE_AUTO_UPDATE__: disableAutoUpdate ? "true" : "false",
  };
}
