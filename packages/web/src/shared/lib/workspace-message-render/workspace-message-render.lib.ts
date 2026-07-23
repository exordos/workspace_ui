import DOMPurify from "dompurify";
import { createLogger } from "~/shared/lib/logger";
import { AUTH_IMAGE_PLACEHOLDER_SRC } from "~/shared/lib/media-display-url.lib";
import { deriveWorkspaceMediaPlaceholderLayout } from "./workspace-media-placeholder-layout.lib";
import { DEFAULT_WORKSPACE_MESSAGE_RENDER_OPTIONS } from "./workspace-message-render-options.lib";
import type {
  WorkspaceMessageBlock,
  WorkspaceMessageDocument,
  WorkspaceMessageInline,
  WorkspaceMessageRenderOptions,
  WorkspaceMessageRenderResult,
} from "./workspace-message-document.types";

const workspaceMessageRenderLog = createLogger("workspace-message-render");

const WORKSPACE_MESSAGE_ALLOWED_TAGS = [
  "p",
  "div",
  "span",
  "br",
  "button",
  "strong",
  "em",
  "a",
  "ul",
  "ol",
  "li",
  "blockquote",
  "code",
  "pre",
  "img",
];

const WORKSPACE_MESSAGE_ALLOWED_ATTR = [
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
  "style",
  "src",
  "alt",
  "decoding",
  "loading",
];
const SAFE_LINK_PROTOCOL_PATTERN = /^(?:https?:|mailto:)/i;
const WORKSPACE_MESSAGE_ROUTE_PATTERN =
  /^(?:\/org\/[^/?#]+)?\/project\/[^/?#]+\/message\/([^/?#]+)\/?$/;
const WORKSPACE_MESSAGE_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEGACY_NUMERIC_MESSAGE_ROUTE_PATTERN = /^\/message\/\d+\/?$/;
const LEGACY_NUMERIC_CHAT_MESSAGE_ROUTE_PATTERN = /^\/(?:stream\/\d+|dm\/\d)/;
const ZULIP_NARROW_MESSAGE_LINK_PATTERN = /#narrow\/.+\/near\/\d+(?:$|[/?#])/i;

function escapeHtmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sanitizeWorkspaceMessageHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: WORKSPACE_MESSAGE_ALLOWED_TAGS,
    ALLOWED_ATTR: WORKSPACE_MESSAGE_ALLOWED_ATTR,
  });
}

function isSafeLinkHref(href: string): boolean {
  const trimmed = href.trim();
  return (
    SAFE_LINK_PROTOCOL_PATTERN.test(trimmed) ||
    (trimmed.startsWith("/") && !trimmed.startsWith("//")) ||
    trimmed.startsWith("#")
  );
}

function parseSafeUrlForRoute(href: string): URL | null {
  const trimmed = href.trim();
  try {
    if (SAFE_LINK_PROTOCOL_PATTERN.test(trimmed)) {
      return new URL(trimmed);
    }
    if (trimmed.startsWith("/")) {
      return new URL(trimmed, "https://workspace.local");
    }
  } catch {
    return null;
  }
  return null;
}

function resolveWorkspaceMessageRouteUuid(href: string): string | null {
  const url = parseSafeUrlForRoute(href);
  if (url == null) {
    return null;
  }

  const match = WORKSPACE_MESSAGE_ROUTE_PATTERN.exec(url.pathname);
  const messageUuid = (() => {
    if (match?.[1] == null) {
      return null;
    }
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return null;
    }
  })();
  if (messageUuid == null || !WORKSPACE_MESSAGE_UUID_PATTERN.test(messageUuid)) {
    return null;
  }

  return messageUuid;
}

function isUnsupportedLegacyMessageLink(href: string): boolean {
  const trimmed = href.trim();
  if (ZULIP_NARROW_MESSAGE_LINK_PATTERN.test(trimmed)) {
    return true;
  }

  const url = parseSafeUrlForRoute(trimmed);
  if (url == null) {
    return false;
  }

  return (
    LEGACY_NUMERIC_MESSAGE_ROUTE_PATTERN.test(url.pathname) ||
    (url.searchParams.has("msg") && LEGACY_NUMERIC_CHAT_MESSAGE_ROUTE_PATTERN.test(url.pathname))
  );
}

