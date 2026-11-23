import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  buildWorkspaceMediaDisplayBlob,
  isWorkspaceHeicMedia,
} from "~/applications/messenger/features/timeline/messenger-workspace-message-preview-blob.lib";
import type { WorkspaceMessageFileReference } from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import { useMediaViewerStore } from "./media-viewer.model";
import {
  buildWorkspaceMediaViewerItem,
  type WorkspaceMediaDownloadHandler,
} from "./workspace-media-viewer-item.lib";
import type { MediaItem } from "./media-viewer.types";

export interface WorkspaceMediaViewerResource {
  blob: Blob;
  headers: Headers;
}

export interface WorkspaceMediaViewerScope {
  ownerKey: string | null;
  runtimeGeneration: number | null;
  conversationId: string | null;
}

export interface WorkspaceMediaGalleryOpenRequest {
  items: readonly { file: WorkspaceMessageFileReference }[];
  startIndex: number;
}

type RunWorkspaceAction = <T>(action: (signal: AbortSignal) => Promise<T>) => Promise<T>;

interface UseWorkspaceMediaViewerInput {
  scope: WorkspaceMediaViewerScope;
  enabled: boolean;
  loadResource: (
    file: WorkspaceMessageFileReference,
    signal: AbortSignal,
  ) => Promise<WorkspaceMediaViewerResource>;
  runAction: RunWorkspaceAction;
  onDownload: WorkspaceMediaDownloadHandler;
  deriveDownloadFileName: (input: {
    fileUuid: string;
    fileNameHint?: string | null;
    contentDisposition?: string | null;
  }) => string;
  onOpenStart: () => void;
  onRuntimeUnavailable: () => void;
  onUnsupported: () => void;
  onLoadError: (error: unknown) => void;
}

interface WorkspaceMediaDisplayResource {
  original: WorkspaceMediaViewerResource;
  displayBlob: Blob | null;
}

type WorkspaceMediaLoadResult =
  | { file: WorkspaceMessageFileReference; resource: WorkspaceMediaDisplayResource }
  | { file: WorkspaceMessageFileReference; error: unknown };

function isSupportedMedia(file: WorkspaceMessageFileReference): boolean {
  return (
    file.kind === "media" &&
    (file.mediaKind === "image" || file.mediaKind === "video") &&
    file.fileUuid.trim().length > 0
  );
}

function resolveMediaOpen(
  file: WorkspaceMessageFileReference,
  gallery: WorkspaceMediaGalleryOpenRequest | undefined,
): { files: readonly WorkspaceMessageFileReference[]; startIndex: number } | null {
  const files = (gallery?.items.map((item) => item.file) ?? [file]).filter(isSupportedMedia);
  if (files.length === 0) return null;

  const clickedFileUuid = file.fileUuid.trim();
  const clickedIndex = files.findIndex(
    (candidate) => candidate.fileUuid.trim() === clickedFileUuid,
  );
  if (clickedIndex >= 0) return { files, startIndex: clickedIndex };

  const fallbackIndex =
    gallery == null ? 0 : Math.max(0, Math.min(gallery.startIndex, files.length - 1));
  return { files, startIndex: fallbackIndex };
}

function isSameScope(
  current: WorkspaceMediaViewerScope,
  expected: WorkspaceMediaViewerScope,
): boolean {
  return (
    current.ownerKey === expected.ownerKey &&
    current.runtimeGeneration === expected.runtimeGeneration &&
    current.conversationId === expected.conversationId
  );
}

function closeWorkspaceViewer(): void {
  const viewer = useMediaViewerStore.getState();
  if (viewer.items.some((item) => item.workspaceFile != null)) {
    viewer.close();
  }
}

