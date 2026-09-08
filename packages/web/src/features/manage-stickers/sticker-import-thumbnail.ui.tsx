import { useEffect, useState } from "react";
import { stickerCatalogRepository } from "~/entities/sticker/sticker-catalog.api";
import { StickerMedia } from "~/entities/sticker/sticker-media.ui";
import { stickerRuntimeKey } from "~/entities/sticker/sticker-workspace.repository";
import { useStickerStore } from "~/entities/sticker/sticker.model";
import type { Sticker } from "~/entities/sticker/sticker.types";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { t } from "~/i18n/i18n";

export function StickerImportThumbnail({ stickerId }: Readonly<{ stickerId: string }>) {
  const owner = useWorkspaceAuthStore(() => stickerRuntimeKey());
  const revision = useStickerStore((state) => state.revision);
  const key = `${owner}:${revision}:${stickerId}`;
  const [result, setResult] = useState<{ key: string; sticker: Sticker | null } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void stickerCatalogRepository
      .resolve({ kind: "workspace", stickerId }, controller.signal)
      .then((sticker) => {
        if (!controller.signal.aborted && owner === stickerRuntimeKey()) {
          setResult({ key, sticker });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted && owner === stickerRuntimeKey()) {
          setResult({ key, sticker: null });
        }
      });
    return () => controller.abort();
  }, [key, owner, stickerId]);

  const current = result?.key === key ? result : null;
  const label = current ? t("sticker.unavailable") : t("sticker.loading");
  return (
    <span
      data-sticker-import-thumbnail
      className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-card-bg text-center text-[9px] leading-tight text-text-muted"
    >
      {current?.sticker ? (
        <StickerMedia
          sticker={current.sticker}
          className="flex h-full w-full items-center justify-center [&_span]:text-[9px] [&_span]:leading-tight"
          style={{ maxHeight: 48 }}
        />
      ) : (
        <span role={current ? "img" : "status"} aria-label={label} title={label}>
          <span aria-hidden>{current ? "—" : "…"}</span>
        </span>
      )}
    </span>
  );
}
