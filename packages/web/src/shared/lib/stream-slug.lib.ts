/**
 * Builds `/stream/:streamSlug` segment in Zulip client format: `{id}-{normalized-name}`.
 */
export function buildStreamSlug(streamId: number, streamName: string): string {
  const lower = streamName.trim().toLowerCase();
  const safe = lower.replace(/[^\p{L}\p{N}-]/gu, "-").replace(/-+/g, "-");
  const slug = safe.replace(/^-|-$/g, "") || "chat";
  return `${streamId}-${slug}`;
}