export function useWorkspaceMediaViewer({
  scope,
  enabled,
  loadResource,
  runAction,
  onDownload,
  deriveDownloadFileName,
  onOpenStart,
  onRuntimeUnavailable,
  onUnsupported,
  onLoadError,
}: UseWorkspaceMediaViewerInput): {
  openWorkspaceMedia: (
    file: WorkspaceMessageFileReference,
    gallery?: WorkspaceMediaGalleryOpenRequest,
  ) => void;
} {
  const galleryControllerRef = useRef<AbortController | null>(null);
  const lazyLoadRef = useRef<((index: number) => void) | null>(null);
  const scopeRef = useRef(scope);
  const stableScope = useMemo<WorkspaceMediaViewerScope>(
    () => ({
      ownerKey: scope.ownerKey,
      runtimeGeneration: scope.runtimeGeneration,
      conversationId: scope.conversationId,
    }),
    [scope.conversationId, scope.ownerKey, scope.runtimeGeneration],
  );

  useLayoutEffect(() => {
    scopeRef.current = stableScope;
  }, [stableScope]);

  const cancelGalleryLoads = useCallback(() => {
    const controller = galleryControllerRef.current;
    galleryControllerRef.current = null;
    lazyLoadRef.current = null;
    controller?.abort();
  }, []);

  useEffect(() => {
    return () => {
      cancelGalleryLoads();
      closeWorkspaceViewer();
    };
  }, [cancelGalleryLoads, stableScope]);

  useEffect(() => {
    return useMediaViewerStore.subscribe((state, previousState) => {
      if (!state.isOpen && previousState.isOpen) {
        cancelGalleryLoads();
        return;
      }
      if (
        state.isOpen &&
        (!previousState.isOpen || state.currentIndex !== previousState.currentIndex)
      ) {
        lazyLoadRef.current?.(state.currentIndex);
      }
    });
  }, [cancelGalleryLoads]);

  const buildViewerItem = useCallback(
    (
      mediaFile: WorkspaceMessageFileReference,
      resource?: WorkspaceMediaViewerResource,
      objectUrl?: string,
      resourceState?: MediaItem["resourceState"],
    ): MediaItem => {
      const downloadFileName = deriveDownloadFileName({
        fileUuid: mediaFile.fileUuid,
        fileNameHint: mediaFile.name,
        contentDisposition: resource?.headers.get("content-disposition"),
      });
      const item = buildWorkspaceMediaViewerItem({
        file: mediaFile,
        downloadFileName,
        blob: resource?.blob,
        objectUrl,
        resourceState,
        onDownload,
      });
      if (item == null) {
        throw new Error("Workspace viewer item requires a supported media reference");
      }
      return item;
    },
    [deriveDownloadFileName, onDownload],
  );

  const loadDisplayResource = useCallback(
    async (
      file: WorkspaceMessageFileReference,
      signal: AbortSignal,
    ): Promise<WorkspaceMediaDisplayResource> => {
      const original = await loadResource(file, signal);
      try {
        const displayBlob = await buildWorkspaceMediaDisplayBlob(original.blob, file, signal);
        return { original, displayBlob };
      } catch {
        signal.throwIfAborted();
        return { original, displayBlob: null };
      }
    },
    [loadResource],
  );

  const buildLoadedViewerItem = useCallback(
    (file: WorkspaceMessageFileReference, resource: WorkspaceMediaDisplayResource): MediaItem =>
      resource.displayBlob == null
        ? buildViewerItem(file, resource.original, undefined, "display-error")
        : buildViewerItem(file, resource.original, URL.createObjectURL(resource.displayBlob)),
    [buildViewerItem],
  );

  const openWorkspaceMedia = useCallback(
    (file: WorkspaceMessageFileReference, gallery?: WorkspaceMediaGalleryOpenRequest): void => {
      onOpenStart();
      if (!enabled) {
        onRuntimeUnavailable();
        return;
      }

      const mediaOpen = resolveMediaOpen(file, gallery);
      if (mediaOpen == null) {
        onUnsupported();
        return;
      }

      cancelGalleryLoads();
      const galleryController = new AbortController();
      galleryControllerRef.current = galleryController;
      const { signal } = galleryController;
      const isCurrentOpen = (): boolean =>
        !signal.aborted && isSameScope(scopeRef.current, stableScope);
      const loadForGallery = (mediaFile: WorkspaceMessageFileReference) =>
        runAction(async (chatSignal) => {
          chatSignal.throwIfAborted();
          signal.throwIfAborted();
          // Every load belongs to this gallery and to the same chat scope.
          const abortGallery = () => galleryController.abort(chatSignal.reason);
          chatSignal.addEventListener("abort", abortGallery, { once: true });
          try {
            return await loadDisplayResource(mediaFile, signal);
          } finally {
            chatSignal.removeEventListener("abort", abortGallery);
          }
        });

      const openGallery = async () => {
        const initialLoads = mediaOpen.files.map((mediaFile, index) => {
          if (
            index !== mediaOpen.startIndex &&
            (mediaFile.mediaKind === "video" || isWorkspaceHeicMedia(mediaFile))
          ) {
            return undefined;
          }
          return loadForGallery(mediaFile)
            .then((resource): WorkspaceMediaLoadResult => ({ file: mediaFile, resource }))
            .catch((error: unknown): WorkspaceMediaLoadResult => ({ file: mediaFile, error }));
        });
        const selectedResult = await initialLoads[mediaOpen.startIndex];
        if (selectedResult == null || "error" in selectedResult) {
          throw selectedResult?.error instanceof Error
            ? selectedResult.error
            : new Error("Unsupported Workspace media");
        }
        if (!isCurrentOpen()) return;

        const pendingItems = mediaOpen.files.map((mediaFile) => buildViewerItem(mediaFile));
        pendingItems[mediaOpen.startIndex] = buildLoadedViewerItem(
          selectedResult.file,
          selectedResult.resource,
        );
        useMediaViewerStore.getState().open(pendingItems, mediaOpen.startIndex);

        const loadingIndexes = new Set<number>();
        const isActiveSlot = (index: number, fileUuid: string): boolean => {
          const viewer = useMediaViewerStore.getState();
          return (
            isCurrentOpen() &&
            viewer.isOpen &&
            viewer.items[index]?.workspaceFile?.fileUuid === fileUuid
          );
        };

        const replaceLoadedSlot = (
          index: number,
          mediaFile: WorkspaceMessageFileReference,
          resource: WorkspaceMediaDisplayResource,
        ): void => {
          if (!isActiveSlot(index, mediaFile.fileUuid)) return;
          useMediaViewerStore
            .getState()
            .replaceItem(index, buildLoadedViewerItem(mediaFile, resource));
        };

        const loadSlot = (index: number): void => {
          if (index === mediaOpen.startIndex || loadingIndexes.has(index)) return;
          const mediaFile = mediaOpen.files[index];
          if (mediaFile == null || !isActiveSlot(index, mediaFile.fileUuid)) return;
          if (useMediaViewerStore.getState().items[index]?.resourceState !== "loading") return;

          loadingIndexes.add(index);
          void loadForGallery(mediaFile)
            .then((resource) => replaceLoadedSlot(index, mediaFile, resource))
            .catch((error: unknown) => {
              if (
                !isActiveSlot(index, mediaFile.fileUuid) ||
                (error instanceof DOMException && error.name === "AbortError")
              ) {
                return;
              }
              useMediaViewerStore
                .getState()
                .replaceItem(index, buildViewerItem(mediaFile, undefined, undefined, "load-error"));
            })
            .finally(() => {
              loadingIndexes.delete(index);
            });
        };

        lazyLoadRef.current = (index) => {
          if (isCurrentOpen()) loadSlot(index);
        };

        initialLoads.forEach((load, index) => {
          if (index === mediaOpen.startIndex || load == null) return;
          loadingIndexes.add(index);
          void load
            .then((result) => {
              if (!("error" in result)) {
                replaceLoadedSlot(index, result.file, result.resource);
                return;
              }
              if (!isActiveSlot(index, result.file.fileUuid)) return;
              useMediaViewerStore
                .getState()
                .replaceItem(
                  index,
                  buildViewerItem(result.file, undefined, undefined, "load-error"),
                );
            })
            .finally(() => {
              loadingIndexes.delete(index);
            });
        });
      };

      void openGallery().catch((error: unknown) => {
        if (isCurrentOpen() && !(error instanceof DOMException && error.name === "AbortError")) {
          cancelGalleryLoads();
          onLoadError(error);
        }
      });
    },
    [
      buildLoadedViewerItem,
      buildViewerItem,
      cancelGalleryLoads,
      enabled,
      loadDisplayResource,
      onLoadError,
      onOpenStart,
      onRuntimeUnavailable,
      onUnsupported,
      runAction,
      stableScope,
    ],
  );

  return { openWorkspaceMedia };
}
