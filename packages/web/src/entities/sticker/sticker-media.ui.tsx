import React, { useEffect, useRef, useState } from "react";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { t } from "~/i18n/i18n";
import { downloadSticker } from "~/shared/api/messenger-stickers.api";
import { createLogger } from "~/shared/lib/logger";
import { createDisplayableBlobUrl } from "~/shared/lib/media-display-url.lib";
import { stickerRequestOptions, stickerRuntimeKey } from "./sticker-workspace.repository";
import { useStickerStore } from "./sticker.model";
import type { Sticker } from "./sticker.types";

const mediaLog = createLogger("sticker-media");

export function StickerMedia({
  sticker,
  className,
  style,
  retryEnabled = false,
}: Readonly<{
  sticker: Sticker;
  retryEnabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}>) {
  const ownerKey = useWorkspaceAuthStore(() => stickerRuntimeKey());
  const revision = useStickerStore((state) => state.revision);
  const [attempt, setAttempt] = useState(0);
  const key = `${ownerKey}:${revision}:${sticker.id}:${sticker.url}:${sticker.format}:${attempt}`;
  const [state, setState] = useState<{
    key: string;
    url?: string;
    error?: boolean;
    loaded?: boolean;
  }>({ key });
  const container = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    const urls: string[] = [];
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      void (async () => {
        try {
          const blob = await downloadSticker(stickerRequestOptions(controller.signal), {
            id: sticker.id,
            media: { url: sticker.url, format: sticker.format },
          });
          if (controller.signal.aborted || ownerKey !== stickerRuntimeKey()) return;
          const url = await createDisplayableBlobUrl(blob, urls);
          if (controller.signal.aborted || ownerKey !== stickerRuntimeKey()) {
            for (const objectUrl of urls) URL.revokeObjectURL(objectUrl);
            return;
          }
          setState({ key, url });
        } catch {
          if (!controller.signal.aborted && ownerKey === stickerRuntimeKey()) {
            mediaLog.warn("Sticker download failed");
            setState({ key, error: true });
          }
        }
      })();
    };
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) {
                start();
                observer?.disconnect();
              }
            },
            { rootMargin: "160px" },
          );
    if (observer && container.current) observer.observe(container.current);
    else start();
    return () => {
      controller.abort();
      observer?.disconnect();
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [key, ownerKey, sticker.id, sticker.url, sticker.format]);
  const url = state.key === key ? state.url : undefined;
  const error = state.key === key && state.error;
  let status = "loading";
  let content = <span role="status">{t("sticker.loading")}</span>;
  if (error) {
    status = "unavailable";
    content = (
      <span
        className={`flex w-full flex-col items-center justify-center gap-2 text-center text-sm text-text-muted ${retryEnabled ? "min-h-40 pb-8" : ""}`}
      >
        <span role="img" aria-label={t("sticker.unavailable")}>
          {t("sticker.unavailable")}
        </span>
        {retryEnabled && (
          <button
            type="button"
            className="rounded px-2 py-1 text-accent hover:bg-card-bg-active"
            onClick={() => setAttempt((value) => value + 1)}
          >
            {t("sticker.retryLoad")}
          </button>
        )}
      </span>
    );
  } else if (url) {
    status = state.key === key && state.loaded ? "ready" : "loading";
    content = (
      <img
        src={url}
        alt={sticker.alt}
        width={sticker.media.width}
        height={sticker.media.height}
        className="max-h-full max-w-full object-contain"
        style={{ maxHeight: style?.maxHeight }}
        loading="lazy"
        draggable={false}
        onLoad={() => setState({ key, url, loaded: true })}
        onError={() => {
          mediaLog.warn("Sticker image decoding failed");
          setState({ key, error: true });
        }}
      />
    );
  }
  return (
    <span ref={container} className={className} style={style} data-sticker-media-status={status}>
      {content}
    </span>
  );
}
