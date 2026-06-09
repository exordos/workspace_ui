/**
 * Dedupes Zulip rendered HTML where the same user-upload image appears as a text link and
 * inside `.message_inline_image`. Client markdown inlining must not add a second preview.
 */
import { isUserUploadImagePath } from "~/shared/lib/protected-message-media-thumbnail";

const USER_UPLOADS_SEGMENT = "/user_uploads/";
const THUMBNAIL_SIZE_SUFFIX_PATTERN = /^\d+x\d+\.webp$/i;

const MARKDOWN_USER_UPLOAD_IMAGE_LINK_PATTERN = /\[[^\]]*\]\(([^)\s]+)\)/g;

function safeDecodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Canonical key for comparing full-res and thumbnail paths to the same upload file. */
export function normalizeUserUploadImageIdentity(rawHref: string): string | null {
  const trimmed = rawHref.trim();
  if (!isUserUploadImagePath(trimmed)) {
    return null;
  }

  let pathOnly = trimmed.split("?")[0]?.split("#")[0] ?? "";
  try {
    if (pathOnly.startsWith("http://") || pathOnly.startsWith("https://")) {
      pathOnly = new URL(pathOnly).pathname;
    }
  } catch {
    // keep pathOnly as-is
  }

  const uploadsIndex = pathOnly.indexOf(USER_UPLOADS_SEGMENT);
  if (uploadsIndex < 0) {
    return null;
  }

  let relative = pathOnly.slice(uploadsIndex + USER_UPLOADS_SEGMENT.length);
  if (relative.startsWith("thumbnail/")) {
    relative = relative.slice("thumbnail/".length);
  }
  const segments = relative.split("/");
  const lastSegment = segments[segments.length - 1] ?? "";
  if (THUMBNAIL_SIZE_SUFFIX_PATTERN.test(lastSegment)) {
    segments.pop();
    relative = segments.join("/");
  }

  const decoded = safeDecodeUriComponent(relative).toLowerCase();
  return decoded.length > 0 ? decoded : null;
}

function addIdentityFromHref(identities: Set<string>, href: string | null | undefined): void {
  if (href == null || href.length === 0) return;
  const identity = normalizeUserUploadImageIdentity(href);
  if (identity != null) {
    identities.add(identity);
  }
}

export function collectMessageInlineImageIdentitiesFromContainer(
  container: ParentNode,
): Set<string> {
  const identities = new Set<string>();
  for (const block of container.querySelectorAll(".message_inline_image")) {
    for (const anchor of block.querySelectorAll<HTMLAnchorElement>("a[href]")) {
      addIdentityFromHref(identities, anchor.getAttribute("href"));
    }
    for (const image of block.querySelectorAll<HTMLImageElement>("img[src]")) {
      addIdentityFromHref(identities, image.getAttribute("src"));
    }
  }
  return identities;
}

/** Collects upload image identities already rendered inside Zulip `.message_inline_image` blocks. */
export function collectMessageInlineImageIdentities(html: string): Set<string> {
  const identities = new Set<string>();
  if (typeof document === "undefined" || !html.includes(USER_UPLOADS_SEGMENT)) {
    return identities;
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  return collectMessageInlineImageIdentitiesFromContainer(wrapper);
}

/** True when the link should stay text — the same file is already inlined in `.message_inline_image`. */
export function shouldSkipInliningUserUploadImageLink(
  href: string,
  inlineIdentities: ReadonlySet<string>,
): boolean {
  if (inlineIdentities.size === 0) {
    return false;
  }
  const identity = normalizeUserUploadImageIdentity(href);
  return identity != null && inlineIdentities.has(identity);
}

/** Extracts user-upload image link targets from markdown-style message bodies. */
export function collectUserUploadImageIdentitiesFromMarkdown(markdown: string): Set<string> {
  const identities = new Set<string>();
  if (!markdown.includes(USER_UPLOADS_SEGMENT)) {
    return identities;
  }

  for (const match of markdown.matchAll(MARKDOWN_USER_UPLOAD_IMAGE_LINK_PATTERN)) {
    const href = match[1];
    if (href != null) {
      addIdentityFromHref(identities, href);
    }
  }

  return identities;
}

/** Extracts user-upload image identities from rendered HTML (inline blocks + img src). */
export function collectUserUploadImageIdentitiesFromHtml(html: string): Set<string> {
  const identities = collectMessageInlineImageIdentities(html);
  if (typeof document === "undefined" || !html.includes(USER_UPLOADS_SEGMENT)) {
    return identities;
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;

  for (const image of wrapper.querySelectorAll<HTMLImageElement>("img[src]")) {
    addIdentityFromHref(identities, image.getAttribute("src"));
  }

  return identities;
}

function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const value of a) {
    if (!b.has(value)) {
      return false;
    }
  }
  return true;
}

/** True when optimistic markdown uploads match server HTML inline image paths (echo pairing). */
export function userUploadImageIdentitiesMatchBetweenBodies(
  optimisticMarkdown: string,
  serverHtml: string,
): boolean {
  const fromMarkdown = collectUserUploadImageIdentitiesFromMarkdown(optimisticMarkdown);
  if (fromMarkdown.size === 0) {
    return false;
  }
  const fromHtml = collectUserUploadImageIdentitiesFromHtml(serverHtml);
  return setsEqual(fromMarkdown, fromHtml);
}
