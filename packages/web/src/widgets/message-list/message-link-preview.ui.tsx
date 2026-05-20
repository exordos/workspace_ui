import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { t } from "~/i18n/i18n";
import { getRealmBaseUrl } from "~/shared/api/zulip-client.internal";
import { guard } from "~/shared/lib/guards";
import { traceLinkPreview } from "~/shared/lib/message-link-preview-trace.lib";
import { prepareProtectedMessageHtml } from "~/shared/lib/protected-message-media";
import { useProtectedMessageHtml } from "~/shared/lib/protected-message-media.hook";
import type { MessageLinkPreviewProps } from "./message-link-preview.types";

function buildThumbnailHtml(thumbnailPath: string, targetUrl: string): string {
  const escapedPath = thumbnailPath.replace(/"/g, "&quot;");
  const escapedUrl = targetUrl.replace(/"/g, "&quot;");
  // Fills the sized wrapper; `.message_embed_image` CSS only applies under `.message-body`.
  return `<a class="message_embed_image block size-full rounded-lg bg-cover bg-center bg-no-repeat" href="${escapedUrl}" rel="noopener noreferrer" style="background-image:url(&quot;${escapedPath}&quot;)"></a>`;
}

function formatPreviewHostname(targetUrl: string): string {
  try {
    return new URL(targetUrl).hostname.replace(/^www\./i, "");
  } catch {
    return targetUrl;
  }
}

export const MessageLinkPreview = React.memo<MessageLinkPreviewProps>(function MessageLinkPreview({
  previewUrl,
  previewData,
  status,
  stacked = false,
}) {
  const rootClass = stacked ? "" : "mt-2";
  const thumbnailRef = useRef<HTMLDivElement>(null);
  const imagesBase = getRealmBaseUrl() || undefined;

  const thumbnailHtml = useMemo(() => {
    const path = previewData?.thumbnailPath;
    if (path == null || path.length === 0) return "";
    return prepareProtectedMessageHtml(buildThumbnailHtml(path, previewUrl), imagesBase);
  }, [previewData?.thumbnailPath, previewUrl, imagesBase]);

  useProtectedMessageHtml(thumbnailRef, thumbnailHtml, {
    deferRootSelector: '[role="feed"]',
  });

  const handleOpen = useCallback(() => {
    guard.url(previewUrl, "message link preview");
    window.open(previewUrl, "_blank", "noopener,noreferrer");
  }, [previewUrl]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      handleOpen();
    },
    [handleOpen],
  );

  const prevUiTraceRef = useRef<string | null>(null);
  useEffect(() => {
    const hideReason =
      status === "unavailable"
        ? "unavailable"
        : status !== "loading" && previewData == null
          ? "no-data-non-loading"
          : null;
    const snapshot = JSON.stringify({
      status,
      hideReason,
      hasPreviewData: previewData != null,
      title: previewData?.title,
      previewUrl,
    });
    if (prevUiTraceRef.current === snapshot) return;
    prevUiTraceRef.current = snapshot;
    if (hideReason != null) {
      traceLinkPreview("ui:hide", { previewUrl, status, reason: hideReason });
    } else if (status === "loading") {
      traceLinkPreview("ui:show-loading", { previewUrl });
    } else {
      traceLinkPreview("ui:show-card", {
        previewUrl,
        status,
        title: previewData?.title,
      });
    }
  }, [status, previewData, previewUrl]);

  if (status === "unavailable" || (status !== "loading" && previewData == null)) {
    return null;
  }

  if (status === "loading") {
    return (
      <div
        className={`${rootClass} bg-card-bg/80 flex w-full min-w-0 gap-3 rounded-lg border border-border-subtle p-2.5`}
        role="status"
        aria-label={t("message.linkPreviewLoading")}
      >
        <div className="bg-border-subtle/60 h-[84px] w-28 shrink-0 animate-pulse rounded-lg" />
        <div className="min-w-0 flex-1 space-y-2 py-1">
          <div className="bg-border-subtle/60 h-4 w-3/4 animate-pulse rounded" />
          <div className="bg-border-subtle/50 h-3 w-full animate-pulse rounded" />
        </div>
      </div>
    );
  }

  const title = previewData?.title?.trim() || formatPreviewHostname(previewUrl);
  const description = previewData?.description?.trim();
  const hostname = formatPreviewHostname(previewUrl);
  const hasThumbnail = (previewData?.thumbnailPath?.length ?? 0) > 0;

  return (
    <div
      className={`${rootClass} bg-card-bg/80 flex w-full min-w-0 cursor-pointer gap-3 rounded-lg border border-border-subtle p-2.5 transition-colors hover:bg-card-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft`}
      role="link"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
      aria-label={title}
    >
      {hasThumbnail ? (
        <div
          ref={thumbnailRef}
          className="message-link-preview-thumbnail bg-border-subtle/50 h-[84px] w-28 shrink-0 overflow-hidden rounded-lg"
          aria-hidden
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-sm font-semibold text-text-primary">{title}</div>
        {description != null && description.length > 0 ? (
          <p className="mt-1 line-clamp-2 text-xs text-text-secondary">{description}</p>
        ) : null}
        <p className="mt-1 truncate text-xs text-text-muted">{hostname}</p>
      </div>
    </div>
  );
});
