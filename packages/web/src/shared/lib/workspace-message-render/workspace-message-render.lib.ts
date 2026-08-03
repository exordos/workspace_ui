import { Marked, type RendererExtension, type RendererThis, type Token, type Tokens } from "marked";
import { createLogger } from "~/shared/lib/logger";
import { AUTH_IMAGE_PLACEHOLDER_SRC } from "~/shared/lib/media-display-url.lib";
import { parseWorkspaceReferenceUrn, parseWorkspaceUrlUrn } from "../workspace-reference-urn.lib";
import { deriveWorkspaceMediaPlaceholderLayout } from "./workspace-media-placeholder-layout.lib";
import {
  WORKSPACE_BLOCK_SPOILER_TOKEN_TYPE,
  WORKSPACE_EMOJI_TOKEN_TYPE,
  WORKSPACE_FILE_TOKEN_TYPE,
  WORKSPACE_HISTORICAL_QUOTE_TOKEN_TYPE,
  WORKSPACE_INLINE_SPOILER_TOKEN_TYPE,
  WORKSPACE_MENTION_TOKEN_TYPE,
  WORKSPACE_UNSUPPORTED_MEDIA_TOKEN_TYPE,
  getStandaloneWorkspaceQuoteReference,
  selectRenderableWorkspaceBlockTokens,
  trimBlockBoundaryTokens,
  type WorkspaceBlockSpoilerMarkedToken,
  type WorkspaceEmojiMarkedToken,
  type WorkspaceFileMarkedToken,
  type WorkspaceHistoricalQuoteMarkedToken,
  type WorkspaceInlineSpoilerMarkedToken,
  type WorkspaceMentionMarkedToken,
  type WorkspaceUnsupportedMediaMarkedToken,
} from "./workspace-message-marked.lib";
import { DEFAULT_WORKSPACE_MESSAGE_RENDER_OPTIONS } from "./workspace-message-render-options.lib";
import { sanitizeWorkspaceMessageHtml } from "./workspace-message-sanitize.lib";
import type {
  WorkspaceMessageBodySegment,
  WorkspaceMessageDocument,
  WorkspaceMessageFileReference,
  WorkspaceMessageQuoteReference,
  WorkspaceMessageRenderOptions,
  WorkspaceMessageRenderResult,
  WorkspaceMessageSegmentRenderResult,
} from "./workspace-message-document.types";

const workspaceMessageRenderLog = createLogger("workspace-message-render");

