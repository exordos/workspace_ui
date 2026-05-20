export type LinkPreviewCacheStatus = "idle" | "loading" | "ready" | "unavailable";

export interface LinkPreviewData {
  targetUrl: string;
  title?: string;
  description?: string;
  /** Realm-relative `/external_content/...` thumbnail from Zulip. */
  thumbnailPath?: string;
}

/** One URL slot after fetch (data null when Zulip returned no embed for that link). */
export interface LinkPreviewResolvedItem {
  targetUrl: string;
  data: LinkPreviewData | null;
}

export interface LinkPreviewCacheEntry {
  status: LinkPreviewCacheStatus;
  items: LinkPreviewResolvedItem[];
  contentFingerprint: string;
  fetchedAt: number;
}
