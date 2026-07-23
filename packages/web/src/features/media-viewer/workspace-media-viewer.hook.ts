import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
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

type WorkspaceMediaLoadResult =
  | { file: WorkspaceMessageFileReference; resource: WorkspaceMediaViewerResource }
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
  const openGenerationRef = useRef(0);
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

  useEffect(() => {
    return () => {
      openGenerationRef.current += 1;
      lazyLoadRef.current = null;
      closeWorkspaceViewer();
    };
  }, [stableScope]);

  useEffect(() => {
    return useMediaViewerStore.subscribe((state, previousState) => {
      if (!state.isOpen && previousState.isOpen) {
        openGenerationRef.current += 1;
        lazyLoadRef.current = null;
        return;
      }
      if (
        state.isOpen &&
        (!previousState.isOpen || state.currentIndex !== previousState.currentIndex)
      ) {
        lazyLoadRef.current?.(state.currentIndex);
      }
    });
  }, []);

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

      const openGeneration = openGenerationRef.current + 1;
      openGenerationRef.current = openGeneration;
      lazyLoadRef.current = null;
      const requestScope = stableScope;
      const isCurrentOpen = (signal?: AbortSignal): boolean =>
        signal?.aborted !== true &&
        openGenerationRef.current === openGeneration &&
        isSameScope(scopeRef.current, requestScope);

      void runAction(async (signal) => {
        const initialLoads = mediaOpen.files.map((mediaFile, index) => {
          if (mediaFile.mediaKind === "video" && index !== mediaOpen.startIndex) {
            return undefined;
          }
          return loadResource(mediaFile, signal)
            .then((resource): WorkspaceMediaLoadResult => ({ file: mediaFile, resource }))
            .catch((error: unknown): WorkspaceMediaLoadResult => ({ file: mediaFile, error }));
        });
        const selectedResult = await initialLoads[mediaOpen.startIndex];
        if (selectedResult == null || "error" in selectedResult) {
          throw selectedResult?.error instanceof Error
            ? selectedResult.error
            : new Error("Unsupported Workspace media");
        }
        if (!isCurrentOpen(signal)) return;

        const pendingItems = mediaOpen.files.map((mediaFile) => buildViewerItem(mediaFile));
        const selectedObjectUrl = URL.createObjectURL(selectedResult.resource.blob);
        pendingItems[mediaOpen.startIndex] = buildViewerItem(
          selectedResult.file,
          selectedResult.resource,
          selectedObjectUrl,
        );
        if (!isCurrentOpen(signal)) {
          URL.revokeObjectURL(selectedObjectUrl);
          return;
        }
        useMediaViewerStore.getState().open(pendingItems, mediaOpen.startIndex);

        const loadingIndexes = new Set<number>();
        const isActiveSlot = (index: number, fileUuid: string): boolean => {
          const viewer = useMediaViewerStore.getState();
          return (
            isCurrentOpen(signal) &&
            viewer.isOpen &&
            viewer.items[index]?.workspaceFile?.fileUuid === fileUuid
          );
        };

        const replaceLoadedSlot = (
          index: number,
          mediaFile: WorkspaceMessageFileReference,
          resource: WorkspaceMediaViewerResource,
        ): void => {
          if (!isActiveSlot(index, mediaFile.fileUuid)) return;
          const objectUrl = URL.createObjectURL(resource.blob);
          if (!isActiveSlot(index, mediaFile.fileUuid)) {
            URL.revokeObjectURL(objectUrl);
            return;
          }
          useMediaViewerStore
            .getState()
            .replaceItem(index, buildViewerItem(mediaFile, resource, objectUrl));
        };

        const loadSlot = (index: number): void => {
          if (index === mediaOpen.startIndex || loadingIndexes.has(index)) return;
          const mediaFile = mediaOpen.files[index];
          if (mediaFile == null || !isActiveSlot(index, mediaFile.fileUuid)) return;
          if (useMediaViewerStore.getState().items[index]?.resourceState !== "loading") return;

          loadingIndexes.add(index);
          void runAction((loadSignal) => loadResource(mediaFile, loadSignal))
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
      }).catch((error: unknown) => {
        if (isCurrentOpen() && !(error instanceof DOMException && error.name === "AbortError")) {
          onLoadError(error);
        }
      });
    },
    [
      buildViewerItem,
      enabled,
      loadResource,
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
