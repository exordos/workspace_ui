import React from "react";
import {
  COMPOSER_RESIZE_SHELL_GAP_PX,
  COMPOSER_TEXTAREA_MAX_HEIGHT_PX,
  COMPOSER_TEXTAREA_MIN_HEIGHT_PX,
} from "./message-composer-constants.lib";
import {
  resolveComposerManualEditorMinHeight,
  shouldReleaseManualComposerResize,
} from "./message-composer-resize.lib";

interface UseMessageComposerResizeOptions {
  composerRef: React.RefObject<HTMLDivElement | null>;
  enabled: boolean;
  textareaContentHeight: number;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

interface ComposerResizeSession {
  maxHeight: number;
  minHeight: number;
  startEditorHeight: number;
  startHeight: number;
  startY: number;
}

function resolveComposerMaxHeight(composer: HTMLDivElement): number {
  const currentHeight = composer.getBoundingClientRect().height;
  const parent = composer.parentElement;
  if (parent == null) return currentHeight;

  const shrinkableMessageArea = findShrinkableMessageArea(parent);
  if (shrinkableMessageArea != null) {
    const availableHeight = shrinkableMessageArea.getBoundingClientRect().height;
    return currentHeight + Math.max(availableHeight - COMPOSER_RESIZE_SHELL_GAP_PX, 0);
  }

  return Math.max(
    currentHeight,
    parent.getBoundingClientRect().height - COMPOSER_RESIZE_SHELL_GAP_PX,
  );
}

function findShrinkableMessageArea(parent: HTMLElement): HTMLElement | null {
  return (
    Array.from(parent.children).find(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && child.dataset.messageAnchorLayerHost === "true",
    ) ?? null
  );
}

function clampComposerHeight(value: number, minHeight: number, maxHeight: number): number {
  return Math.min(Math.max(value, minHeight), maxHeight);
}

function resolveCurrentEditorHeight(
  textarea: HTMLTextAreaElement | null,
  textareaContentHeight: number,
): number {
  const measuredHeight = textarea?.getBoundingClientRect().height ?? 0;
  if (measuredHeight > 0) return measuredHeight;
  return Math.min(
    Math.max(textareaContentHeight, COMPOSER_TEXTAREA_MIN_HEIGHT_PX),
    COMPOSER_TEXTAREA_MAX_HEIGHT_PX,
  );
}

export function useMessageComposerResize({
  composerRef,
  enabled,
  textareaContentHeight,
  textareaRef,
}: UseMessageComposerResizeOptions) {
  const [height, setHeight] = React.useState<number | null>(null);
  const [isFullHeight, setIsFullHeight] = React.useState(false);
  const [manualEditorHeight, setManualEditorHeight] = React.useState<number | null>(null);
  const [manualResizeReleaseVersion, setManualResizeReleaseVersion] = React.useState(0);
  const resizeSessionRef = React.useRef<ComposerResizeSession | null>(null);
  const manualEditorMinHeight = resolveComposerManualEditorMinHeight(textareaContentHeight);
  const manualEditorFloorAdjustment =
    !isFullHeight && manualEditorHeight != null
      ? Math.max(manualEditorMinHeight - manualEditorHeight, 0)
      : 0;
  const resolvedHeight = height == null ? null : height + manualEditorFloorAdjustment;
  const resolvedManualEditorHeight =
    manualEditorHeight == null ? null : manualEditorHeight + manualEditorFloorAdjustment;

  const releaseManualResize = React.useCallback(() => {
    setHeight(null);
    setIsFullHeight(false);
    setManualEditorHeight(null);
    setManualResizeReleaseVersion((version) => version + 1);
  }, []);

  const commitManualHeight = React.useCallback(
    (nextHeight: number, nextEditorHeight: number, minHeight: number, maxHeight: number) => {
      const clampedHeight = clampComposerHeight(nextHeight, minHeight, maxHeight);
      const clampedEditorHeight = nextEditorHeight + clampedHeight - nextHeight;
      if (
        shouldReleaseManualComposerResize({
          textareaContentHeight,
          nextHeight: clampedHeight,
          minHeight,
          isFullHeight: clampedHeight >= maxHeight - 1,
        })
      ) {
        releaseManualResize();
        return;
      }
      setHeight(clampedHeight);
      setManualEditorHeight(clampedEditorHeight);
      setIsFullHeight(clampedHeight >= maxHeight - 1);
    },
    [releaseManualResize, textareaContentHeight],
  );

  const stopResize = React.useCallback(() => {
    resizeSessionRef.current = null;
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
  }, []);

  const resizeToPointer = React.useCallback(
    (clientY: number) => {
      const session = resizeSessionRef.current;
      if (session == null) return;

      commitManualHeight(
        session.startHeight + session.startY - clientY,
        session.startEditorHeight + session.startY - clientY,
        session.minHeight,
        session.maxHeight,
      );
    },
    [commitManualHeight],
  );

  React.useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      resizeToPointer(event.clientY);
    };
    const onPointerUp = () => {
      stopResize();
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      stopResize();
    };
  }, [resizeToPointer, stopResize]);

  React.useEffect(() => {
    const composer = composerRef.current;
    const parent = composer?.parentElement;
    if (composer == null || parent == null || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      if (resolvedHeight == null) return;
      const maxHeight = resolveComposerMaxHeight(composer);
      const nextHeight = isFullHeight ? maxHeight : Math.min(resolvedHeight, maxHeight);
      const heightDelta = nextHeight - resolvedHeight;
      setHeight(nextHeight);
      setManualEditorHeight(
        resolvedManualEditorHeight == null ? null : resolvedManualEditorHeight + heightDelta,
      );
    });
    observer.observe(parent);
    const shrinkableMessageArea = findShrinkableMessageArea(parent);
    if (shrinkableMessageArea != null) observer.observe(shrinkableMessageArea);
    return () => observer.disconnect();
  }, [composerRef, isFullHeight, resolvedHeight, resolvedManualEditorHeight]);

  const startResize = React.useCallback(
    (clientY: number) => {
      const composer = composerRef.current;
      if ((!enabled && resolvedHeight == null) || composer == null) return;

      const startHeight = resolvedHeight ?? composer.getBoundingClientRect().height;
      const startEditorHeight =
        resolvedManualEditorHeight ??
        resolveCurrentEditorHeight(textareaRef.current, textareaContentHeight);
      const maxHeight = resolveComposerMaxHeight(composer);
      resizeSessionRef.current = {
        startY: clientY,
        startHeight,
        startEditorHeight,
        minHeight: Math.min(startHeight - startEditorHeight + manualEditorMinHeight, maxHeight),
        maxHeight,
      };
      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";
    },
    [
      composerRef,
      enabled,
      manualEditorMinHeight,
      resolvedHeight,
      resolvedManualEditorHeight,
      textareaContentHeight,
      textareaRef,
    ],
  );

  const onResizeHandlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      startResize(event.clientY);
    },
    [startResize],
  );

  const resizeBy = React.useCallback(
    (delta: number) => {
      const composer = composerRef.current;
      if ((!enabled && resolvedHeight == null) || composer == null) return;

      const currentHeight = resolvedHeight ?? composer.getBoundingClientRect().height;
      const currentEditorHeight =
        resolvedManualEditorHeight ??
        resolveCurrentEditorHeight(textareaRef.current, textareaContentHeight);
      const maxHeight = resolveComposerMaxHeight(composer);
      const minHeight = Math.min(
        currentHeight - currentEditorHeight + manualEditorMinHeight,
        maxHeight,
      );
      commitManualHeight(currentHeight + delta, currentEditorHeight + delta, minHeight, maxHeight);
    },
    [
      commitManualHeight,
      composerRef,
      enabled,
      manualEditorMinHeight,
      resolvedHeight,
      resolvedManualEditorHeight,
      textareaContentHeight,
      textareaRef,
    ],
  );

  const onResizeHandleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        resizeBy(24);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        resizeBy(-24);
      }
    },
    [resizeBy],
  );

  const toggleFullHeight = React.useCallback(() => {
    const composer = composerRef.current;
    if ((!enabled && resolvedHeight == null) || composer == null) return;

    if (isFullHeight) {
      releaseManualResize();
      return;
    }

    const currentHeight = resolvedHeight ?? composer.getBoundingClientRect().height;
    const currentEditorHeight =
      resolvedManualEditorHeight ??
      resolveCurrentEditorHeight(textareaRef.current, textareaContentHeight);
    const maxHeight = resolveComposerMaxHeight(composer);
    setHeight(maxHeight);
    setManualEditorHeight(currentEditorHeight + maxHeight - currentHeight);
    setIsFullHeight(true);
  }, [
    composerRef,
    enabled,
    isFullHeight,
    releaseManualResize,
    resolvedHeight,
    resolvedManualEditorHeight,
    textareaContentHeight,
    textareaRef,
  ]);

  return {
    height: resolvedHeight,
    isFullHeight,
    manualEditorHeight: resolvedManualEditorHeight,
    manualResizeReleaseVersion,
    onResizeHandleKeyDown,
    onResizeHandlePointerDown,
    toggleFullHeight,
  };
}
