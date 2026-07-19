/** Removes only the exact File objects restored from the failed send attempt. */
export function removeRetriedComposerFiles(current: File[], retried: readonly File[]): File[] {
  const retriedFiles = new Set(retried);
  return current.filter((file) => !retriedFiles.has(file));
}
