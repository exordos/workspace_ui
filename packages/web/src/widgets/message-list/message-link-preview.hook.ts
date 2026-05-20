import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useLinkPreviewStore } from "~/entities/link-preview/link-preview.model";
import type { MockMessage } from "~/shared/api/zulip.types";
import { useIntersectedOnce } from "~/shared/lib/intersected-once.hook";
import { linkPreviewContentFingerprint } from "~/shared/lib/message-link-preview-fingerprint.lib";
import { linkPreviewsFromMessage } from "~/shared/lib/message-link-preview-list.lib";
import { traceLinkPreview } from "~/shared/lib/message-link-preview-trace.lib";
import {
  linkPreviewUrlKey,
  linkPreviewUrlsMatch,
} from "~/shared/lib/message-link-preview-url-match.lib";
import { extractLinkPreviewUrls } from "~/shared/lib/message-link-preview-urls.lib";
import type {
  LinkPreviewCacheStatus,
  LinkPreviewData,
} from "~/shared/lib/message-link-preview.types";

export interface MessageLinkPreviewViewItem {
  previewUrl: string;
  previewData: LinkPreviewData | null | undefined;
  status: LinkPreviewCacheStatus;
}

/** Whether the preview card should occupy UI space (loading or has data). */
export function isMessageLinkPreviewVisible(item: MessageLinkPreviewViewItem): boolean {
  if (item.status === "loading") {
    return true;
  }
  return item.previewData != null;
}

