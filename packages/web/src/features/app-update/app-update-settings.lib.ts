export function shouldShowAppUpdateSettings(
  isProduction: boolean,
  isElectronRuntime: boolean,
): boolean {
  return !isProduction || isElectronRuntime;
}
