/** Builds `/stream/:streamSlug` in the Workspace client format: the stream UUID. */
export function buildStreamSlug(streamUuid: string): string {
  return encodeURIComponent(streamUuid.trim().toLowerCase());
}
