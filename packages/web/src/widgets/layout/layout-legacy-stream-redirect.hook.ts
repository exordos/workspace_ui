import { useEffect } from "react";
import type { NavigateFunction } from "react-router-dom";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { parseStreamSlug, slugForStream } from "~/widgets/sidebar/sidebar.lib";

/**
 * Redirects legacy `/stream/general`-style slugs (no stream_id) to the first known channel slug
 * once stream list is available.
 */
export function useLayoutLegacyStreamSlugRedirect(options: {
  activeStreamSlug: string | undefined;
  streamsFromStore: readonly { stream_id: number; name: string }[];
  navigate: NavigateFunction;
}): void {
  const { activeStreamSlug, streamsFromStore, navigate } = options;
  useEffect(() => {
    if (!activeStreamSlug || streamsFromStore.length === 0) return;
    const parsed = parseStreamSlug(activeStreamSlug);
    if (parsed.stream_id != null) return;
    const first = streamsFromStore[0];
    if (first) {
      void navigate(withCurrentOrgRoute(`/stream/${slugForStream(first)}`), { replace: true });
    }
  }, [activeStreamSlug, streamsFromStore, navigate]);
}
