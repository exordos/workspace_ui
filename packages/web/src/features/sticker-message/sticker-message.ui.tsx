import React, { useEffect, useState } from "react";
import { stickerCatalogRepository } from "~/entities/sticker/sticker-catalog.api";
import { StickerMedia } from "~/entities/sticker/sticker-media.ui";
import { stickerRuntimeKey } from "~/entities/sticker/sticker-workspace.repository";
import { useStickerStore } from "~/entities/sticker/sticker.model";
import type { StickerCatalogRepository } from "~/entities/sticker/sticker.repository";
import type { Sticker, StickerReference } from "~/entities/sticker/sticker.types";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { t } from "~/i18n/i18n";

interface StickerMessageProps {
  reference: StickerReference;
  loadEnabled?: boolean;
  repository?: StickerCatalogRepository;
}

type StickerMessageState =
  | { referenceKey: string; status: "loading" }
  | { referenceKey: string; status: "ready"; sticker: Sticker }
  | { referenceKey: string; status: "unavailable" };

function referenceKey(reference: StickerReference): string {
  return reference.kind === "workspace"
    ? `workspace:${reference.stickerId}`
    : `${reference.provider}:${reference.externalId}`;
}

function StickerPlaceholder({
  status,
}: Readonly<{ status: "loading" | "unavailable" }>): React.ReactElement {
  const label = status === "loading" ? t("sticker.loading") : t("sticker.unavailable");

  return (
    <div
      className="flex h-40 w-40 flex-col items-center justify-center gap-2 rounded-xl bg-card-bg text-text-muted"
      data-sticker-status={status}
      role={status === "loading" ? "status" : "img"}
      aria-label={label}
    >
      <span className="text-4xl" aria-hidden>
        🎨
      </span>
      <span className="text-xs">{label}</span>
    </div>
  );
}

export function StickerMessage({
  reference,
  loadEnabled = true,
  repository = stickerCatalogRepository,
}: Readonly<StickerMessageProps>): React.ReactElement {
  const owner = useWorkspaceAuthStore(() => stickerRuntimeKey());
  const revision = useStickerStore((state) => state.revision);
  const currentReferenceKey = `${owner}:${revision}:${referenceKey(reference)}`;
  const [state, setState] = useState<StickerMessageState>({
    referenceKey: currentReferenceKey,
    status: "loading",
  });

  useEffect(() => {
    if (!loadEnabled) return;

    const controller = new AbortController();

    void repository
      .resolve(reference, controller.signal)
      .then((sticker) => {
        if (controller.signal.aborted) return;
        setState(
          sticker == null
            ? { referenceKey: currentReferenceKey, status: "unavailable" }
            : { referenceKey: currentReferenceKey, status: "ready", sticker },
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState({ referenceKey: currentReferenceKey, status: "unavailable" });
        }
      });

    return () => controller.abort();
  }, [currentReferenceKey, loadEnabled, reference, repository]);

  if (!loadEnabled) {
    return (
      <div data-sticker-message="true" data-sticker-load-enabled="false">
        <StickerPlaceholder status="unavailable" />
      </div>
    );
  }

  const effectiveState: StickerMessageState =
    state.referenceKey === currentReferenceKey
      ? state
      : { referenceKey: currentReferenceKey, status: "loading" };

  if (effectiveState.status !== "ready") {
    return (
      <div data-sticker-message="true" data-sticker-load-enabled="true">
        <StickerPlaceholder status={effectiveState.status} />
      </div>
    );
  }

  const { sticker } = effectiveState;
  const renderedWidth = Math.min(Math.max(sticker.media.width ?? 160, 1), 240);

  return (
    <div
      className="max-w-[240px]"
      data-sticker-message="true"
      data-sticker-id={sticker.id}
      data-sticker-status="ready"
    >
      <StickerMedia
        sticker={sticker}
        className="flex max-h-[240px] max-w-[240px] rounded-xl object-contain"
        style={{ aspectRatio: sticker.media.aspectRatio, width: renderedWidth, maxHeight: 240 }}
      />
    </div>
  );
}
