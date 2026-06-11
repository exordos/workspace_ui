import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { buildAuthHeader } from "~/shared/lib/auth-guard";
import { upgradeUserUploadVideoLinksInContainer } from "~/shared/lib/message-inline-user-upload-video.lib";
import { useInlineVideoPosters } from "~/shared/lib/message-inline-video-poster.hook";
import {
  AUTH_IMAGE_PLACEHOLDER_SRC,
  AUTH_MEDIA_BACKGROUND_IMAGE_DATA_ATTR,
  AUTH_MEDIA_POSTER_DATA_ATTR,
  AUTH_MEDIA_SRC_DATA_ATTR,
  fetchProtectedUploadDisplayUrl,
  isAuthMediaPlaceholderAttr,
  isProtectedMessageMediaUrl,
  protectMessageMediaElementsInContainer,
} from "~/shared/lib/protected-message-media";

const PROTECTED_MEDIA_IO_ROOT_MARGIN = "200px 0px";

interface UseProtectedMessageHtmlOptions {
  deferRootSelector?: string;
}

export function useProtectedMessageHtml(
  containerRef: RefObject<HTMLElement | null>,
  html: string,
  options?: UseProtectedMessageHtmlOptions,
): void {
  const lastInjectedHtmlRef = useRef<string | null>(null);
  const lastInjectedElementRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (element == null) {
      lastInjectedElementRef.current = null;
      return;
    }
    const isSameHtml = lastInjectedHtmlRef.current === html;
    const isSameElement = lastInjectedElementRef.current === element;
    if (isSameHtml && isSameElement) return;

    element.innerHTML = html;
    if (upgradeUserUploadVideoLinksInContainer(element) > 0) {
      protectMessageMediaElementsInContainer(element);
    }
    lastInjectedHtmlRef.current = html;
    lastInjectedElementRef.current = element;
  });

  useProtectedMediaLoader(containerRef, html, options);
  useInlineVideoPosters(containerRef, html, options);
}

function loadProtectedMediaIntoElement(
  element: HTMLElement,
  sourceAttr: typeof AUTH_MEDIA_SRC_DATA_ATTR | typeof AUTH_MEDIA_POSTER_DATA_ATTR,
  targetAttr: "src" | "poster",
  headers: Record<string, string>,
  blobUrls: string[],
  isCancelled: () => boolean,
): void {
  const rawValue = element.getAttribute(sourceAttr);
  if (!rawValue || !isAuthMediaPlaceholderAttr(element.getAttribute(targetAttr))) {
    return;
  }

  void fetchProtectedUploadDisplayUrl(rawValue, headers, blobUrls).then((displayUrl) => {
    if (isCancelled() || displayUrl == null) return;
    element.setAttribute(targetAttr, displayUrl);
    if (targetAttr !== "src") {
      return;
    }
    if (element instanceof HTMLMediaElement) {
      element.load();
      return;
    }
    if (element instanceof HTMLSourceElement) {
      const mediaElement = element.closest("audio,video");
      if (mediaElement instanceof HTMLMediaElement) {
        mediaElement.load();
      }
    }
  });
}

function resolveProtectedMediaSourceValue(mediaElement: HTMLMediaElement): string | null {
  const ownValue = mediaElement.getAttribute(AUTH_MEDIA_SRC_DATA_ATTR)?.trim();
  if (ownValue != null && ownValue !== "") {
    return ownValue;
  }

  const source = mediaElement.querySelector<HTMLSourceElement>(
    `source[${AUTH_MEDIA_SRC_DATA_ATTR}]`,
  );
  const sourceValue = source?.getAttribute(AUTH_MEDIA_SRC_DATA_ATTR)?.trim();
  if (sourceValue != null && sourceValue !== "") {
    return sourceValue;
  }

  return null;
}

function loadProtectedMediaIntoHtmlMediaElement(
  mediaElement: HTMLMediaElement,
  headers: Record<string, string>,
  blobUrls: string[],
  isCancelled: () => boolean,
): void {
  const rawValue = resolveProtectedMediaSourceValue(mediaElement);
  if (!rawValue || !isAuthMediaPlaceholderAttr(mediaElement.getAttribute("src"))) {
    return;
  }

  void fetchProtectedUploadDisplayUrl(rawValue, headers, blobUrls).then((displayUrl) => {
    if (isCancelled() || displayUrl == null) return;
    mediaElement.setAttribute("src", displayUrl);
    mediaElement.load();
  });
}

function loadProtectedBackgroundImageIntoElement(
  element: HTMLElement,
  headers: Record<string, string>,
  blobUrls: string[],
  isCancelled: () => boolean,
): void {
  const rawValue = element.getAttribute(AUTH_MEDIA_BACKGROUND_IMAGE_DATA_ATTR);
  if (!rawValue || element.style.backgroundImage.trim() !== "") {
    return;
  }

  void fetchProtectedUploadDisplayUrl(rawValue, headers, blobUrls).then((displayUrl) => {
    if (isCancelled() || displayUrl == null) return;
    element.style.backgroundImage = `url("${displayUrl}")`;
  });
}

