import React from "react";
import {
  COMPOSER_RESIZE_SHELL_GAP_PX,
  COMPOSER_TEXTAREA_MAX_HEIGHT_PX,
  COMPOSER_TEXTAREA_MIN_HEIGHT_PX,
} from "./message-composer-constants.lib";

interface UseMessageComposerResizeOptions {
  composerRef: React.RefObject<HTMLDivElement | null>;
  enabled: boolean;
  textareaContentHeight: number;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

interface ComposerResizeSession {
  maxHeight: number;
  minHeight: number;
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

function measureComposerNaturalHeight(
  composer: HTMLDivElement,
  textarea: HTMLTextAreaElement | null,
  textareaContentHeight: number,
): number {
  const previousComposerHeight = composer.style.height;
  const previousTextareaHeight = textarea?.style.height;

  composer.style.height = "auto";
  if (textarea != null) {
    textarea.style.height = `${clampComposerHeight(
      textareaContentHeight,
      COMPOSER_TEXTAREA_MIN_HEIGHT_PX,
      COMPOSER_TEXTAREA_MAX_HEIGHT_PX,
    )}px`;
  }

  const naturalHeight = composer.getBoundingClientRect().height;
  composer.style.height = previousComposerHeight;
  if (textarea != null && previousTextareaHeight != null) {
    textarea.style.height = previousTextareaHeight;
  }
  return naturalHeight;
}

export function useMessageComposerResize({
  composerRef,
  enabled,
  textareaContentHeight,
  textareaRef,
}: UseMessageComposerResizeOptions) {
  const [height, setHeight] = React.useState<number | null>(null);
  const [isFullHeight, setIsFullHeight] = React.useState(false);
  const naturalHeightRef = React.useRef(0);
  const resizeSessionRef = React.useRef<ComposerResizeSession | null>(null);

  React.useLayoutEffect(() => {
    const composer = composerRef.current;
    if (composer == null) return;
    naturalHeightRef.current = measureComposerNaturalHeight(
      composer,
      textareaRef.current,
      textareaContentHeight,
    );
  });

  const stopResize = React.useCallback(() => {
    resizeSessionRef.current = null;
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
  }, []);

  const resizeToPointer = React.useCallback((clientY: number) => {
    const session = resizeSessionRef.current;
    if (session == null) return;

    const nextHeight = clampComposerHeight(
      session.startHeight + session.startY - clientY,
      session.minHeight,
      session.maxHeight,
    );
    setHeight(nextHeight);
    setIsFullHeight(nextHeight >= session.maxHeight - 1);
  }, []);

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
      if (height == null) return;
      const maxHeight = resolveComposerMaxHeight(composer);
      setHeight((currentHeight) => {
        if (currentHeight == null) return null;
        return isFullHeight ? maxHeight : Math.min(currentHeight, maxHeight);
      });
    });
    observer.observe(parent);
    const shrinkableMessageArea = findShrinkableMessageArea(parent);
    if (shrinkableMessageArea != null) observer.observe(shrinkableMessageArea);
    return () => observer.disconnect();
  }, [composerRef, height, isFullHeight]);

  const startResize = React.useCallback(
    (clientY: number) => {
      const composer = composerRef.current;
      if ((!enabled && height == null) || composer == null) return;

      const startHeight = composer.getBoundingClientRect().height;
      const maxHeight = resolveComposerMaxHeight(composer);
      resizeSessionRef.current = {
        startY: clientY,
        startHeight,
        minHeight: Math.min(naturalHeightRef.current || startHeight, maxHeight),
        maxHeight,
      };
      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";
    },
    [composerRef, enabled, height],
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
      if ((!enabled && height == null) || composer == null) return;

      const currentHeight = composer.getBoundingClientRect().height;
      const maxHeight = resolveComposerMaxHeight(composer);
      const minHeight = Math.min(naturalHeightRef.current || currentHeight, maxHeight);
      const nextHeight = clampComposerHeight(currentHeight + delta, minHeight, maxHeight);
      setHeight(nextHeight);
      setIsFullHeight(nextHeight >= maxHeight - 1);
    },
    [composerRef, enabled, height],
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
    if ((!enabled && height == null) || composer == null) return;

    if (isFullHeight) {
      setHeight(null);
      setIsFullHeight(false);
      return;
    }

    setHeight(resolveComposerMaxHeight(composer));
    setIsFullHeight(true);
  }, [composerRef, enabled, height, isFullHeight]);

  return {
    height,
    isFullHeight,
    onResizeHandleKeyDown,
    onResizeHandlePointerDown,
    toggleFullHeight,
  };
}
