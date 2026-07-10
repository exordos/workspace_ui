/**
 * Inline `<video>` preview for the messenger API user-upload links (markdown and server HTML).
 */
import {
  isUserUploadVideoPath,
  userUploadVideoMimeType,
} from "~/shared/lib/user-upload-media-path.lib";
import { isWorkspaceFileDownloadPath } from "~/shared/lib/user-uploads-url.lib";

export function createInlineUserUploadVideoElement(
  href: string,
  contentType = userUploadVideoMimeType(href),
): HTMLVideoElement {
  const video = document.createElement("video");
  video.setAttribute("controls", "");
  video.setAttribute("preload", "metadata");
  const source = document.createElement("source");
  source.setAttribute("src", href);
  source.setAttribute("type", contentType);
  video.appendChild(source);
  return video;
}

function workspaceFileVideoMimeType(link: HTMLAnchorElement, href: string): string | null {
  if (!isWorkspaceFileDownloadPath(href)) return null;
  const contentType = link.dataset.originalContentType?.trim().toLowerCase() ?? "";
  if (contentType.startsWith("video/")) return contentType;
  const originalUrl = link.dataset.originalUrl?.trim().toLowerCase() ?? "";
  if (!originalUrl.startsWith("urn:video:")) return null;
  const label = (link.textContent ?? "").trim();
  return userUploadVideoMimeType(label.length > 0 ? label : href);
}

/** Replaces bare user-upload video anchors with inline players. Returns count upgraded. */
export function upgradeUserUploadVideoLinksInContainer(container: ParentNode): number {
  if (typeof document === "undefined") {
    return 0;
  }

  let upgraded = 0;
  for (const link of container.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const href = link.getAttribute("href")?.trim() ?? "";
    if (href === "") continue;
    const workspaceFileContentType = workspaceFileVideoMimeType(link, href);
    if (!isUserUploadVideoPath(href) && workspaceFileContentType == null) continue;
    if (link.querySelector("video") != null) continue;
    if (link.querySelector("img") != null) continue;

    link.replaceWith(
      createInlineUserUploadVideoElement(href, workspaceFileContentType ?? undefined),
    );
    upgraded += 1;
  }

  return upgraded;
}
