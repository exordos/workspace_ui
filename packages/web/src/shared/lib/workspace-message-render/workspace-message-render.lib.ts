import DOMPurify from "dompurify";
import { DEFAULT_WORKSPACE_MESSAGE_RENDER_OPTIONS } from "./workspace-message-render-options.lib";
import type {
  WorkspaceMessageBlock,
  WorkspaceMessageDocument,
  WorkspaceMessageInline,
  WorkspaceMessageRenderOptions,
  WorkspaceMessageRenderResult,
} from "./workspace-message-document.types";

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
  "data-workspace-file",
  "data-workspace-file-uuid",
  "data-workspace-file-kind",
  "data-workspace-media-kind",
  "data-workspace-file-name",
  "data-workspace-file-content-type",
  "data-workspace-spoiler-toggle",
  "data-workspace-spoiler-inline",
  "data-inline-spoiler",
  "role",
  "tabindex",
  "aria-label",
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
    SAFE_LINK_PROTOCOL_PATTERN.test(trimmed) || trimmed.startsWith("/") || trimmed.startsWith("#")
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

  // Workspace download сейчас требует bearer-доступ и отдает attachment response.
  // Пока нет безопасного inline-src контракта, full render оставляет только явный
  // placeholder с UUID; загрузку blob/viewer должен добавить отдельный слой фазы 9.
  return `<span role="button" tabindex="0" class="workspace-message-file-placeholder" data-workspace-file="true" data-workspace-file-uuid="${escapeHtmlText(
    reference.fileUuid,
  )}" data-workspace-file-kind="${reference.kind}"${mediaKindAttr}${fileNameAttr}${contentTypeAttr} aria-label="${escapeHtmlText(
    label,
  )}">${escapeHtmlText(label)}</span>`;
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
        inline.unresolved === true ||
        inline.userUuid == null ||
        inline.userUuid.trim().length === 0
      ) {
        return escapeHtmlText(mentionText);
      }
      // Кнопка содержит только Workspace UUID. Старый numeric user id сюда
      // намеренно не добавляется: обработчик клика обязан работать от UUID
      // или считать действие неподдержанным для текущей поверхности.
      return `<button type="button" class="workspace-message-mention" data-workspace-mention="true" data-workspace-user-uuid="${escapeHtmlText(
        inline.userUuid,
      )}">${escapeHtmlText(mentionText)}</button>`;
    }
    case "link": {
      const labelHtml = renderInlineChildren(inline.children, options);
      const titleAttr =
        inline.title != null && inline.title.trim().length > 0
          ? ` title="${escapeHtmlText(inline.title)}"`
          : "";
      if (!isSafeLinkHref(inline.href)) {
        return labelHtml;
      }
      const workspaceMessageUuid = resolveWorkspaceMessageRouteUuid(inline.href);
      if (workspaceMessageUuid != null) {
        // Ссылки на сообщения в Workspace разрешены только через project/message
        // route с UUID. Старые `/message/:id`, `?msg=` и Zulip narrow не
        // выпускаем как `<a>`, чтобы bubble не вел пользователя в legacy path.
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
  // Даже собственный renderer пропускаем через sanitize boundary: это защищает
  // от будущих расширений markdown subset и от ошибок в allowlist ссылок.
  const html = options.enableMarkdown
    ? renderBlocks(document.blocks, options)
    : renderPlainText(document);
  return {
    html: sanitizeWorkspaceMessageHtml(html),
    metadata: document.metadata,
  };
}
