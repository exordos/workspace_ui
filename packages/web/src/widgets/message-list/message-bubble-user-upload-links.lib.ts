/**
 * Expands Zulip markdown-style upload links `[file](user_uploads/...)` into inline
 * `<img>` for image paths so protected-media fetch + blob preview applies.
 *
 * `mediaBaseUrl` must match `sanitizeHtml` base (realm / uploads origin) so `src` is absolute
 * like native Zulip `<img>` markup — relative-only `src` breaks authenticated fetch off-proxy.
 */
import { resolveMessageMediaUrl } from "~/shared/lib/html";
import { isProtectedUserUploadUrl } from "./message-bubble-protected-media.lib";

const USER_UPLOAD_IMAGE_EXT = /\.(apng|avif|bmp|gif|jpe?g|png|svg|webp)(\?|#|$)/i;

export function isUserUploadImageHref(href: string): boolean {
  if (!isProtectedUserUploadUrl(href)) return false;
  const pathOnly = href.trim().split("?")[0]?.split("#")[0] ?? "";
  return USER_UPLOAD_IMAGE_EXT.test(pathOnly);
}

export function expandUserUploadImageLinks(html: string, mediaBaseUrl?: string): string {
  if (!html.includes("/user_uploads/") || typeof document === "undefined") return html;

  const container = document.createElement("div");
  container.innerHTML = html;

  const links = Array.from(container.querySelectorAll<HTMLAnchorElement>("a[href]"));
  for (const link of links) {
    if (link.querySelector("img") != null) continue;
    const href = link.getAttribute("href");
    if (href == null || href === "" || !isUserUploadImageHref(href)) continue;

    const base = mediaBaseUrl?.trim() ?? "";
    const resolvedSrc = base !== "" ? resolveMessageMediaUrl(href, base) : href;

    const alt = link.textContent?.trim();
    const altText = alt != null && alt.length > 0 ? alt : "image";

    const img = document.createElement("img");
    img.setAttribute("src", resolvedSrc);
    img.setAttribute("alt", altText);

    link.replaceWith(img);
  }

  return container.innerHTML;
}