export function useMessageLinkPreview(
  message: MockMessage,
  visibilityRootRef: RefObject<HTMLElement | null>,
): { previews: MessageLinkPreviewViewItem[]; visiblePreviews: MessageLinkPreviewViewItem[] } {
  const hasBeenVisible = useIntersectedOnce(visibilityRootRef);
  const markdownBody = message.markdown_source ?? message.content;
  const contentFingerprint = useMemo(
    () => linkPreviewContentFingerprint(markdownBody),
    [markdownBody],
  );

  const previewUrls = useMemo(() => extractLinkPreviewUrls(markdownBody), [markdownBody]);

  const serverPreviewsByUrl = useMemo(() => {
    const map = new Map<string, LinkPreviewData>();
    for (const preview of linkPreviewsFromMessage(message)) {
      map.set(linkPreviewUrlKey(preview.targetUrl), preview);
    }
    return map;
  }, [message]);

  const cacheEntry = useLinkPreviewStore((s) => s.byMessageId[message.id]);
  const isPreviewInFlight = useLinkPreviewStore((s) => s.inFlight.has(message.id));
  const cacheMatches = cacheEntry?.contentFingerprint === contentFingerprint;

  const allUrlsHaveServerPreview = useMemo(
    () =>
      previewUrls.length > 0 &&
      previewUrls.every((url) => serverPreviewsByUrl.has(linkPreviewUrlKey(url))),
    [previewUrls, serverPreviewsByUrl],
  );

  useEffect(() => {
    return () => {
      if (message.id > 0) {
        useLinkPreviewStore.getState().cancelPreviewForMessage(message.id);
      }
    };
  }, [message.id]);

  useEffect(() => {
    if (previewUrls.length === 0) {
      traceLinkPreview("hook:fetch-skipped", {
        messageId: message.id,
        reason: "no-preview-url",
      });
      return;
    }
    if (message.id <= 0) {
      traceLinkPreview("hook:fetch-skipped", {
        messageId: message.id,
        reason: "non-persisted-id",
      });
      return;
    }
    if (allUrlsHaveServerPreview) {
      traceLinkPreview("hook:fetch-skipped", {
        messageId: message.id,
        reason: "server-link-preview",
        urlCount: previewUrls.length,
      });
      return;
    }
    if (!hasBeenVisible) {
      traceLinkPreview("hook:fetch-skipped", {
        messageId: message.id,
        reason: "not-visible",
      });
      return;
    }
    const fetchSatisfiedByCache =
      cacheMatches &&
      cacheEntry != null &&
      (cacheEntry.status === "ready" ||
        cacheEntry.status === "unavailable" ||
        (cacheEntry.status === "loading" && isPreviewInFlight));
    if (fetchSatisfiedByCache) {
      traceLinkPreview("hook:fetch-skipped", {
        messageId: message.id,
        reason: "cache-hit",
        cacheStatus: cacheEntry?.status,
        contentFingerprint,
      });
      return;
    }
    traceLinkPreview("hook:fetch-start", {
      messageId: message.id,
      contentFingerprint,
      cacheMatches,
      cacheStatus: cacheEntry?.status ?? "none",
      cacheFingerprint: cacheEntry?.contentFingerprint ?? null,
      markdownBodyLen: markdownBody.length,
      urlCount: previewUrls.length,
      hasMarkdownSource: message.markdown_source != null,
    });
    void useLinkPreviewStore.getState().requestPreviewForMessage(message.id, markdownBody);
  }, [
    previewUrls,
    message.id,
    message.markdown_source,
    markdownBody,
    contentFingerprint,
    allUrlsHaveServerPreview,
    cacheMatches,
    cacheEntry,
    isPreviewInFlight,
    hasBeenVisible,
  ]);

  const previews = useMemo((): MessageLinkPreviewViewItem[] => {
    return previewUrls.map((previewUrl) => {
      const key = linkPreviewUrlKey(previewUrl);
      const serverPreview = serverPreviewsByUrl.get(key);
      if (serverPreview != null) {
        return {
          previewUrl,
          previewData: serverPreview,
          status: "ready" as const,
        };
      }

      const cacheItem = cacheMatches
        ? cacheEntry?.items.find((item) => linkPreviewUrlsMatch(item.targetUrl, previewUrl))
        : undefined;
      const cacheData = cacheItem?.data ?? null;

      let status: LinkPreviewCacheStatus = "idle";
      if (cacheData != null) {
        status = "ready";
      } else if (isPreviewInFlight) {
        status = "loading";
      } else if (cacheMatches && cacheEntry?.status === "unavailable") {
        status = "unavailable";
      } else if (cacheMatches && cacheEntry?.status === "ready") {
        status = "unavailable";
      } else if (cacheMatches && cacheEntry?.status === "loading") {
        status = "loading";
      }

      return {
        previewUrl,
        previewData: cacheMatches ? cacheData : null,
        status,
      };
    });
  }, [
    previewUrls,
    serverPreviewsByUrl,
    cacheMatches,
    cacheEntry?.items,
    cacheEntry?.status,
    isPreviewInFlight,
  ]);

  const visiblePreviews = useMemo(() => previews.filter(isMessageLinkPreviewVisible), [previews]);

  const prevTraceRef = useRef<string | null>(null);
  useEffect(() => {
    const payload = {
      messageId: message.id,
      previewUrlCount: previewUrls.length,
      previewCount: previews.length,
      visibleCount: visiblePreviews.length,
      cacheMatches,
      contentFingerprint,
      cacheFingerprint: cacheEntry?.contentFingerprint ?? null,
      cacheStatus: cacheEntry?.status ?? null,
      serverPreviewCount: serverPreviewsByUrl.size,
      withDataCount: previews.filter((p) => p.previewData != null).length,
      markdownBodyLen: markdownBody.length,
      contentHead: markdownBody.slice(0, 80),
    };
    const snapshot = JSON.stringify(payload);
    if (prevTraceRef.current === snapshot) return;
    prevTraceRef.current = snapshot;
    traceLinkPreview("hook:state", payload);
  }, [
    message.id,
    previewUrls,
    previews,
    visiblePreviews.length,
    cacheMatches,
    contentFingerprint,
    cacheEntry?.contentFingerprint,
    cacheEntry?.status,
    serverPreviewsByUrl.size,
    markdownBody,
  ]);

  return { previews, visiblePreviews };
}
