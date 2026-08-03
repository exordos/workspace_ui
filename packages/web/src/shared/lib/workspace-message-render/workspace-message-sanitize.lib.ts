import DOMPurify from "dompurify";

export const WORKSPACE_MESSAGE_ALLOWED_TAGS = [
  "p",
  "div",
  "span",
  "br",
  "button",
  "strong",
  "em",
  "del",
  "a",
  "ul",
  "ol",
  "li",
  "blockquote",
  "code",
  "pre",
  "img",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
] as const;

export const WORKSPACE_MESSAGE_ALLOWED_ATTR = [
  "href",
  "title",
  "target",
  "rel",
  "start",
  "class",
  "type",
  "data-workspace-mention",
  "data-workspace-user-uuid",
  "data-workspace-message-link",
  "data-workspace-message-uuid",
  "data-workspace-quote-reference",
  "data-workspace-reference",
  "data-workspace-reference-kind",
  "data-workspace-stream-uuid",
  "data-workspace-topic-uuid",
  "data-workspace-file",
  "data-workspace-file-uuid",
  "data-workspace-file-kind",
  "data-workspace-media-kind",
  "data-workspace-file-name",
  "data-workspace-file-content-type",
  "data-workspace-file-size",
  "data-workspace-media-width",
  "data-workspace-media-height",
  "data-workspace-spoiler-toggle",
  "data-workspace-spoiler-inline",
  "data-inline-spoiler",
  "role",
  "tabindex",
  "aria-label",
  "aria-hidden",
  // Existing protected-video placeholders use validated numeric inline layout.
  "style",
  "src",
  "alt",
  "width",
  "height",
  "decoding",
  "loading",
  "align",
] as const;

export const WORKSPACE_MESSAGE_FORBID_ATTR = [
  "data-auth-src",
  "data-auth-poster",
  "data-auth-background-image",
] as const;

const SAFE_TABLE_ALIGNMENTS = new Set(["left", "center", "right"]);
const POSITIVE_CSS_NUMBER_PATTERN = "([0-9]+(?:\\.[0-9]+)?)";
const WORKSPACE_MEDIA_WIDTH_STYLE_PATTERN = new RegExp(`^width:${POSITIVE_CSS_NUMBER_PATTERN}px$`);
const WORKSPACE_MEDIA_ASPECT_RATIO_STYLE_PATTERN = new RegExp(
  `^aspect-ratio:${POSITIVE_CSS_NUMBER_PATTERN}$`,
);
const LEGACY_EMBED_BACKGROUND_STYLE_PATTERN =
  /^background-image:url\((?:"(\/external_content\/[^\s"'();\\]+)"|'(\/external_content\/[^\s"'();\\]+)'|(\/external_content\/[^\s"'();\\]+))\)$/;
let messageSanitizeHooksInstalled = false;

function isPositiveStyleNumber(match: RegExpExecArray | null): boolean {
  const value = Number(match?.[1]);
  return Number.isFinite(value) && value > 0;
}

function isAllowedWorkspaceMediaStyle(node: Element, value: string): boolean {
  if (node.classList.contains("workspace-message-file-placeholder")) {
    return isPositiveStyleNumber(WORKSPACE_MEDIA_WIDTH_STYLE_PATTERN.exec(value));
  }
  if (node.classList.contains("workspace-message-file-placeholder__video-visual")) {
    return isPositiveStyleNumber(WORKSPACE_MEDIA_ASPECT_RATIO_STYLE_PATTERN.exec(value));
  }
  return false;
}

function isAllowedLegacyEmbedStyle(node: Element, value: string): boolean {
  return (
    node.tagName === "A" &&
    node.classList.contains("message_embed_image") &&
    LEGACY_EMBED_BACKGROUND_STYLE_PATTERN.test(value)
  );
}

export function ensureMessageSanitizeHooks(): void {
  if (messageSanitizeHooksInstalled) {
    return;
  }
  messageSanitizeHooksInstalled = true;

  DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
    if (data.attrName === "style") {
      if (
        !isAllowedWorkspaceMediaStyle(node, data.attrValue) &&
        !isAllowedLegacyEmbedStyle(node, data.attrValue)
      ) {
        data.keepAttr = false;
      }
      return;
    }

    if (data.attrName !== "align") {
      return;
    }

    const tagName = node.tagName.toUpperCase();
    const alignment = data.attrValue.trim().toLowerCase();
    if ((tagName !== "TH" && tagName !== "TD") || !SAFE_TABLE_ALIGNMENTS.has(alignment)) {
      data.keepAttr = false;
      return;
    }

    data.attrValue = alignment;
  });

  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName !== "A" || !node.hasAttribute("href")) {
      return;
    }

    const href = node.getAttribute("href")?.trim() ?? "";
    if (href === "") {
      return;
    }
    if (
      node.hasAttribute("data-workspace-message-link") ||
      node.hasAttribute("data-workspace-reference")
    ) {
      return;
    }

    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  });
}

export function sanitizeWorkspaceMessageHtml(html: string): string {
  ensureMessageSanitizeHooks();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [...WORKSPACE_MESSAGE_ALLOWED_TAGS],
    ALLOWED_ATTR: [...WORKSPACE_MESSAGE_ALLOWED_ATTR],
    FORBID_ATTR: [...WORKSPACE_MESSAGE_FORBID_ATTR],
  });
}
