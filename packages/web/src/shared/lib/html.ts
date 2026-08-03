import DOMPurify from "dompurify";
import {
  ensureMessageSanitizeHooks,
  WORKSPACE_MESSAGE_ALLOWED_ATTR,
  WORKSPACE_MESSAGE_ALLOWED_TAGS,
  WORKSPACE_MESSAGE_FORBID_ATTR,
} from "./workspace-message-render/workspace-message-sanitize.lib";

export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

const MESSAGE_ALLOWED_TAGS = [
  ...WORKSPACE_MESSAGE_ALLOWED_TAGS,
  "b",
  "i",
  "picture",
  "audio",
  "video",
  "source",
  "details",
  "summary",
];

// Event handlers are never allowlisted; message rendering also depends on selected data attrs.
const MESSAGE_ADD_ATTR = [
  ...WORKSPACE_MESSAGE_ALLOWED_ATTR,
  "controls",
  "preload",
  "poster",
  "data-original-url",
  "data-original-dimensions",
  "data-original-content-type",
  "colspan",
  "rowspan",
  "data-user-id",
  "data-user-uuid",
  "data-user-group-id",
];

const MESSAGE_FORBID_ATTR = [...WORKSPACE_MESSAGE_FORBID_ATTR];

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
  ensureMessageSanitizeHooks();
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
  ensureMessageSanitizeHooks();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: MESSAGE_ALLOWED_TAGS,
    ADD_ATTR: MESSAGE_ADD_ATTR,
    FORBID_ATTR: MESSAGE_FORBID_ATTR,
    RETURN_DOM_FRAGMENT: true,
  });
}
