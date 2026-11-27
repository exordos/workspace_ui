import { useCallback, useEffect, useRef } from "react";
import type { MessageComposerAttachmentView } from "~/applications/messenger/features/composer/message-composer.types";
import { useMediaViewerStore } from "~/features/media-viewer/media-viewer.model";
import type { MediaItem } from "~/features/media-viewer/media-viewer.types";
import { resolveAttachmentMediaKind } from "~/shared/lib/attachment-card-meta.lib";

// Connects the composer-owned local media URLs to the existing viewer for one session.
export function useComposerMediaViewer() {
  const session = useRef<{ token: object; urls: Map<string, string> } | null>(null);
  const close = useCallback(() => {
    const active = session.current;
    session.current = null;
    if (useMediaViewerStore.getState().ownerToken === active?.token) {
      useMediaViewerStore.getState().close();
    }
  }, []);
  useEffect(() => close, [close]);

  const sync = useCallback(
    (attachments: readonly MessageComposerAttachmentView[]) => {
      const active = session.current;
      if (!active) return;
      const current = new Map(
        attachments.map((attachment) => [
          attachment.localId,
          attachment.mediaUrl === undefined ? attachment.previewUrl : attachment.mediaUrl,
        ]),
      );
      if ([...active.urls].some(([id, url]) => current.get(id) !== url)) close();
    },
    [close],
  );

  const open = useCallback(
    (localId: string, attachments: readonly MessageComposerAttachmentView[]) => {
      const media = attachments.flatMap((attachment) => {
        const url = attachment.mediaUrl === undefined ? attachment.previewUrl : attachment.mediaUrl;
        const type = resolveAttachmentMediaKind(attachment.fileName, attachment.contentType);
        return url && type ? [{ attachment, url, type }] : [];
      });
      const index = media.findIndex(({ attachment }) => attachment.localId === localId);
      if (index < 0) return;
      const items: MediaItem[] = media.map(({ attachment, url, type }) => ({
        url,
        type,
        alt: attachment.fileName,
        downloadFileName: attachment.fileName,
      }));
      close();
      const token = {};
      session.current = {
        token,
        urls: new Map(media.map(({ attachment, url }) => [attachment.localId, url])),
      };
      useMediaViewerStore.getState().open(items, index, token);
    },
    [close],
  );
  return { open, sync };
}