const SAFE_LINK_PROTOCOL_PATTERN = /^(?:https?:|mailto:)/i;
const WORKSPACE_MESSAGE_ROUTE_PATTERN =
  /^(?:\/org\/[^/?#]+)?\/project\/[^/?#]+\/message\/([^/?#]+)\/?$/;
const WORKSPACE_MESSAGE_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEGACY_NUMERIC_MESSAGE_ROUTE_PATTERN = /^\/message\/\d+\/?$/;
const LEGACY_NUMERIC_CHAT_MESSAGE_ROUTE_PATTERN = /^\/(?:stream\/\d+|dm\/\d)/;
const ZULIP_NARROW_MESSAGE_LINK_PATTERN = /#narrow\/.+\/near\/\d+(?:$|[/?#])/i;
const MAX_WORKSPACE_MESSAGE_GAP_LINES = 5;

function escapeHtmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderNestedBlockTokens(parser: RendererThis["parser"], tokens: readonly Token[]): string {
  return parser.parse(trimBlockBoundaryTokens(tokens));
}

function renderWorkspaceMessageGap(token: Tokens.Space): string {
  const newlineCount = token.raw.match(/\n/g)?.length ?? 0;
  if (newlineCount < 2) {
    return "";
  }
  const blankLineCount = Math.min(MAX_WORKSPACE_MESSAGE_GAP_LINES, Math.max(1, newlineCount - 1));
  return `<span class="workspace-message-gap workspace-message-gap--${blankLineCount}" aria-hidden="true"></span>`;
}

function isSafeLinkHref(href: string): boolean {
  const trimmed = href.trim();
  if (trimmed.includes("\\")) {
    return false;
  }
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
  const encodedUuid = match?.[1];
  if (encodedUuid == null) {
    return null;
  }
  let messageUuid: string;
  try {
    messageUuid = decodeURIComponent(encodedUuid);
  } catch {
    return null;
  }
  return WORKSPACE_MESSAGE_UUID_PATTERN.test(messageUuid) ? messageUuid : null;
}

function isUnsupportedLegacyMessageLink(href: string): boolean {
  const trimmed = href.trim();
  if (ZULIP_NARROW_MESSAGE_LINK_PATTERN.test(trimmed)) {
    return true;
  }
  const url = parseSafeUrlForRoute(trimmed);
  return (
    url != null &&
    (LEGACY_NUMERIC_MESSAGE_ROUTE_PATTERN.test(url.pathname) ||
      (url.searchParams.has("msg") && LEGACY_NUMERIC_CHAT_MESSAGE_ROUTE_PATTERN.test(url.pathname)))
  );
}

function renderWorkspaceFileLabel(reference: WorkspaceMessageFileReference): string {
  if (reference.kind === "media") {
    return reference.mediaKind === "video" ? "Видео" : "Изображение";
  }
  return reference.name != null ? `Файл: ${reference.name}` : "Файл";
}

function renderWorkspaceFilePlaceholder(reference: WorkspaceMessageFileReference): string {
  const label = renderWorkspaceFileLabel(reference);
  const isImage = reference.kind === "media" && reference.mediaKind === "image";
  const isVideo = reference.kind === "media" && reference.mediaKind === "video";
  const videoLayout = isVideo ? deriveWorkspaceMediaPlaceholderLayout(reference) : null;
  const videoPlaceholderStyle = videoLayout != null ? ` style="width:${videoLayout.width}px"` : "";
  const videoVisualStyle =
    videoLayout != null ? ` style="aspect-ratio:${videoLayout.aspectRatio}"` : "";
  const optionalAttributes = [
    reference.mediaKind == null
      ? ""
      : ` data-workspace-media-kind="${escapeHtmlText(reference.mediaKind)}"`,
    reference.name == null ? "" : ` data-workspace-file-name="${escapeHtmlText(reference.name)}"`,
    reference.contentType == null
      ? ""
      : ` data-workspace-file-content-type="${escapeHtmlText(reference.contentType)}"`,
    reference.sizeBytes == null
      ? ""
      : ` data-workspace-file-size="${escapeHtmlText(String(reference.sizeBytes))}"`,
    reference.width == null
      ? ""
      : ` data-workspace-media-width="${escapeHtmlText(String(reference.width))}"`,
    reference.height == null
      ? ""
      : ` data-workspace-media-height="${escapeHtmlText(String(reference.height))}"`,
  ].join("");

  if (isImage) {
    workspaceMessageRenderLog.debug("render image placeholder", {
      fileUuid: reference.fileUuid,
      contentType: reference.contentType ?? null,
      width: reference.width ?? null,
      height: reference.height ?? null,
    });
  }
  const imageHtml = isImage
    ? `<img class="workspace-message-file-placeholder__image" src="${escapeHtmlText(AUTH_IMAGE_PLACEHOLDER_SRC)}" alt="" decoding="async" loading="lazy">`
    : "";
  const videoHtml = isVideo
    ? `<span class="workspace-message-file-placeholder__video-visual"${videoVisualStyle}><span class="workspace-message-file-placeholder__video-icon" aria-hidden="true"></span><span class="workspace-message-file-placeholder__label sr-only">${escapeHtmlText(label)}</span></span>`
    : "";
  const labelClass = isImage
    ? "workspace-message-file-placeholder__label sr-only"
    : "workspace-message-file-placeholder__label";
  const labelHtml = isVideo ? "" : `<span class="${labelClass}">${escapeHtmlText(label)}</span>`;
  return `<span role="button" tabindex="0" class="workspace-message-file-placeholder" data-workspace-file="true" data-workspace-file-uuid="${escapeHtmlText(reference.fileUuid)}" data-workspace-file-kind="${reference.kind}"${optionalAttributes}${videoPlaceholderStyle} title="${escapeHtmlText(label)}" aria-label="${escapeHtmlText(label)}">${imageHtml}${videoHtml}${labelHtml}</span>`;
}

function renderFileReference(
  reference: WorkspaceMessageFileReference,
  options: WorkspaceMessageRenderOptions,
): string {
  const enabled =
    reference.kind === "media" ? options.enableProtectedMedia : options.enableAttachments;
  return enabled
    ? renderWorkspaceFilePlaceholder(reference)
    : escapeHtmlText(renderWorkspaceFileLabel(reference));
}

function renderMentionToken(
  token: WorkspaceMentionMarkedToken,
  options: WorkspaceMessageRenderOptions,
): string {
  const mentionText = `@${token.displayText}`;
  if (!options.enableMentions || token.userUuid == null || token.userUuid.trim().length === 0) {
    return escapeHtmlText(mentionText);
  }
  return `<button type="button" class="workspace-message-mention" data-workspace-mention="true" data-workspace-user-uuid="${escapeHtmlText(token.userUuid)}">${escapeHtmlText(mentionText)}</button>`;
}

function renderWorkspaceMessageReference(
  reference: Extract<ReturnType<typeof parseWorkspaceReferenceUrn>, { kind: "message" | "quote" }>,
  labelHtml: string,
  titleAttribute: string,
): string {
  return `<a href="#workspace-message-${escapeHtmlText(reference.messageUuid)}"${titleAttribute} data-workspace-message-link="true" data-workspace-message-uuid="${escapeHtmlText(reference.messageUuid)}">${labelHtml}</a>`;
}

function renderWorkspaceConversationReference(
  reference: Extract<ReturnType<typeof parseWorkspaceReferenceUrn>, { kind: "stream" | "topic" }>,
  labelHtml: string,
  titleAttribute: string,
): string {
  if (reference.kind === "stream") {
    const streamUuid = escapeHtmlText(reference.streamUuid);
    return `<a href="#workspace-reference-stream-${streamUuid}"${titleAttribute} data-workspace-reference="true" data-workspace-reference-kind="stream" data-workspace-stream-uuid="${streamUuid}">${labelHtml}</a>`;
  }

  const topicUuid = escapeHtmlText(reference.topicUuid);
  const streamUuid =
    reference.streamUuid == null ? undefined : escapeHtmlText(reference.streamUuid);
  const fragment =
    streamUuid == null
      ? `#workspace-reference-topic-${topicUuid}`
      : `#workspace-reference-topic-${streamUuid}-${topicUuid}`;
  const streamAttribute = streamUuid == null ? "" : ` data-workspace-stream-uuid="${streamUuid}"`;
  return `<a href="${fragment}"${titleAttribute} data-workspace-reference="true" data-workspace-reference-kind="topic"${streamAttribute} data-workspace-topic-uuid="${topicUuid}">${labelHtml}</a>`;
}

function renderLinkToken(
  token: Tokens.Link,
  labelHtml: string,
  options: WorkspaceMessageRenderOptions,
): string {
  const titleAttribute =
    token.title != null && token.title.trim().length > 0
      ? ` title="${escapeHtmlText(token.title)}"`
      : "";
  const workspaceUrl = parseWorkspaceUrlUrn(token.href);
  const href = workspaceUrl ?? token.href;
  const reference = parseWorkspaceReferenceUrn(token.href);
  if (reference?.kind === "user") {
    return renderMentionToken(
      {
        type: WORKSPACE_MENTION_TOKEN_TYPE,
        raw: token.raw,
        displayText: token.text,
        userUuid: reference.userUuid,
      },
      options,
    );
  }
  if (reference?.kind === "message" || reference?.kind === "quote") {
    return renderWorkspaceMessageReference(reference, labelHtml, titleAttribute);
  }
  if (reference?.kind === "stream" || reference?.kind === "topic") {
    return renderWorkspaceConversationReference(reference, labelHtml, titleAttribute);
  }
  if (!isSafeLinkHref(href)) {
    return labelHtml;
  }
  const workspaceMessageUuid = resolveWorkspaceMessageRouteUuid(href);
  if (workspaceMessageUuid != null) {
    return `<a href="${escapeHtmlText(href)}"${titleAttribute} data-workspace-message-link="true" data-workspace-message-uuid="${escapeHtmlText(workspaceMessageUuid)}">${labelHtml}</a>`;
  }
  if (isUnsupportedLegacyMessageLink(href)) {
    return labelHtml;
  }
  return `<a href="${escapeHtmlText(href)}"${titleAttribute} target="_blank" rel="noopener noreferrer">${labelHtml}</a>`;
}

function createWorkspaceRendererExtensions(
  options: WorkspaceMessageRenderOptions,
): RendererExtension[] {
  return [
    {
      name: WORKSPACE_MENTION_TOKEN_TYPE,
      renderer(token) {
        return renderMentionToken(token as WorkspaceMentionMarkedToken, options);
      },
    },
    {
      name: WORKSPACE_EMOJI_TOKEN_TYPE,
      renderer(token) {
        const emoji = token as WorkspaceEmojiMarkedToken;
        return escapeHtmlText(options.enableEmojiShortcodes ? emoji.unicode : emoji.text);
      },
    },
    {
      name: WORKSPACE_FILE_TOKEN_TYPE,
      renderer(token) {
        return renderFileReference((token as WorkspaceFileMarkedToken).reference, options);
      },
    },
    {
      name: WORKSPACE_UNSUPPORTED_MEDIA_TOKEN_TYPE,
      renderer(token) {
        const media = token as WorkspaceUnsupportedMediaMarkedToken;
        return escapeHtmlText(media.label || "Изображение");
      },
    },
    {
      name: WORKSPACE_INLINE_SPOILER_TOKEN_TYPE,
      renderer(this: RendererThis, token) {
        const spoiler = token as WorkspaceInlineSpoilerMarkedToken;
        return `<span class="inline-spoiler" data-inline-spoiler="true" data-workspace-spoiler-inline="true">${this.parser.parseInline(spoiler.tokens)}</span>`;
      },
    },
    {
      name: WORKSPACE_BLOCK_SPOILER_TOKEN_TYPE,
      renderer(this: RendererThis, token) {
        const spoiler = token as WorkspaceBlockSpoilerMarkedToken;
        return `<div class="spoiler-block"><div class="spoiler-header" role="button" tabindex="0" data-workspace-spoiler-toggle="true">${this.parser.parseInline(spoiler.headerTokens)}</div><div class="spoiler-content">${renderNestedBlockTokens(this.parser, spoiler.tokens)}</div></div>`;
      },
    },
    {
      name: WORKSPACE_HISTORICAL_QUOTE_TOKEN_TYPE,
      renderer(this: RendererThis, token) {
        const quote = token as WorkspaceHistoricalQuoteMarkedToken;
        const content = renderNestedBlockTokens(this.parser, quote.tokens);
        return options.enableQuotes
          ? `<blockquote class="workspace-message-quote">${content}</blockquote>`
          : content;
      },
    },
  ];
}

function renderTableCell(cell: Tokens.TableCell, parser: RendererThis["parser"]): string {
  const tag = cell.header ? "th" : "td";
  const align = cell.align == null ? "" : ` align="${cell.align}"`;
  return `<${tag}${align}>${parser.parseInline(cell.tokens)}</${tag}>`;
}

function renderTableToken(token: Tokens.Table, parser: RendererThis["parser"]): string {
  const header = token.header.map((cell) => renderTableCell(cell, parser)).join("");
  const rows = token.rows
    .map((row) => `<tr>${row.map((cell) => renderTableCell(cell, parser)).join("")}</tr>`)
    .join("");
  const body = rows.length > 0 ? `<tbody>${rows}</tbody>` : "";
  return `<div class="workspace-message-table-scroll"><table><thead><tr>${header}</tr></thead>${body}</table></div>`;
}

function renderListItem(item: Tokens.ListItem, parser: RendererThis["parser"]): string {
  const classAttribute = item.task ? ' class="task-list-item"' : "";
  if (item.task) {
    return `<li${classAttribute}>${renderNestedBlockTokens(parser, item.tokens)}</li>`;
  }
  const content = trimBlockBoundaryTokens(item.tokens)
    .map((token) => {
      if (token.type !== "text") {
        return parser.parse([token]);
      }
      return `<p>${parser.parseInline(token.tokens ?? [token])}</p>`;
    })
    .join("");
  return `<li${classAttribute}>${content}</li>`;
}

function renderListToken(token: Tokens.List, parser: RendererThis["parser"]): string {
  const tag = token.ordered ? "ol" : "ul";
  const startAttribute =
    token.ordered && token.start !== "" && token.start !== 1 ? ` start="${token.start}"` : "";
  const classAttribute = token.items.some((item) => item.task) ? ' class="contains-task-list"' : "";
  return `<${tag}${startAttribute}${classAttribute}>${token.items
    .map((item) => renderListItem(item, parser))
    .join("")}</${tag}>`;
}

function createWorkspaceMarkdownRenderer(options: WorkspaceMessageRenderOptions): Marked {
  return new Marked({
    async: false,
    breaks: true,
    gfm: true,
    extensions: createWorkspaceRendererExtensions(options),
    renderer: {
      space(token) {
        return renderWorkspaceMessageGap(token);
      },
      html(token) {
        return escapeHtmlText(token.text);
      },
      paragraph(this: { parser: RendererThis["parser"] }, token) {
        return `<p>${this.parser.parseInline(token.tokens)}</p>`;
      },
      heading(this: { parser: RendererThis["parser"] }, token) {
        return `<h${token.depth}>${this.parser.parseInline(token.tokens)}</h${token.depth}>`;
      },
      hr() {
        return "<hr>";
      },
      link(this: { parser: RendererThis["parser"] }, token) {
        return renderLinkToken(token, this.parser.parseInline(token.tokens), options);
      },
      image(token) {
        return escapeHtmlText(token.text || "Изображение");
      },
      blockquote(this: { parser: RendererThis["parser"] }, token) {
        const content = renderNestedBlockTokens(this.parser, token.tokens);
        return options.enableQuotes
          ? `<blockquote class="workspace-message-quote">${content}</blockquote>`
          : content;
      },
      table(this: { parser: RendererThis["parser"] }, token) {
        return renderTableToken(token, this.parser);
      },
      list(this: { parser: RendererThis["parser"] }, token) {
        return renderListToken(token, this.parser);
      },
      code(token) {
        const language = token.lang?.trim().split(/\s+/, 1)[0];
        const codeClass =
          language != null && language.length > 0
            ? ` class="hljs language-${escapeHtmlText(language)}"`
            : ' class="hljs"';
        return `<pre><code${codeClass}>${escapeHtmlText(token.text)}</code></pre>`;
      },
      checkbox(token) {
        const symbol = token.checked ? "✓" : "";
        return `<span class="workspace-message-task-marker" aria-hidden="true">${symbol}</span>`;
      },
    },
  });
}

function renderPlainText(document: WorkspaceMessageDocument): string {
  return escapeHtmlText(document.sourceMarkdown).replace(/\n/g, "<br>");
}

function renderQuoteReferenceFallback(reference: WorkspaceMessageQuoteReference): string {
  const label = reference.fallbackAuthorLabel.trim() || "Цитата";
  return `<blockquote class="workspace-message-quote workspace-message-quote-reference" data-workspace-quote-reference="true" data-workspace-message-uuid="${escapeHtmlText(reference.messageUuid)}"><a href="#workspace-message-${escapeHtmlText(reference.messageUuid)}" data-workspace-message-link="true" data-workspace-message-uuid="${escapeHtmlText(reference.messageUuid)}">${escapeHtmlText(label)}</a></blockquote>`;
}

function renderTokenGroup(
  tokens: readonly Token[],
  options: WorkspaceMessageRenderOptions,
): string {
  if (tokens.length === 0) {
    return "";
  }
  const renderer = createWorkspaceMarkdownRenderer(options);
  const html = renderer.parser([...tokens]);
  return sanitizeWorkspaceMessageHtml(typeof html === "string" ? html.trim() : "");
}

export function renderWorkspaceMessageBodySegments(
  document: WorkspaceMessageDocument,
  options: WorkspaceMessageRenderOptions = DEFAULT_WORKSPACE_MESSAGE_RENDER_OPTIONS,
): WorkspaceMessageSegmentRenderResult {
  if (!options.enableMarkdown) {
    return {
      segments: [{ kind: "html", html: sanitizeWorkspaceMessageHtml(renderPlainText(document)) }],
      metadata: document.metadata,
    };
  }

  const segments: WorkspaceMessageBodySegment[] = [];
  let pendingTokens: Token[] = [];
  const flushHtml = (): void => {
    const html = renderTokenGroup(pendingTokens, options);
    if (html.length > 0) {
      segments.push({ kind: "html", html });
    }
    pendingTokens = [];
  };

  const renderableTokens = selectRenderableWorkspaceBlockTokens(document.markdownTokens);
  for (const token of renderableTokens) {
    const quoteReference = getStandaloneWorkspaceQuoteReference(token);
    if (quoteReference == null) {
      pendingTokens.push(token);
      continue;
    }
    flushHtml();
    segments.push({ kind: "quote", reference: quoteReference });
  }
  flushHtml();

  return { segments, metadata: document.metadata };
}

export function renderWorkspaceMessageBody(
  document: WorkspaceMessageDocument,
  options: WorkspaceMessageRenderOptions = DEFAULT_WORKSPACE_MESSAGE_RENDER_OPTIONS,
): WorkspaceMessageRenderResult {
  const segmented = renderWorkspaceMessageBodySegments(document, options);
  const html = segmented.segments
    .map((segment) =>
      segment.kind === "html"
        ? segment.html
        : sanitizeWorkspaceMessageHtml(renderQuoteReferenceFallback(segment.reference)),
    )
    .join("");
  return { html, metadata: segmented.metadata };
}