function renderInlineChildren(
  children: readonly WorkspaceMessageInline[],
  options: WorkspaceMessageRenderOptions,
): string {
  return children.map((child) => renderInline(child, options)).join("");
}

function renderWorkspaceFileLabel(
  inline: Extract<WorkspaceMessageInline, { kind: "file" }>,
): string {
  const { reference } = inline;
  if (reference.kind === "media") {
    return reference.mediaKind === "video" ? "Видео" : "Изображение";
  }
  return reference.name != null ? `Файл: ${reference.name}` : "Файл";
}

function renderWorkspaceFilePlaceholder(
  inline: Extract<WorkspaceMessageInline, { kind: "file" }>,
): string {
  const { reference } = inline;
  const label = renderWorkspaceFileLabel(inline);
  const isImage = reference.kind === "media" && reference.mediaKind === "image";
  const isVideo = reference.kind === "media" && reference.mediaKind === "video";
  const videoLayout = isVideo ? deriveWorkspaceMediaPlaceholderLayout(reference) : null;
  const videoPlaceholderStyle = videoLayout != null ? ` style="width:${videoLayout.width}px"` : "";
  const videoVisualStyle =
    videoLayout != null ? ` style="aspect-ratio:${videoLayout.aspectRatio}"` : "";
  const fileNameAttr =
    reference.name != null ? ` data-workspace-file-name="${escapeHtmlText(reference.name)}"` : "";
  const contentTypeAttr =
    reference.contentType != null
      ? ` data-workspace-file-content-type="${escapeHtmlText(reference.contentType)}"`
      : "";
  const mediaKindAttr =
    reference.mediaKind != null
      ? ` data-workspace-media-kind="${escapeHtmlText(reference.mediaKind)}"`
      : "";
  const fileSizeAttr =
    reference.sizeBytes != null
      ? ` data-workspace-file-size="${escapeHtmlText(String(reference.sizeBytes))}"`
      : "";
  const mediaWidthAttr =
    reference.width != null
      ? ` data-workspace-media-width="${escapeHtmlText(String(reference.width))}"`
      : "";
  const mediaHeightAttr =
    reference.height != null
      ? ` data-workspace-media-height="${escapeHtmlText(String(reference.height))}"`
      : "";

  // Workspace download currently needs bearer access and returns an attachment
  // response. Until there is a safe inline-src contract, full render leaves only
  // an explicit UUID placeholder; a separate preview layer must add blob/viewer loading.
  if (isImage) {
    workspaceMessageRenderLog.debug("render image placeholder", {
      fileUuid: reference.fileUuid,
      contentType: reference.contentType ?? null,
      width: reference.width ?? null,
      height: reference.height ?? null,
    });
  }
  return `<span role="button" tabindex="0" class="workspace-message-file-placeholder" data-workspace-file="true" data-workspace-file-uuid="${escapeHtmlText(
    reference.fileUuid,
  )}" data-workspace-file-kind="${reference.kind}"${mediaKindAttr}${fileNameAttr}${contentTypeAttr}${fileSizeAttr}${mediaWidthAttr}${mediaHeightAttr}${videoPlaceholderStyle} title="${escapeHtmlText(
    label,
  )}" aria-label="${escapeHtmlText(label)}">${
    isImage
      ? `<img class="workspace-message-file-placeholder__image" src="${escapeHtmlText(
          AUTH_IMAGE_PLACEHOLDER_SRC,
        )}" alt="" decoding="async" loading="lazy">`
      : ""
  }${
    isVideo
      ? `<span class="workspace-message-file-placeholder__video-visual"${videoVisualStyle}><span class="workspace-message-file-placeholder__video-icon" aria-hidden="true"></span><span class="workspace-message-file-placeholder__label sr-only">${escapeHtmlText(label)}</span></span>`
      : ""
  }${
    isVideo
      ? ""
      : `<span class="workspace-message-file-placeholder__label${isImage ? " sr-only" : ""}">${escapeHtmlText(label)}</span>`
  }</span>`;
}

function renderWorkspaceConversationReference(
  inline: Extract<WorkspaceMessageInline, { kind: "link" }>,
  options: WorkspaceMessageRenderOptions,
): string | null {
  const reference = inline.workspaceReference;
  if (reference?.kind !== "stream" && reference?.kind !== "topic") {
    return null;
  }

  const labelHtml = renderInlineChildren(inline.children, options);
  const titleAttr =
    inline.title != null && inline.title.trim().length > 0
      ? ` title="${escapeHtmlText(inline.title)}"`
      : "";
  const referenceKind = reference.kind;
  const streamUuid =
    reference.streamUuid == null ? undefined : escapeHtmlText(reference.streamUuid);
  const topicUuid = reference.kind === "topic" ? escapeHtmlText(reference.topicUuid) : undefined;
  const streamUuidAttr =
    reference.kind === "topic" && reference.streamUuid == null
      ? ""
      : ` data-workspace-stream-uuid="${streamUuid}"`;
  const fragment =
    reference.kind === "stream"
      ? `#workspace-reference-stream-${streamUuid}`
      : reference.streamUuid == null
        ? `#workspace-reference-topic-${topicUuid}`
        : `#workspace-reference-topic-${streamUuid}-${topicUuid}`;

  return `<a href="${fragment}"${titleAttr} data-workspace-reference="true" data-workspace-reference-kind="${referenceKind}"${streamUuidAttr}${topicUuid == null ? "" : ` data-workspace-topic-uuid="${topicUuid}"`}>${labelHtml}</a>`;
}

