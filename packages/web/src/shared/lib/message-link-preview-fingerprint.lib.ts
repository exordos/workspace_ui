/**
 * Fingerprint for link-preview cache invalidation when message markdown changes.
 */
export function linkPreviewContentFingerprint(markdown: string): string {
  let hash = 0;
  for (let i = 0; i < markdown.length; i++) {
    hash = Math.imul(31, hash) + markdown.charCodeAt(i);
    hash |= 0;
  }
  return `${markdown.length}:${hash}`;
}
