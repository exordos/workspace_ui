import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";

interface ViewTransform {
  scale: number; // Scale relative to the fitted image.
  x: number; // Horizontal displacement in screen pixels.
  y: number; // Vertical displacement in screen pixels.
}

const INITIAL: ViewTransform = { scale: 1, x: 0, y: 0 };
const MIN_SCALE = 1;
const MAX_SCALE = 5;
const KEYBOARD_PAN_STEP = 48;

// Allows every image edge to reach the center without losing the image entirely.
function constrain(
  view: ViewTransform,
  viewport: HTMLElement,
  image: HTMLImageElement,
  current: ViewTransform,
): ViewTransform {
  const bounds = viewport.getBoundingClientRect();
  const imageBounds = image.getBoundingClientRect();
  const centerX = imageBounds.left + imageBounds.width / 2 - current.x;
  const centerY = imageBounds.top + imageBounds.height / 2 - current.y;
  const halfWidth = (image.offsetWidth * view.scale) / 2;
  const halfHeight = (image.offsetHeight * view.scale) / 2;
  if (view.scale <= MIN_SCALE) return { ...view, x: 0, y: 0 };
  const viewportCenterX = (bounds.left + bounds.right) / 2;
  const viewportCenterY = (bounds.top + bounds.bottom) / 2;
  const offsetX = viewportCenterX - centerX;
  const offsetY = viewportCenterY - centerY;
  return {
    ...view,
    x: Math.max(offsetX - halfWidth, Math.min(offsetX + halfWidth, view.x)),
    y: Math.max(offsetY - halfHeight, Math.min(offsetY + halfHeight, view.y)),
  };
}

// Owns the temporary image transform and pointer gestures for the current viewer item.
export function useMediaViewerZoom(options: {
  currentIndex: number;
  isOpen: boolean;
  enabled: boolean;
}) {
  const { currentIndex, isOpen, enabled } = options;
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const viewRef = useRef<ViewTransform>(INITIAL);
  const [view, setView] = useState<ViewTransform>(INITIAL);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);

  const update = useCallback((next: ViewTransform) => {
    const viewport = viewportRef.current;
    const image = imageRef.current;
    const bounded = viewport && image ? constrain(next, viewport, image, viewRef.current) : next;
    if (
      bounded.scale === viewRef.current.scale &&
      bounded.x === viewRef.current.x &&
      bounded.y === viewRef.current.y
    )
      return;
    viewRef.current = bounded;
    setView(bounded);
  }, []);

  const reset = useCallback(() => {
    pointers.current.clear();
    pinch.current = null;
    viewRef.current = INITIAL;
    setView(INITIAL);
  }, []);

  useEffect(() => reset(), [currentIndex, isOpen, reset]);

  // Keep the image reachable when the viewer or the fitted image changes size.
  useEffect(() => {
    const viewport = viewportRef.current;
    const image = imageRef.current;
    if (!isOpen || !enabled || !viewport || !image) return;
    const recheck = () => update(viewRef.current);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(recheck);
    observer?.observe(viewport);
    observer?.observe(image);
    window.addEventListener("resize", recheck);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", recheck);
    };
  }, [enabled, isOpen, currentIndex, update]);

  // Zoom around a screen point, preserving the detail under the cursor or pinch center.
  const zoomAt = useCallback(
    (scale: number, x?: number, y?: number) => {
      const image = imageRef.current;
      if (!image) return;
      const current = viewRef.current;
      const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
      const bounds = image.getBoundingClientRect();
      const centerX = bounds.left + bounds.width / 2;
      const centerY = bounds.top + bounds.height / 2;
      const ratio = nextScale / current.scale;
      update({
        scale: nextScale,
        x: current.x + ((x ?? centerX) - centerX) * (1 - ratio),
        y: current.y + ((y ?? centerY) - centerY) * (1 - ratio),
      });
    },
    [update],
  );

  const zoomIn = useCallback(() => zoomAt(viewRef.current.scale * 1.25), [zoomAt]);
  const zoomOut = useCallback(() => zoomAt(viewRef.current.scale / 1.25), [zoomAt]);

  // A non-passive listener prevents the browser from zooming on trackpad pinch.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !isOpen || !enabled) return;
    const onWheel = (event: WheelEvent) => {
      if (event.target instanceof Element && event.target.closest("button")) return;
      event.preventDefault();
      event.stopPropagation();
      const delta =
        event.deltaMode === 1
          ? event.deltaY * 16
          : event.deltaMode === 2
            ? event.deltaY * viewport.clientHeight
            : event.deltaY;
      zoomAt(viewRef.current.scale * Math.exp(-delta * 0.0035), event.clientX, event.clientY);
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [enabled, isOpen, zoomAt]);

  useEffect(() => {
    if (!isOpen || !enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (event.target instanceof HTMLElement &&
          (event.target.isContentEditable ||
            /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)))
      )
        return;
      if (event.shiftKey && viewRef.current.scale > MIN_SCALE) {
        const direction: Record<string, [number, number]> = {
          ArrowLeft: [-KEYBOARD_PAN_STEP, 0],
          ArrowRight: [KEYBOARD_PAN_STEP, 0],
          ArrowUp: [0, -KEYBOARD_PAN_STEP],
          ArrowDown: [0, KEYBOARD_PAN_STEP],
        };
        const movement = direction[event.key];
        if (movement) {
          update({
            ...viewRef.current,
            x: viewRef.current.x + movement[0],
            y: viewRef.current.y + movement[1],
          });
          event.preventDefault();
          return;
        }
      }
      if (event.key === "+" || event.key === "=") zoomIn();
      else if (event.key === "-") zoomOut();
      else if (event.key === "0") reset();
      else return;
      event.preventDefault();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [enabled, isOpen, reset, update, zoomIn, zoomOut]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLImageElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    if (points.length === 2 && points[0] && points[1])
      pinch.current = {
        distance: Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y),
        scale: viewRef.current.scale,
      };
  }, []);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLImageElement>) => {
      const previous = pointers.current.get(event.pointerId);
      if (!previous) return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const points = [...pointers.current.values()];
      if (
        points.length === 2 &&
        points[0] &&
        points[1] &&
        pinch.current &&
        pinch.current.distance > 0
      ) {
        const distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
        zoomAt(
          (pinch.current.scale * distance) / pinch.current.distance,
          (points[0].x + points[1].x) / 2,
          (points[0].y + points[1].y) / 2,
        );
      } else if (points.length === 1 && viewRef.current.scale > 1) {
        update({
          ...viewRef.current,
          x: viewRef.current.x + event.clientX - previous.x,
          y: viewRef.current.y + event.clientY - previous.y,
        });
      }
    },
    [update, zoomAt],
  );

  const onPointerEnd = useCallback((event: React.PointerEvent<HTMLImageElement>) => {
    pointers.current.delete(event.pointerId);
    pinch.current = null;
  }, []);

  return {
    view,
    viewportRef,
    imageRef,
    zoomIn,
    zoomOut,
    reset,
    onPointerDown,
    onPointerMove,
    onPointerEnd,
  };
}
