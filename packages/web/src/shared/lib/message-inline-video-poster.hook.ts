import { useEffect, type RefObject } from "react";

const INLINE_VIDEO_POSTER_IO_ROOT_MARGIN = "200px 0px";
const INLINE_VIDEO_POSTER_STATE_ATTR = "data-inline-poster-state";
const INLINE_VIDEO_POSTER_MAX_WIDTH = 480;
const INLINE_VIDEO_POSTER_JPEG_QUALITY = 0.82;

interface UseInlineVideoPosterOptions {
  deferRootSelector?: string;
}

function hasUsablePoster(video: HTMLVideoElement): boolean {
  const poster = video.getAttribute("poster");
  return poster != null && poster.trim() !== "";
}

function scaleInlineVideoPosterSize(
  width: number,
  height: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) {
    return { width: 0, height: 0 };
  }

  if (width <= INLINE_VIDEO_POSTER_MAX_WIDTH) {
    return { width, height };
  }

  const scale = INLINE_VIDEO_POSTER_MAX_WIDTH / width;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function captureInlineVideoPoster(video: HTMLVideoElement): string | null {
  const { width, height } = scaleInlineVideoPosterSize(video.videoWidth, video.videoHeight);
  if (width === 0 || height === 0) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (context == null) {
    return null;
  }

  try {
    context.drawImage(video, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", INLINE_VIDEO_POSTER_JPEG_QUALITY);
  } catch {
    return null;
  }
}

function prepareInlineVideoPoster(video: HTMLVideoElement): () => void {
  if (hasUsablePoster(video)) {
    return () => undefined;
  }

  const existingState = video.getAttribute(INLINE_VIDEO_POSTER_STATE_ATTR);
  if (existingState === "pending" || existingState === "ready" || existingState === "failed") {
    return () => undefined;
  }

  video.setAttribute(INLINE_VIDEO_POSTER_STATE_ATTR, "pending");

  const originalPreload = video.getAttribute("preload");
  video.setAttribute("preload", "auto");

  let disposed = false;

  const restorePreload = () => {
    if (originalPreload == null) {
      video.removeAttribute("preload");
      return;
    }
    video.setAttribute("preload", originalPreload);
  };

  const finalize = (state: "ready" | "failed", posterUrl?: string) => {
    if (disposed) {
      return;
    }
    disposed = true;
    video.removeEventListener("loadeddata", handleLoadedData);
    video.removeEventListener("error", handleError);
    restorePreload();
    video.setAttribute(INLINE_VIDEO_POSTER_STATE_ATTR, state);
    if (posterUrl != null && posterUrl.trim() !== "" && !hasUsablePoster(video)) {
      video.setAttribute("poster", posterUrl);
    }
  };

  const handleLoadedData = () => {
    const posterUrl = captureInlineVideoPoster(video);
    if (posterUrl == null) {
      finalize("failed");
      return;
    }
    finalize("ready", posterUrl);
  };

  const handleError = () => {
    finalize("failed");
  };

  video.addEventListener("loadeddata", handleLoadedData);
  video.addEventListener("error", handleError);

  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    queueMicrotask(handleLoadedData);
  }

  return () => {
    if (disposed) {
      return;
    }
    disposed = true;
    video.removeEventListener("loadeddata", handleLoadedData);
    video.removeEventListener("error", handleError);
    restorePreload();
  };
}

export function useInlineVideoPosters(
  containerRef: RefObject<HTMLElement | null>,
  html: string,
  options?: UseInlineVideoPosterOptions,
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (container == null) return;

    const videos = Array.from(container.querySelectorAll<HTMLVideoElement>("video"));
    if (videos.length === 0) return;

    const scrollRoot = options?.deferRootSelector
      ? container.closest<HTMLElement>(options.deferRootSelector)
      : null;
    const cleanups: (() => void)[] = [];

    const startForVideo = (video: HTMLVideoElement) => {
      cleanups.push(prepareInlineVideoPoster(video));
    };

    const useImmediateStart =
      scrollRoot == null ||
      typeof IntersectionObserver === "undefined" ||
      typeof IntersectionObserver !== "function";

    if (useImmediateStart) {
      for (const video of videos) {
        startForVideo(video);
      }
      return () => {
        for (const cleanup of cleanups) {
          cleanup();
        }
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const target = entry.target;
          if (!(target instanceof HTMLVideoElement)) continue;
          observer.unobserve(target);
          startForVideo(target);
        }
      },
      {
        root: scrollRoot,
        rootMargin: INLINE_VIDEO_POSTER_IO_ROOT_MARGIN,
        threshold: 0,
      },
    );

    for (const video of videos) {
      observer.observe(video);
    }

    return () => {
      observer.disconnect();
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, [containerRef, html, options?.deferRootSelector]);
}
