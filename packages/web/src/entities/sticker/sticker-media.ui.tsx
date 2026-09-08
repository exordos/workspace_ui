import React, { useEffect, useRef, useState } from "react";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { t } from "~/i18n/i18n";
import { downloadSticker } from "~/shared/api/messenger-stickers.api";
import { createDisplayableBlobUrl } from "~/shared/lib/media-display-url.lib";
import { stickerRequestOptions, stickerRuntimeKey } from "./sticker-workspace.repository";
import { useStickerStore } from "./sticker.model";
import type { Sticker } from "./sticker.types";

export function StickerMedia({
  sticker,
  className,
  style,
}: Readonly<{
  sticker: Sticker;
  className?: string;
  style?: React.CSSProperties;
}>) {
  const ownerKey = useWorkspaceAuthStore(() => stickerRuntimeKey());
  const revision = useStickerStore((state) => state.revision);
  const key = `${ownerKey}:${revision}:${sticker.id}:${sticker.url}`;
  const [state, setState] = useState<{ key: string; url?: string; error?: boolean }>({ key });
  const container = useRef<HTMLSpanElement>(null);
  const workspace = sticker.reference.kind === "workspace" && sticker.source == null;
  useEffect(() => {
    if (!workspace) return;
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
          if (!controller.signal.aborted) setState({ key, error: true });
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
  }, [key, ownerKey, sticker.id, sticker.url, sticker.format, workspace]);
  const currentUrl = state.key === key ? state.url : undefined;
  const url = workspace ? currentUrl : sticker.url;
  const error = state.key === key && state.error;
  let status = "loading";
  let content = <span role="status">{t("sticker.loading")}</span>;
  if (error) {
    status = "unavailable";
    content = (
      <span role="img" aria-label={t("sticker.unavailable")}>
        {t("sticker.unavailable")}
      </span>
    );
  } else if (url) {
    status = "ready";
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
        onError={() => setState({ key, error: true })}
      />
    );
  }
  return (
    <span ref={container} className={className} style={style} data-sticker-media-status={status}>
      {content}
    </span>
  );
}
