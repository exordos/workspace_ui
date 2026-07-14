import { marked, type Token, type Tokens } from "marked";
import {
  normalizeEmojiShortcodeName,
  resolveShortcodeToUnicode,
} from "~/shared/lib/emoji-shortcodes.lib";
import { parseWorkspaceReferenceUrn } from "../workspace-reference-urn.lib";
import type {
  WorkspaceMessageBlock,
  WorkspaceMessageBodyMetadata,
  WorkspaceMessageDocument,
  WorkspaceMessageFileReference,
  WorkspaceMessageInline,
  WorkspaceMessageListItem,
  WorkspaceMessageParseOptions,
} from "./workspace-message-document.types";

const LINE_BREAK_PATTERN = /\r\n?|\n/;
const NORMALIZE_LINE_BREAK_PATTERN = /\r\n?|\n/g;
const WHITESPACE_PATTERN = /\s+/g;
const URL_ONLY_PATTERN = /^(?:https?:\/\/|mailto:)[^\s]+$/i;
const UUID_PATTERN_SOURCE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_PATTERN = new RegExp(`^${UUID_PATTERN_SOURCE}$`, "i");
const POSITIVE_INTEGER_PATTERN = /^[0-9]+$/;
const WORKSPACE_FILE_URN_PATTERN = new RegExp(
  `^urn:(image|video|file):(${UUID_PATTERN_SOURCE})(?:\\?([\\s\\S]*))?$`,
  "i",
);
const SPOILER_CODE_LANGUAGE_PATTERN = /^spoiler(?:[ \t]+([\s\S]*))?$/i;
const PLAIN_TEXT_INLINE_PATTERN = new RegExp(
  `<@(${UUID_PATTERN_SOURCE})>|(^|[\\s([{"'.,!?;:])@([A-Za-z0-9._-]{1,128})|:([A-Za-z0-9_+-]{1,128}):`,
  "gi",
);
const DEFAULT_WORKSPACE_SPOILER_HEADER = "Spoiler";

interface WorkspaceMessageParseState {
  hasInlineRich: boolean;
  hasRichBlocks: boolean;
  hasMentions: boolean;
  hasLinks: boolean;
  hasCodeBlocks: boolean;
  hasMedia: boolean;
  hasProtectedMedia: boolean;
  hasAttachments: boolean;
  leadingKind: "text" | "image" | "video" | "file" | "quote" | "code";
}

interface WorkspaceMessageParseContext {
  options: WorkspaceMessageParseOptions;
  state: WorkspaceMessageParseState;
}

type ParsedWorkspaceFileType = "image" | "video" | "file";

interface ParsedWorkspaceFileUrn {
  type: ParsedWorkspaceFileType;
  fileUuid: string;
  searchParams: URLSearchParams;
  href: string;
}

function normalizeLineBreaks(value: string): string {
  return value.replaceAll(NORMALIZE_LINE_BREAK_PATTERN, "\n");
}

function normalizePreviewText(value: string): string {
  return value.replace(WHITESPACE_PATTERN, " ").trim();
}

function hasLineBreak(markdown: string): boolean {
  return LINE_BREAK_PATTERN.test(markdown);
}

function createParseState(): WorkspaceMessageParseState {
  return {
    hasInlineRich: false,
    hasRichBlocks: false,
    hasMentions: false,
    hasLinks: false,
    hasCodeBlocks: false,
    hasMedia: false,
    hasProtectedMedia: false,
    hasAttachments: false,
    leadingKind: "text",
  };
}

function isReadableLinkLabel(label: string, href: string): boolean {
  const normalizedLabel = normalizePreviewText(label);
  return (
    normalizedLabel.length > 0 &&
    normalizedLabel !== href &&
    !URL_ONLY_PATTERN.test(normalizedLabel)
  );
}

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  const normalized = value?.replace(WHITESPACE_PATTERN, " ").trim();
  return normalized == null || normalized.length === 0 ? undefined : normalized;
}