function renderInline(
  inline: WorkspaceMessageInline,
  options: WorkspaceMessageRenderOptions,
): string {
  switch (inline.kind) {
    case "text":
      return escapeHtmlText(inline.text);
    case "break":
      return "<br>";
    case "emphasis":
      return `<em>${renderInlineChildren(inline.children, options)}</em>`;
    case "strong":
      return `<strong>${renderInlineChildren(inline.children, options)}</strong>`;
    case "code":
      return `<code>${escapeHtmlText(inline.text)}</code>`;
    case "spoiler":
      return `<span class="inline-spoiler" data-inline-spoiler="true" data-workspace-spoiler-inline="true">${renderInlineChildren(
        inline.children,
        options,
      )}</span>`;
    case "unsupported-media":
      return escapeHtmlText(inline.label || "Изображение");
    case "file":
      if (inline.reference.kind === "media") {
        if (!options.enableProtectedMedia) {
          return escapeHtmlText(renderWorkspaceFileLabel(inline));
        }
        return renderWorkspaceFilePlaceholder(inline);
      }
      if (!options.enableAttachments) {
        return escapeHtmlText(renderWorkspaceFileLabel(inline));
      }
      return renderWorkspaceFilePlaceholder(inline);
    case "emoji":
      if (!options.enableEmojiShortcodes) {
        return escapeHtmlText(inline.text);
      }
      return escapeHtmlText(inline.unicode);
    case "mention": {
      const mentionText = `@${inline.displayText}`;
      if (
        !options.enableMentions ||
        inline.userUuid == null ||
        inline.userUuid.trim().length === 0
      ) {
        return escapeHtmlText(mentionText);
      }
      // The button carries only a Workspace UUID. Click handling must use UUIDs
      // or treat the action as unsupported for the current surface.
      return `<button type="button" class="workspace-message-mention" data-workspace-mention="true" data-workspace-user-uuid="${escapeHtmlText(
        inline.userUuid,
      )}">${escapeHtmlText(mentionText)}</button>`;
    }
    case "link": {
      const workspaceConversationReference = renderWorkspaceConversationReference(inline, options);
      if (workspaceConversationReference != null) {
        return workspaceConversationReference;
      }
      const labelHtml = renderInlineChildren(inline.children, options);
      const titleAttr =
        inline.title != null && inline.title.trim().length > 0
          ? ` title="${escapeHtmlText(inline.title)}"`
          : "";
      if (inline.workspaceMessageUuid != null) {
        // URN links are a content contract, not browser URLs. Use a harmless
        // fragment and let the UUID-only message action handle navigation.
        return `<a href="#workspace-message-${escapeHtmlText(
          inline.workspaceMessageUuid,
        )}"${titleAttr} data-workspace-message-link="true" data-workspace-message-uuid="${escapeHtmlText(
          inline.workspaceMessageUuid,
        )}">${labelHtml}</a>`;
      }
      if (!isSafeLinkHref(inline.href)) {
        return labelHtml;
      }
      const workspaceMessageUuid = resolveWorkspaceMessageRouteUuid(inline.href);
      if (workspaceMessageUuid != null) {
        // Workspace message links are allowed only through the project/message
        // route with UUID. Old `/message/:id`, `?msg=`, and Zulip narrow are not
        // emitted as `<a>`, so the bubble does not send users to a legacy path.
        return `<a href="${escapeHtmlText(
          inline.href,
        )}"${titleAttr} data-workspace-message-link="true" data-workspace-message-uuid="${escapeHtmlText(
          workspaceMessageUuid,
        )}">${labelHtml}</a>`;
      }
      if (isUnsupportedLegacyMessageLink(inline.href)) {
        return labelHtml;
      }
      return `<a href="${escapeHtmlText(inline.href)}"${titleAttr} target="_blank" rel="noopener noreferrer">${labelHtml}</a>`;
    }
  }
}