function resolveProtectedMediaLoadTarget(element: HTMLElement): HTMLElement {
  if (element instanceof HTMLSourceElement) {
    const mediaElement = element.closest("audio,video");
    if (mediaElement instanceof HTMLMediaElement) {
      return mediaElement;
    }
  }

  return element;
}

function collectProtectedMediaLoadTargets(container: HTMLElement): HTMLElement[] {
  const candidates = container.querySelectorAll<HTMLElement>(
    `[${AUTH_MEDIA_SRC_DATA_ATTR}], [${AUTH_MEDIA_POSTER_DATA_ATTR}], [${AUTH_MEDIA_BACKGROUND_IMAGE_DATA_ATTR}]`,
  );
  const targets: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();

  for (const candidate of candidates) {
    const target = resolveProtectedMediaLoadTarget(candidate);
    if (seen.has(target)) {
      continue;
    }
    seen.add(target);
    targets.push(target);
  }

  return targets;
}

function useProtectedMediaLoader(
  containerRef: RefObject<HTMLElement | null>,
  html: string,
  options?: UseProtectedMessageHtmlOptions,
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (container == null) return;

    const protectedMediaElements = collectProtectedMediaLoadTargets(container);
    if (protectedMediaElements.length === 0) return;

    const headers = buildAuthHeader();
    const scrollRoot = options?.deferRootSelector
      ? container.closest<HTMLElement>(options.deferRootSelector)
      : null;
    const blobUrls: string[] = [];
    let cancelled = false;

    const startFetchForElement = (element: HTMLElement) => {
      if (element instanceof HTMLVideoElement || element instanceof HTMLAudioElement) {
        loadProtectedMediaIntoHtmlMediaElement(element, headers, blobUrls, () => cancelled);
      } else if (element.hasAttribute(AUTH_MEDIA_SRC_DATA_ATTR)) {
        loadProtectedMediaIntoElement(
          element,
          AUTH_MEDIA_SRC_DATA_ATTR,
          "src",
          headers,
          blobUrls,
          () => cancelled,
        );
      }
      if (element.hasAttribute(AUTH_MEDIA_POSTER_DATA_ATTR)) {
        loadProtectedMediaIntoElement(
          element,
          AUTH_MEDIA_POSTER_DATA_ATTR,
          "poster",
          headers,
          blobUrls,
          () => cancelled,
        );
      }
      if (element.hasAttribute(AUTH_MEDIA_BACKGROUND_IMAGE_DATA_ATTR)) {
        loadProtectedBackgroundImageIntoElement(element, headers, blobUrls, () => cancelled);
      }
    };

    const useImmediateFetch =
      scrollRoot == null ||
      typeof IntersectionObserver === "undefined" ||
      typeof IntersectionObserver !== "function";

    if (useImmediateFetch) {
      for (const element of protectedMediaElements) {
        startFetchForElement(element);
      }
      return () => {
        cancelled = true;
        for (const url of blobUrls) {
          URL.revokeObjectURL(url);
        }
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const target = entry.target;
          if (!(target instanceof HTMLElement)) continue;
          observer.unobserve(target);
          startFetchForElement(target);
        }
      },
      {
        root: scrollRoot,
        rootMargin: PROTECTED_MEDIA_IO_ROOT_MARGIN,
        threshold: 0,
      },
    );

    for (const element of protectedMediaElements) {
      observer.observe(element);
    }

    return () => {
      cancelled = true;
      observer.disconnect();
      for (const url of blobUrls) {
        URL.revokeObjectURL(url);
      }
    };
  }, [containerRef, html, options?.deferRootSelector]);
}

function resolveProtectedMediaInitialDisplayUrl(
  url: string,
  mediaType: "image" | "video",
): string | undefined {
  const isProtected = isProtectedMessageMediaUrl(url);
  if (mediaType === "image") {
    return isProtected ? AUTH_IMAGE_PLACEHOLDER_SRC : url;
  }
  return isProtected ? undefined : url;
}

export function useProtectedMediaDisplayUrl(
  url: string,
  mediaType: "image" | "video",
): string | undefined {
  const initialValue = resolveProtectedMediaInitialDisplayUrl(url, mediaType);
  const [displayUrl, setDisplayUrl] = useState<string | undefined>(initialValue);

  useEffect(() => {
    const trimmedUrl = url.trim();
    if (trimmedUrl === "") {
      setDisplayUrl(mediaType === "image" ? AUTH_IMAGE_PLACEHOLDER_SRC : undefined);
      return;
    }
    if (!isProtectedMessageMediaUrl(trimmedUrl)) {
      setDisplayUrl(trimmedUrl);
      return;
    }

    setDisplayUrl(mediaType === "image" ? AUTH_IMAGE_PLACEHOLDER_SRC : undefined);

    const headers = buildAuthHeader();
    const blobUrls: string[] = [];
    let cancelled = false;

    void fetchProtectedUploadDisplayUrl(trimmedUrl, headers, blobUrls).then((nextUrl) => {
      if (cancelled || nextUrl == null) return;
      setDisplayUrl(nextUrl);
    });

    return () => {
      cancelled = true;
      for (const blobUrl of blobUrls) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [mediaType, url]);

  return displayUrl;
}
