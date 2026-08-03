/**
 * Inline meta placement for Workspace message bubbles.
 *
 * The parser only states an intent (`preferredMetaPlacement`). The final block
 * structure is known after markdown, sanitizing, segment rendering and nested
 * React components have produced real DOM, so the anchor for the trailing
 * reserve is resolved against that DOM. When no anchor can be resolved the hook
 * reports `false` and the bubble keeps the safe row footer.
 */
import { useLayoutEffect, useState } from "react";
import { createLogger } from "~/shared/lib/logger";
import type React from "react";

const inlineMetaLog = createLogger("workspace-message-inline-meta");

export const WORKSPACE_MESSAGE_META_ANCHOR_ATTRIBUTE = "data-workspace-message-meta-anchor";

const META_WIDTH_PROPERTY = "--workspace-message-bubble-meta-width";
const META_HEIGHT_PROPERTY = "--workspace-message-bubble-meta-height";
const HTML_SEGMENT_SELECTOR = "[data-workspace-message-html-segment='true']";

interface UseWorkspaceMessageInlineMetaOptions {
  bodyRef: React.RefObject<HTMLDivElement | null>;
  metaRef: React.RefObject<HTMLSpanElement | null>;
  preferInline: boolean;
  /** Changes whenever the rendered body changes, which re-resolves the anchor. */
  contentKey: string;
}

/**
 * Finds the paragraph that ends the message body.
 * The walk goes at most one level deep into an html segment wrapper, so it can
 * never reach the inside of a nested quote card.
 */
export function resolveWorkspaceMessageMetaAnchor(bodyElement: HTMLElement): HTMLElement | null {
  let candidate: Element | null = bodyElement.lastElementChild;
  if (candidate?.matches(HTML_SEGMENT_SELECTOR) === true) {
    candidate = candidate.lastElementChild;
  }

  if (!(candidate instanceof HTMLElement) || candidate.tagName !== "P") {
    return null;
  }
  return candidate;
}

function resolveAnchorOrNull(bodyElement: HTMLElement): HTMLElement | null {
  try {
    return resolveWorkspaceMessageMetaAnchor(bodyElement);
  } catch (error) {
    inlineMetaLog.debug("anchor lookup failed", { error: String(error) });
    return null;
  }
}

export function useWorkspaceMessageInlineMeta({
  bodyRef,
  metaRef,
  preferInline,
  contentKey,
}: UseWorkspaceMessageInlineMetaOptions): boolean {
  // Storing the content key instead of a plain flag makes the fallback reset
  // itself when the message changes, so the effect cannot flip the same content
  // between inline and row.
  const [unanchoredContentKey, setUnanchoredContentKey] = useState<string | null>(null);
  const useInlineMeta = preferInline && unanchoredContentKey !== contentKey;

  useLayoutEffect(() => {
    if (!useInlineMeta) {
      return;
    }

    const bodyElement = bodyRef.current;
    const metaElement = metaRef.current;
    if (bodyElement == null || metaElement == null) {
      return;
    }

    const anchor = resolveAnchorOrNull(bodyElement);
    if (anchor == null) {
      setUnanchoredContentKey(contentKey);
      return;
    }

    anchor.setAttribute(WORKSPACE_MESSAGE_META_ANCHOR_ATTRIBUTE, "true");

    let released = false;
    const updateReserve = (): void => {
      if (released) {
        return;
      }
      const rect = metaElement.getBoundingClientRect();
      anchor.style.setProperty(META_WIDTH_PROPERTY, `${Math.ceil(rect.width)}px`);
      anchor.style.setProperty(META_HEIGHT_PROPERTY, `${Math.ceil(rect.height)}px`);
    };
    updateReserve();

    // A late webfont swap resizes the meta after the first layout pass.
    if ("fonts" in document) {
      void document.fonts.ready
        .then(updateReserve)
        .catch((error: unknown) =>
          inlineMetaLog.debug("font readiness failed", { error: String(error) }),
        );
    }

    const releaseAnchor = (): void => {
      released = true;
      anchor.removeAttribute(WORKSPACE_MESSAGE_META_ANCHOR_ATTRIBUTE);
      anchor.style.removeProperty(META_WIDTH_PROPERTY);
      anchor.style.removeProperty(META_HEIGHT_PROPERTY);
    };

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateReserve);
      return () => {
        window.removeEventListener("resize", updateReserve);
        releaseAnchor();
      };
    }

    // The corner block grows when delivery ticks or an edited marker appear,
    // so the reserve follows its real size instead of a fixed estimate.
    const resizeObserver = new ResizeObserver(updateReserve);
    resizeObserver.observe(metaElement);
    return () => {
      resizeObserver.disconnect();
      releaseAnchor();
    };
  }, [bodyRef, contentKey, metaRef, useInlineMeta]);

  return useInlineMeta;
}