function renderBlocks(
  blocks: readonly WorkspaceMessageBlock[],
  options: WorkspaceMessageRenderOptions,
): string {
  return blocks.map((block) => renderBlock(block, options)).join("");
}

function renderBlock(block: WorkspaceMessageBlock, options: WorkspaceMessageRenderOptions): string {
  switch (block.kind) {
    case "paragraph":
      return `<p>${renderInlineChildren(block.children, options)}</p>`;
    case "quote":
      if (!options.enableQuotes) {
        return renderBlocks(block.blocks, options);
      }
      return `<blockquote class="workspace-message-quote">${renderBlocks(
        block.blocks,
        options,
      )}</blockquote>`;
    case "code": {
      const language = block.language?.trim();
      const codeClass =
        language != null && language.length > 0
          ? ` class="hljs language-${escapeHtmlText(language)}"`
          : ' class="hljs"';
      return `<pre><code${codeClass}>${escapeHtmlText(block.text)}</code></pre>`;
    }
    case "spoiler": {
      return `<div class="spoiler-block"><div class="spoiler-header" role="button" tabindex="0" data-workspace-spoiler-toggle="true">${renderInlineChildren(
        block.header,
        options,
      )}</div><div class="spoiler-content">${renderBlocks(block.blocks, options)}</div></div>`;
    }
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      const startAttr =
        block.ordered && block.start != null && block.start > 1 ? ` start="${block.start}"` : "";
      const itemsHtml = block.items
        .map((item) => `<li>${renderBlocks(item.blocks, options)}</li>`)
        .join("");
      return `<${tag}${startAttr}>${itemsHtml}</${tag}>`;
    }
  }
}

function renderPlainText(document: WorkspaceMessageDocument): string {
  return escapeHtmlText(document.sourceMarkdown).replace(/\n/g, "<br>");
}

export function renderWorkspaceMessageBody(
  document: WorkspaceMessageDocument,
  options: WorkspaceMessageRenderOptions = DEFAULT_WORKSPACE_MESSAGE_RENDER_OPTIONS,
): WorkspaceMessageRenderResult {
  // Even our own renderer goes through the sanitize boundary: this protects
  // against future markdown subset growth and link allowlist mistakes.
  const html = options.enableMarkdown
    ? renderBlocks(document.blocks, options)
    : renderPlainText(document);
  return {
    html: sanitizeWorkspaceMessageHtml(html),
    metadata: document.metadata,
  };
}
