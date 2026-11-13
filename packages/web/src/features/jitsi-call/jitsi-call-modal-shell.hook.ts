import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import {
  resolveJitsiCallHeaderSubtitle,
  resolveJitsiCallHeaderTitle,
} from "./jitsi-call-header.lib";
import { getDefaultPipWindowBounds, type PipWindowBounds } from "./jitsi-call-pip.lib";
import { useJitsiCallSession } from "./jitsi-call-session.hook";
import type { JitsiCallProps } from "./jitsi-call.types";

const DESKTOP_INSET = 32;
const MOBILE_INSET = 16;
const DESKTOP_BREAKPOINT = 640;
const MIN_WINDOW_WIDTH = 280;
const MIN_WINDOW_HEIGHT = 180;

interface ViewportSize {
  width: number;
  height: number;
}

function getViewportSize(): ViewportSize {
  if (typeof window === "undefined") {
    return { width: 1280, height: 720 };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

function getExpandedWindowBounds(viewportSize: ViewportSize): PipWindowBounds {
  const inset =
    viewportSize.width >= DESKTOP_BREAKPOINT && viewportSize.height >= DESKTOP_BREAKPOINT
      ? DESKTOP_INSET
      : MOBILE_INSET;
  return {
    x: inset,
    y: inset,
    width: Math.max(MIN_WINDOW_WIDTH, viewportSize.width - inset * 2),
    height: Math.max(MIN_WINDOW_HEIGHT, viewportSize.height - inset * 2),
  };
}

export function useJitsiCallModalShell(props: JitsiCallProps) {
  const { open, onClose } = props;
  const { callName, participantCount, embedProps } = useJitsiCallSession(props);
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [pipWindowBounds, setPipWindowBounds] =
    useState<PipWindowBounds>(getDefaultPipWindowBounds);
  const [viewportSize, setViewportSize] = useState<ViewportSize>(getViewportSize);

  const expandedWindowBounds = useMemo(() => getExpandedWindowBounds(viewportSize), [viewportSize]);
  const windowBounds = isMinimized ? pipWindowBounds : expandedWindowBounds;

  useEffect(() => {
    const handleResize = () => setViewportSize(getViewportSize());
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (open && embedProps.roomName != null) return;
    void Promise.resolve().then(() => {
      setIsMinimized(false);
      setIsNativeFullscreen(false);
      setPipWindowBounds(getDefaultPipWindowBounds());
    });
    if (document.fullscreenElement === fullscreenRef.current) {
      const fullscreenExitPromise = document.exitFullscreen?.();
      if (fullscreenExitPromise != null) {
        void fullscreenExitPromise.catch((err) =>
          reportUnexpectedError("jitsi:fullscreenExit", err),
        );
      }
    }
  }, [open, embedProps.roomName]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsNativeFullscreen(document.fullscreenElement === fullscreenRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && !isMinimized) {
        setIsMinimized(true);
      }
    },
    [isMinimized],
  );

  const toggleNativeFullscreen = useCallback(async () => {
    if (fullscreenRef.current == null) return;
    try {
      if (document.fullscreenElement === fullscreenRef.current) {
        await document.exitFullscreen?.();
      } else {
        await fullscreenRef.current.requestFullscreen?.();
      }
    } catch {
      // Fullscreen API not supported or denied.
    }
  }, []);

  const toggleMinimized = useCallback(() => {
    if (isMinimized) {
      setIsMinimized(false);
      return;
    }
    setIsMinimized(true);
    if (document.fullscreenElement === fullscreenRef.current) {
      const fullscreenExitPromise = document.exitFullscreen?.();
      if (fullscreenExitPromise != null) {
        void fullscreenExitPromise.catch((err) =>
          reportUnexpectedError("jitsi:fullscreenExit", err),
        );
      }
    }
  }, [isMinimized]);

  const headerTitle = resolveJitsiCallHeaderTitle(callName, participantCount);
  const headerSubtitle = resolveJitsiCallHeaderSubtitle(participantCount);

  return {
    fullscreenRef,
    isMinimized,
    isNativeFullscreen,
    windowBounds,
    embedProps,
    headerTitle,
    headerSubtitle,
    handleOpenChange,
    toggleNativeFullscreen,
    toggleMinimized,
    setPipWindowBounds,
    onClose,
    open,
  };
}