function parsePositiveIntegerParam(searchParams: URLSearchParams, key: string): number | undefined {
  const rawValue = normalizeOptionalText(searchParams.get(key));
  if (rawValue == null) {
    return undefined;
  }
  if (!POSITIVE_INTEGER_PATTERN.test(rawValue)) {
    return undefined;
  }

  const parsed = Number(rawValue);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseWorkspaceFileUrn(href: string): ParsedWorkspaceFileUrn | null {
  const trimmed = href.trim();
  const match = WORKSPACE_FILE_URN_PATTERN.exec(trimmed);
  if (match == null) {
    return null;
  }

  const type = match[1]?.toLowerCase();
  if (type !== "image" && type !== "video" && type !== "file") {
    return null;
  }
  const fileUuid = match[2];
  if (fileUuid == null || !UUID_PATTERN.test(fileUuid)) {
    return null;
  }

  return {
    type,
    fileUuid,
    searchParams: new URLSearchParams(match[3] ?? ""),
    href: trimmed,
  };
}

function parseWorkspaceFileHref(href: string, label: string): WorkspaceMessageFileReference | null {
  const parsed = parseWorkspaceFileUrn(href);
  if (parsed == null) {
    return null;
  }

  const labelName = normalizeOptionalText(label);
  const queryName = normalizeOptionalText(parsed.searchParams.get("name"));
  const name = queryName ?? labelName;
  const contentType = normalizeOptionalText(parsed.searchParams.get("content_type"));
  const width = parsePositiveIntegerParam(parsed.searchParams, "w");
  const height = parsePositiveIntegerParam(parsed.searchParams, "h");
  const sizeBytes = parsePositiveIntegerParam(parsed.searchParams, "size");
  const mediaKind = parsed.type === "image" || parsed.type === "video" ? parsed.type : undefined;
  const kind = mediaKind == null ? "attachment" : "media";

  return {
    kind,
    href: parsed.href,
    fileUuid: parsed.fileUuid,
    ...(name == null ? {} : { name }),
    ...(contentType == null ? {} : { contentType }),
    ...(width == null ? {} : { width }),
    ...(height == null ? {} : { height }),
    ...(sizeBytes == null ? {} : { sizeBytes }),
    ...(mediaKind == null ? {} : { mediaKind }),
  };
}

function applyWorkspaceFileState(
  reference: WorkspaceMessageFileReference,
  context: WorkspaceMessageParseContext,
): void {
  context.state.hasInlineRich = true;

  if (reference.kind === "media") {
    context.state.hasMedia = true;
    context.state.hasProtectedMedia = true;
    if (context.state.leadingKind === "text") {
      context.state.leadingKind = reference.mediaKind ?? "image";
    }
    return;
  }

  context.state.hasAttachments = true;
  if (context.state.leadingKind === "text") {
    context.state.leadingKind = "file";
  }
}

function summarizeInlineForPreview(children: readonly WorkspaceMessageInline[]): string {
  return normalizePreviewText(
    children
      .map((child) => {
        switch (child.kind) {
          case "text":
          case "code":
            return child.text;
          case "spoiler":
            return summarizeInlineForPreview(child.children);
          case "break":
            return " ";
          case "emphasis":
          case "strong":
            return summarizeInlineForPreview(child.children);
          case "unsupported-media":
            return "Изображение";
          case "file":
            if (child.reference.kind === "media") {
              return child.reference.mediaKind === "video" ? "Видео" : "Изображение";
            }
            return child.reference.name != null ? `Файл: ${child.reference.name}` : "Файл";
          case "mention":
            return `@${child.displayText}`;
          case "emoji":
            return child.unicode;
          case "link": {
            const label = summarizeInlineForPreview(child.children);
            if (isReadableLinkLabel(label, child.href)) {
              return label;
            }
            return label.length > 0 ? label : child.href;
          }
          default:
            return "";
        }
      })
      .join(" "),
  );
}

function summarizeBlocksForPreview(blocks: readonly WorkspaceMessageBlock[]): string {
  const ownBlocks = blocks.filter((block) => block.kind !== "quote");
  const blocksForPreview = ownBlocks.length > 0 ? ownBlocks : blocks;

  return normalizePreviewText(
    blocksForPreview
      .map((block) => {
        switch (block.kind) {
          case "paragraph":
            return summarizeInlineForPreview(block.children);
          case "quote":
            return `Цитата: ${summarizeBlocksForPreview(block.blocks)}`;
          case "code":
            return `Код: ${normalizePreviewText(block.text)}`;
          case "spoiler":
            return summarizeBlocksForPreview(block.blocks);
          case "list":
            return block.items
              .map((item, index) => {
                const marker = block.ordered ? `${(block.start ?? 1) + index}.` : "•";
                return `${marker} ${summarizeBlocksForPreview(item.blocks)}`;
              })
              .join(" ");
          default:
            return "";
        }
      })
      .join(" "),
  );
}

function toParagraphFromText(text: string): WorkspaceMessageBlock | null {
  if (text.length === 0) {
    return null;
  }
  return {
    kind: "paragraph",
    children: [{ kind: "text", text }],
  };
}

function normalizeMentionDisplayText(displayText: string): string {
  return displayText.replace(WHITESPACE_PATTERN, " ").trim().replace(/^@+/, "");
}

function mentionDisplayTextFromInline(children: readonly WorkspaceMessageInline[]): string {
  return normalizePreviewText(
    children
      .map((child) => {
        switch (child.kind) {
          case "text":
          case "code":
            return child.text;
          case "spoiler":
            return mentionDisplayTextFromInline(child.children);
          case "break":
            return " ";
          case "emphasis":
          case "strong":
            return mentionDisplayTextFromInline(child.children);
          case "mention":
            return child.displayText;
          case "emoji":
            return child.unicode;
          case "link":
            return mentionDisplayTextFromInline(child.children);
          case "file":
            return child.reference.name ?? child.reference.fileUuid;
          case "unsupported-media":
            return child.label;
          default:
            return "";
        }
      })
      .join(" "),
  );
}

function createMentionInline(
  displayText: string,
  context: WorkspaceMessageParseContext,
  sourceUserUuid?: string,
): WorkspaceMessageInline {
  const normalizedDisplayText = normalizeMentionDisplayText(displayText);
  const resolution = context.options.resolveMention?.(normalizedDisplayText);
  const resolvedDisplayText = normalizeMentionDisplayText(
    resolution?.displayText ?? normalizedDisplayText,
  );
  const resolvedUserUuid = resolution?.userUuid?.trim();
  const normalizedSourceUserUuid = sourceUserUuid?.trim();
  const sourceUserUuidIsValid =
    normalizedSourceUserUuid != null && UUID_PATTERN.test(normalizedSourceUserUuid);
  const userUuid = sourceUserUuidIsValid
    ? normalizedSourceUserUuid
    : resolvedUserUuid != null && resolvedUserUuid.length > 0
      ? resolvedUserUuid
      : undefined;
  const mentionIsResolved = resolution != null && resolution.unresolved !== true;

  context.state.hasInlineRich = true;
  context.state.hasMentions = true;

  if (userUuid != null && userUuid.length > 0 && mentionIsResolved) {
    return {
      kind: "mention",
      displayText: resolvedDisplayText.length > 0 ? resolvedDisplayText : normalizedDisplayText,
      userUuid,
    };
  }

  return {
    kind: "mention",
    displayText: resolvedDisplayText.length > 0 ? resolvedDisplayText : normalizedDisplayText,
    ...(sourceUserUuidIsValid ? { userUuid: normalizedSourceUserUuid } : {}),
    unresolved: true,
  };
}

function createKnownEmojiShortcodeInline(
  text: string,
  rawShortcode: string,
): WorkspaceMessageInline | null {
  const unicode = resolveShortcodeToUnicode(rawShortcode);
  if (unicode == null) {
    return null;
  }

  return {
    kind: "emoji",
    text,
    shortcode: normalizeEmojiShortcodeName(rawShortcode),
    unicode,
  };
}

function parseTextWithMentionsAndEmoji(
  text: string,
  context: WorkspaceMessageParseContext,
): readonly WorkspaceMessageInline[] {
  if (text.length === 0) {
    return [];
  }

  const parts: WorkspaceMessageInline[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(PLAIN_TEXT_INLINE_PATTERN)) {
    const fullMatch = match[0] ?? "";
    const canonicalUserUuid = match[1] ?? "";
    const separator = match[2] ?? "";
    const displayText = match[3] ?? "";
    const rawShortcode = match[4] ?? "";
    if (rawShortcode.length > 0) {
      const shortcodeStart = match.index;
      const shortcodeEnd = shortcodeStart + fullMatch.length;
      if (shortcodeStart > lastIndex) {
        parts.push({ kind: "text", text: text.slice(lastIndex, shortcodeStart) });
      }

      const emoji = createKnownEmojiShortcodeInline(fullMatch, rawShortcode);
      if (emoji == null) {
        // Workspace пока не имеет custom emoji resolver-а для тела сообщения.
        // Неизвестный shortcode оставляем исходным текстом: так custom emoji не
        // пропадает и не получает URL из старого realm catalog.
        parts.push({ kind: "text", text: fullMatch });
      } else {
        context.state.hasInlineRich = true;
        parts.push(emoji);
      }

      lastIndex = shortcodeEnd;
      continue;
    }

    if (canonicalUserUuid.length > 0) {
      const mentionStart = match.index;
      const mentionEnd = mentionStart + fullMatch.length;

      if (mentionStart > lastIndex) {
        parts.push({ kind: "text", text: text.slice(lastIndex, mentionStart) });
      }

      parts.push(createMentionInline(canonicalUserUuid, context, canonicalUserUuid));
      lastIndex = mentionEnd;
      continue;
    }

    const mentionStart = match.index + separator.length;

    if (mentionStart > lastIndex) {
      parts.push({ kind: "text", text: text.slice(lastIndex, mentionStart) });
    }

    if (displayText.length > 0) {
      parts.push(createMentionInline(displayText, context));
    } else {
      parts.push({ kind: "text", text: fullMatch.slice(separator.length) });
    }

    lastIndex = mentionStart + displayText.length + 1;
  }

  if (lastIndex < text.length) {
    parts.push({ kind: "text", text: text.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ kind: "text", text }];
}

function parseTextWithMentions(
  text: string,
  context: WorkspaceMessageParseContext,
): readonly WorkspaceMessageInline[] {
  if (!text.includes("||")) {
    return parseTextWithMentionsAndEmoji(text, context);
  }

  const parts: WorkspaceMessageInline[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const spoilerStart = text.indexOf("||", cursor);
    if (spoilerStart < 0) {
      parts.push(...parseTextWithMentionsAndEmoji(text.slice(cursor), context));
      break;
    }

    const spoilerEnd = text.indexOf("||", spoilerStart + 2);
    if (spoilerEnd < 0) {
      parts.push(...parseTextWithMentionsAndEmoji(text.slice(cursor), context));
      break;
    }

    if (spoilerStart > cursor) {
      parts.push(...parseTextWithMentionsAndEmoji(text.slice(cursor, spoilerStart), context));
    }

    const spoilerText = text.slice(spoilerStart + 2, spoilerEnd);
    if (spoilerText.length === 0) {
      parts.push({ kind: "text", text: "||||" });
    } else {
      context.state.hasInlineRich = true;
      parts.push({
        kind: "spoiler",
        children: parseTextWithMentionsAndEmoji(spoilerText, context),
      });
    }

    cursor = spoilerEnd + 2;
  }

  return parts.length > 0 ? parts : [{ kind: "text", text }];
}

function canStartStrongMention(prefix: string): boolean {
  if (!prefix.endsWith("@")) {
    return false;
  }
  if (prefix.length === 1) {
    return true;
  }
  return /[\s([{"'.,!?;:]$/.test(prefix.slice(0, -1));
}

function mergeMarkedStrongMentions(
  children: readonly WorkspaceMessageInline[],
  context: WorkspaceMessageParseContext,
): readonly WorkspaceMessageInline[] {
  const merged: WorkspaceMessageInline[] = [];

  for (const child of children) {
    const previous = merged[merged.length - 1];

    if (
      child.kind === "strong" &&
      previous?.kind === "text" &&
      canStartStrongMention(previous.text)
    ) {
      const displayText = mentionDisplayTextFromInline(child.children);
      if (displayText.length > 0) {
        const prefix = previous.text.slice(0, -1);
        if (prefix.length > 0) {
          merged[merged.length - 1] = { kind: "text", text: prefix };
        } else {
          merged.pop();
        }
        // Convert Zulip-compatible `@**Name**` text into the Workspace model:
        // keep the visible name in the document and resolve clicks from UUIDs.
        merged.push(createMentionInline(displayText, context));
        continue;
      }
    }

    merged.push(child);
  }

  return merged;
}

function parseInlineTokens(
  tokens: readonly Token[] | undefined,
  fallbackText: string,
  context: WorkspaceMessageParseContext,
): readonly WorkspaceMessageInline[] {
  if (tokens == null || tokens.length === 0) {
    return parseTextWithMentions(fallbackText, context);
  }

  const children = tokens.flatMap((token): WorkspaceMessageInline[] => {
    switch (token.type) {
      case "text": {
        const nestedTokens = (token as Tokens.Text).tokens;
        if (nestedTokens != null && nestedTokens.length > 0) {
          return [...parseInlineTokens(nestedTokens, (token as Tokens.Text).text, context)];
        }
        return [...parseTextWithMentions((token as Tokens.Text).text, context)];
      }
      case "escape":
        return [...parseTextWithMentions((token as Tokens.Escape).text, context)];
      case "br":
        return [{ kind: "break" }];
      case "em":
        context.state.hasInlineRich = true;
        return [
          {
            kind: "emphasis",
            children: parseInlineTokens(
              (token as Tokens.Em).tokens,
              (token as Tokens.Em).text,
              context,
            ),
          },
        ];
      case "strong":
        context.state.hasInlineRich = true;
        return [
          {
            kind: "strong",
            children: parseInlineTokens(
              (token as Tokens.Strong).tokens,
              (token as Tokens.Strong).text,
              context,
            ),
          },
        ];
      case "codespan":
        context.state.hasInlineRich = true;
        return [{ kind: "code", text: (token as Tokens.Codespan).text }];
      case "link":
        context.state.hasInlineRich = true;
        {
          const link = token as Tokens.Link;
          const workspaceReference = parseWorkspaceReferenceUrn(link.href);
          if (workspaceReference?.kind === "user") {
            return [createMentionInline(link.text, context, workspaceReference.userUuid)];
          }

          if (workspaceReference?.kind === "message") {
            context.state.hasLinks = true;
            return [
              {
                kind: "link",
                href: link.href,
                title: link.title ?? undefined,
                workspaceMessageUuid: workspaceReference.messageUuid,
                workspaceReference,
                children: parseInlineTokens(link.tokens, link.text, context),
              },
            ];
          }

          if (workspaceReference?.kind === "stream" || workspaceReference?.kind === "topic") {
            context.state.hasLinks = true;
            return [
              {
                kind: "link",
                href: link.href,
                title: link.title ?? undefined,
                workspaceReference,
                children: parseInlineTokens(link.tokens, link.text, context),
              },
            ];
          }

          const reference = parseWorkspaceFileHref(link.href, link.text);
          if (reference != null) {
            applyWorkspaceFileState(reference, context);
            return [{ kind: "file", reference }];
          }
        }
        context.state.hasLinks = true;
        return [
          {
            kind: "link",
            href: (token as Tokens.Link).href,
            title: (token as Tokens.Link).title ?? undefined,
            children: parseInlineTokens(
              (token as Tokens.Link).tokens,
              (token as Tokens.Link).text,
              context,
            ),
          },
        ];
      case "image": {
        const image = token as Tokens.Image;
        const reference = parseWorkspaceFileHref(image.href, image.text);
        if (reference != null) {
          applyWorkspaceFileState(reference, context);
          return [{ kind: "file", reference }];
        }
        // Фаза 2 не включает protected media: картинка остается читаемым
        // маркером, а не превращается в media tag, скачивание или viewer item.
        context.state.hasInlineRich = true;
        if (context.state.leadingKind === "text") {
          context.state.leadingKind = "image";
        }
        return [{ kind: "unsupported-media", label: image.text.trim() || "Изображение" }];
      }
      case "html":
        // Raw HTML из markdown не считается доверенным rich-контентом.
        // Сохраняем его как текст, чтобы sanitize boundary был последней
        // защитой, а не единственным барьером.
        return [...parseTextWithMentions((token as Tokens.HTML).text, context)];
      default:
        return [...parseTextWithMentions(token.raw, context)];
    }
  });

  return mergeMarkedStrongMentions(children, context);
}

function parseListItem(
  item: Tokens.ListItem,
  context: WorkspaceMessageParseContext,
): WorkspaceMessageListItem {
  return {
    blocks: parseBlockTokens(item.tokens, context),
  };
}

function parseOrderedListStart(list: Tokens.List): number | undefined {
  if (!list.ordered) {
    return undefined;
  }
  const parsedStart =
    typeof list.start === "number" ? list.start : Number.parseInt(String(list.start || "1"), 10);
  return Number.isFinite(parsedStart) ? parsedStart : 1;
}

function parseSpoilerCodeBlock(
  code: Tokens.Code,
  context: WorkspaceMessageParseContext,
): WorkspaceMessageBlock | null {
  const language = code.lang?.trim() ?? "";
  const match = SPOILER_CODE_LANGUAGE_PATTERN.exec(language);
  if (match == null) {
    return null;
  }

  const headerText = normalizeOptionalText(match[1]) ?? DEFAULT_WORKSPACE_SPOILER_HEADER;
  context.state.hasRichBlocks = true;
  return {
    kind: "spoiler",
    header: parseInlineTokens(undefined, headerText, context),
    blocks: parseBlockTokens(marked.lexer(code.text), context),
  };
}

function parseHistoricalQuoteCodeBlock(
  code: Tokens.Code,
  context: WorkspaceMessageParseContext,
): WorkspaceMessageBlock | null {
  if ((code.lang?.trim() ?? "").toLowerCase() !== "quote") {
    return null;
  }

  context.state.hasRichBlocks = true;
  if (context.state.leadingKind === "text") {
    context.state.leadingKind = "quote";
  }

  // Historical Zulip quote fences are read-only input. Parse their body into
  // the Workspace document model, but never emit this format from composer code.
  return {
    kind: "quote",
    blocks: parseBlockTokens(marked.lexer(code.text), context),
  };
}

function parseBlockTokens(
  tokens: readonly Token[],
  context: WorkspaceMessageParseContext,
): readonly WorkspaceMessageBlock[] {
  return tokens.flatMap((token): WorkspaceMessageBlock[] => {
    switch (token.type) {
      case "space":
        return [];
      case "paragraph": {
        const paragraph = token as Tokens.Paragraph;
        return [
          {
            kind: "paragraph",
            children: parseInlineTokens(paragraph.tokens, paragraph.text, context),
          },
        ];
      }
      case "text": {
        const textToken = token as Tokens.Text;
        return [
          {
            kind: "paragraph",
            children: parseInlineTokens(textToken.tokens, textToken.text, context),
          },
        ];
      }
      case "blockquote": {
        const quote = token as Tokens.Blockquote;
        context.state.hasRichBlocks = true;
        if (context.state.leadingKind === "text") {
          context.state.leadingKind = "quote";
        }
        return [
          {
            kind: "quote",
            // Workspace composer сейчас вставляет reply как обычный markdown
            // blockquote `> Автор: текст`. Отдельного native quote payload с
            // message UUID нет, поэтому render core поддерживает безопасный
            // blockquote и не пытается восстановить старый Zulip quote contract.
            blocks: parseBlockTokens(quote.tokens, context),
          },
        ];
      }
      case "code": {
        const code = token as Tokens.Code;
        const spoiler = parseSpoilerCodeBlock(code, context);
        if (spoiler != null) {
          return [spoiler];
        }
        const historicalQuote = parseHistoricalQuoteCodeBlock(code, context);
        if (historicalQuote != null) {
          return [historicalQuote];
        }
        context.state.hasRichBlocks = true;
        context.state.hasCodeBlocks = true;
        if (context.state.leadingKind === "text") {
          context.state.leadingKind = "code";
        }
        return [
          {
            kind: "code",
            text: code.text,
            language: code.lang,
          },
        ];
      }
      case "list": {
        const list = token as Tokens.List;
        context.state.hasRichBlocks = true;
        return [
          {
            kind: "list",
            ordered: list.ordered,
            start: parseOrderedListStart(list),
            items: list.items.map((item) => parseListItem(item, context)),
          },
        ];
      }
      case "html":
        return [toParagraphFromText((token as Tokens.HTML).text)].filter(
          (block): block is WorkspaceMessageBlock => block != null,
        );
      default:
        return [toParagraphFromText(token.raw)].filter(
          (block): block is WorkspaceMessageBlock => block != null,
        );
    }
  });
}

function buildMetadata(
  markdown: string,
  blocks: readonly WorkspaceMessageBlock[],
  state: WorkspaceMessageParseState,
  textPreview: string,
): WorkspaceMessageBodyMetadata {
  const hasRichBlocks = state.hasRichBlocks || blocks.length > 1;
  const contentKind = state.hasMedia
    ? "media"
    : state.hasAttachments
      ? "attachment"
      : hasRichBlocks
        ? "block-rich"
        : state.hasInlineRich
          ? "inline-rich"
          : "plain";
  return {
    contentKind,
    hasRichBlocks,
    hasMentions: state.hasMentions,
    hasLinks: state.hasLinks,
    hasCodeBlocks: state.hasCodeBlocks,
    hasMedia: state.hasMedia,
    hasProtectedMedia: state.hasProtectedMedia,
    hasAttachments: state.hasAttachments,
    preferredMetaPlacement:
      hasRichBlocks || state.hasMedia || state.hasAttachments || hasLineBreak(markdown)
        ? "row"
        : "inline",
    textPreview,
  };
}

export function parseWorkspaceMessageBody(
  markdown: string,
  options: WorkspaceMessageParseOptions = {},
): WorkspaceMessageDocument {
  const sourceMarkdown = normalizeLineBreaks(markdown);
  const state = createParseState();
  const context: WorkspaceMessageParseContext = { options, state };
  const tokens = marked.lexer(sourceMarkdown, {
    breaks: true,
    gfm: true,
  });
  const blocks = parseBlockTokens(tokens, context);
  const safeTextPreview = summarizeBlocksForPreview(blocks);

  // Документ строится один раз: дальше и bubble-render, и summary читают
  // готовые блоки, а не парсят markdown повторно с разными условиями.
  return {
    sourceMarkdown,
    blocks,
    metadata: buildMetadata(sourceMarkdown, blocks, state, safeTextPreview),
    safeTextPreview,
  };
}
