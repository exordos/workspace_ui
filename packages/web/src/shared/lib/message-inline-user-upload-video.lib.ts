/**
 * Inline `<video>` preview for Zulip user-upload links (markdown and server HTML).
 */
import {
  isUserUploadVideoPath,
  userUploadVideoMimeType,
} from "~/shared/lib/user-upload-media-path.lib";

export function createInlineUserUploadVideoElement(href: string): HTMLVideoElement {
  const video = document.createElement("video");
  video.setAttribute("controls", "");
  video.setAttribute("preload", "metadata");
  const source = document.createElement("source");
  source.setAttribute("src", href);
  source.setAttribute("type", userUploadVideoMimeType(href));
  video.appendChild(source);
  return video;
}

/** Replaces bare user-upload video anchors with inline players. Returns count upgraded. */
export function upgradeUserUploadVideoLinksInContainer(container: ParentNode): number {
  if (typeof document === "undefined") {
    return 0;
  }

  let upgraded = 0;
  for (const link of container.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const href = link.getAttribute("href")?.trim() ?? "";
    if (href === "" || !isUserUploadVideoPath(href)) continue;
    if (link.querySelector("video") != null) continue;
    if (link.querySelector("img") != null) continue;

    link.replaceWith(createInlineUserUploadVideoElement(href));
    upgraded += 1;
  }

  return upgraded;
}
