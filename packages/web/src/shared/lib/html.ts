import DOMPurify from "dompurify";

let messageSanitizeHooksInstalled = false;

function ensureMessageLinkTargetHooks(): void {
  if (messageSanitizeHooksInstalled) return;
  messageSanitizeHooksInstalled = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    // Open all message links in a new browsing context (external and internal).
    if (node.tagName !== "A" || !node.hasAttribute("href")) return;
    const href = node.getAttribute("href")?.trim() ?? "";
    if (href === "") return;
    if (node.hasAttribute("data-workspace-message-link")) return;
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  });
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

const MESSAGE_ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "del",
  "em",
  "i",
  "a",
  "ul",
  "ol",
  "li",
  "blockquote",
  "code",
  "pre",
  "span",
  "div",
  "picture",
  "img",
  "audio",
  "video",
  "source",
  "button",
  "details",
  "summary",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
];

// Event handlers are never allowlisted; message rendering also depends on selected data attrs.
const MESSAGE_ADD_ATTR = [
  "src",
  "alt",
  "width",
  "height",
  "title",
  "class",
  "controls",
  "preload",
  "poster",
  "type",
  "role",
  "tabindex",
  "aria-label",
  "data-inline-spoiler",
  "data-original-url",
  "data-original-dimensions",
  "data-original-content-type",
  "data-workspace-mention",
  "data-workspace-user-uuid",
  "data-workspace-message-link",
  "data-workspace-message-uuid",
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
  "colspan",
  "rowspan",
  "data-user-id",
  "data-user-uuid",
  "data-user-group-id",
];

const MESSAGE_FORBID_ATTR = ["data-auth-src", "data-auth-poster", "data-auth-background-image"];

export function resolveMessageMediaUrl(src: string, baseUrl: string): string {
  const trimmedBase = baseUrl.trim();
  if (trimmedBase === "") return src;
  const base = trimmedBase.replace(/\/+$/, "");
  const s = src.trim();
  if (
    s.startsWith("http://") ||
    s.startsWith("https://") ||
    s.startsWith("data:") ||
    s.startsWith("blob:")
  ) {
    return s;
  }
  return s.startsWith("/") ? `${base}${s}` : `${base}/${s}`;
}

export function sanitizeHtml(html: string, _baseUrl?: string): string {
  ensureMessageLinkTargetHooks();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: MESSAGE_ALLOWED_TAGS,
    ADD_ATTR: MESSAGE_ADD_ATTR,
    FORBID_ATTR: MESSAGE_FORBID_ATTR,
  });
}

export function sanitizeHtmlToFragment(html: string, _baseUrl?: string): DocumentFragment | null {
  if (typeof document === "undefined") {
    return null;
  }
  ensureMessageLinkTargetHooks();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: MESSAGE_ALLOWED_TAGS,
    ADD_ATTR: MESSAGE_ADD_ATTR,
    FORBID_ATTR: MESSAGE_FORBID_ATTR,
    RETURN_DOM_FRAGMENT: true,
  });
}
