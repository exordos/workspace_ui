/**
 * Touch gesture primitives.
 *
 * Framework-agnostic gesture detectors exposed as React hooks:
 * - `useSwipe(ref, callbacks)` — horizontal/vertical swipe with threshold
 * - `useLongPress(ref, callback, ms)` — long-press (context menu)
 * - `usePinch(ref, callback)` — two-finger pinch (zoom images)
 *
 * All hooks use Pointer Events for unified mouse+touch+pen support.
 * They attach { passive: false } only when `preventDefault` is needed.
 */

import { useEffect, useRef, type RefObject } from "react";

// ---------------------------------------------------------------------------
// Swipe
// ---------------------------------------------------------------------------

export interface SwipeCallbacks {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onSwiping?: (dx: number, dy: number) => void;
  onSwipeEnd?: () => void;
}

export interface SwipeOptions {
  threshold?: number;
  maxDuration?: number;
  edgeOnly?: boolean;
  edgeWidth?: number;
}

const SWIPE_DEFAULTS: Required<SwipeOptions> = {
  threshold: 50,
  maxDuration: 500,
  edgeOnly: false,
  edgeWidth: 30,
};

export function useSwipe(
  ref: RefObject<HTMLElement | null>,
  callbacks: SwipeCallbacks,
  options?: SwipeOptions,
): void {
  const cbRef = useRef(callbacks);

  useEffect(() => {
    cbRef.current = callbacks;
  });

  const opts = { ...SWIPE_DEFAULTS, ...options };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let tracking = false;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      if (opts.edgeOnly) {
        const rect = el.getBoundingClientRect();
        const fromLeft = e.clientX - rect.left;
        const fromRight = rect.right - e.clientX;
        if (fromLeft > opts.edgeWidth && fromRight > opts.edgeWidth) return;
      }
      startX = e.clientX;
      startY = e.clientY;
      startTime = Date.now();
      tracking = true;
      el.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!tracking) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      cbRef.current.onSwiping?.(dx, dy);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!tracking) return;
      tracking = false;
      cbRef.current.onSwipeEnd?.();

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const elapsed = Date.now() - startTime;

      if (elapsed > opts.maxDuration) return;

      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (absDx > absDy && absDx > opts.threshold) {
        if (dx > 0) cbRef.current.onSwipeRight?.();
        else cbRef.current.onSwipeLeft?.();
      } else if (absDy > absDx && absDy > opts.threshold) {
        if (dy > 0) cbRef.current.onSwipeDown?.();
        else cbRef.current.onSwipeUp?.();
      }
    };

    const onPointerCancel = () => {
      if (tracking) {
        tracking = false;
        cbRef.current.onSwipeEnd?.();
      }
    };

    el.addEventListener("pointerdown", onPointerDown, { passive: true });
    el.addEventListener("pointermove", onPointerMove, { passive: true });
    el.addEventListener("pointerup", onPointerUp, { passive: true });
    el.addEventListener("pointercancel", onPointerCancel, { passive: true });

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [ref, opts.threshold, opts.maxDuration, opts.edgeOnly, opts.edgeWidth]);
}

// ---------------------------------------------------------------------------
// Long-press
// ---------------------------------------------------------------------------

export interface LongPressOptions {
  delay?: number;
  moveTolerance?: number;
}

export function useLongPress(
  ref: RefObject<HTMLElement | null>,
  callback: (e: PointerEvent) => void,
  options?: LongPressOptions,
): void {
  const cbRef = useRef(callback);

  useEffect(() => {
    cbRef.current = callback;
  });

  const delay = options?.delay ?? 500;
  const tolerance = options?.moveTolerance ?? 10;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let startX = 0;
    let startY = 0;
    let fired = false;

    const cancel = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      startX = e.clientX;
      startY = e.clientY;
      fired = false;
      cancel();
      const captured = e;
      timer = setTimeout(() => {
        fired = true;
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate(30);
        }
        cbRef.current(captured);
      }, delay);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!timer) return;
      const dx = Math.abs(e.clientX - startX);
      const dy = Math.abs(e.clientY - startY);
      if (dx > tolerance || dy > tolerance) cancel();
    };

    const onPointerUp = (e: PointerEvent) => {
      cancel();
      if (fired) e.preventDefault();
    };

    el.addEventListener("pointerdown", onPointerDown, { passive: true });
    el.addEventListener("pointermove", onPointerMove, { passive: true });
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", cancel, { passive: true });

    return () => {
      cancel();
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", cancel);
    };
  }, [ref, delay, tolerance]);
}

// ---------------------------------------------------------------------------
// Pinch-to-zoom
// ---------------------------------------------------------------------------

export interface PinchState {
  scale: number;
  centerX: number;
  centerY: number;
}

export function usePinch(
  ref: RefObject<HTMLElement | null>,
  callback: (state: PinchState) => void,
): void {
  const cbRef = useRef(callback);

  useEffect(() => {
    cbRef.current = callback;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const pointers = new Map<number, PointerEvent>();
    let initialDistance = 0;

    const getDistance = (): number => {
      const pts = Array.from(pointers.values());
      if (pts.length < 2) return 0;
      const dx = pts[1]!.clientX - pts[0]!.clientX;
      const dy = pts[1]!.clientY - pts[0]!.clientY;
      return Math.hypot(dx, dy);
    };

    const getCenter = (): [number, number] => {
      const pts = Array.from(pointers.values());
      if (pts.length < 2) return [0, 0];
      return [(pts[0]!.clientX + pts[1]!.clientX) / 2, (pts[0]!.clientY + pts[1]!.clientY) / 2];
    };

    const onDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, e);
      if (pointers.size === 2) {
        initialDistance = getDistance();
        el.setPointerCapture(e.pointerId);
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, e);
      if (pointers.size === 2 && initialDistance > 0) {
        const scale = getDistance() / initialDistance;
        const [cx, cy] = getCenter();
        cbRef.current({ scale, centerX: cx, centerY: cy });
      }
    };

    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) initialDistance = 0;
    };

    el.addEventListener("pointerdown", onDown, { passive: true });
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerup", onUp, { passive: true });
    el.addEventListener("pointercancel", onUp, { passive: true });

    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [ref]);
}
