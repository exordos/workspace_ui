import { Marked, type Token, type Tokens, type TokensList } from "marked";
import {
  normalizeEmojiShortcodeName,
  resolveShortcodeToUnicode,
} from "~/shared/lib/emoji-shortcodes.lib";
import { parseWorkspaceReferenceUrn } from "../workspace-reference-urn.lib";
import { parseWorkspaceMessageFileHref } from "./workspace-message-file-reference.lib";
import type {
  WorkspaceMessageFileReference,
  WorkspaceMessageLastBlockKind,
  WorkspaceMessageMentionResolution,
  WorkspaceMessageParseOptions,
  WorkspaceMessageQuoteReference,
} from "./workspace-message-document.types";

export const WORKSPACE_MENTION_TOKEN_TYPE = "workspace_mention";
export const WORKSPACE_EMOJI_TOKEN_TYPE = "workspace_emoji";
export const WORKSPACE_FILE_TOKEN_TYPE = "workspace_file";
export const WORKSPACE_UNSUPPORTED_MEDIA_TOKEN_TYPE = "workspace_unsupported_media";
export const WORKSPACE_INLINE_SPOILER_TOKEN_TYPE = "workspace_inline_spoiler";
export const WORKSPACE_BLOCK_SPOILER_TOKEN_TYPE = "workspace_block_spoiler";
export const WORKSPACE_HISTORICAL_QUOTE_TOKEN_TYPE = "workspace_historical_quote";

const UUID_PATTERN_SOURCE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_PATTERN = new RegExp(`^${UUID_PATTERN_SOURCE}$`, "i");
const INLINE_TEXT_PATTERN = new RegExp(
  `<@(${UUID_PATTERN_SOURCE})>|(^|[\\s([{"'.,!?;:])@([A-Za-z0-9._-]{1,128})|:([A-Za-z0-9_+-]{1,128}):`,
  "gi",
);
const SPOILER_CODE_LANGUAGE_PATTERN = /^spoiler(?:[ \t]+([\s\S]*))?$/i;
const WHITESPACE_PATTERN = /\s+/g;
const DEFAULT_WORKSPACE_SPOILER_HEADER = "Spoiler";

export interface WorkspaceMentionMarkedToken extends Tokens.Generic {
  type: typeof WORKSPACE_MENTION_TOKEN_TYPE;
  displayText: string;
  userUuid?: string;
  unresolved?: boolean;
}

export interface WorkspaceEmojiMarkedToken extends Tokens.Generic {
  type: typeof WORKSPACE_EMOJI_TOKEN_TYPE;
  text: string;
  shortcode: string;
  unicode: string;
}

export interface WorkspaceFileMarkedToken extends Tokens.Generic {
  type: typeof WORKSPACE_FILE_TOKEN_TYPE;
  reference: WorkspaceMessageFileReference;
}

export interface WorkspaceUnsupportedMediaMarkedToken extends Tokens.Generic {
  type: typeof WORKSPACE_UNSUPPORTED_MEDIA_TOKEN_TYPE;
  label: string;
}

export interface WorkspaceInlineSpoilerMarkedToken extends Tokens.Generic {
  type: typeof WORKSPACE_INLINE_SPOILER_TOKEN_TYPE;
  tokens: Token[];
}

export interface WorkspaceBlockSpoilerMarkedToken extends Tokens.Generic {
  type: typeof WORKSPACE_BLOCK_SPOILER_TOKEN_TYPE;
  headerTokens: Token[];
  tokens: Token[];
}

export interface WorkspaceHistoricalQuoteMarkedToken extends Tokens.Generic {
  type: typeof WORKSPACE_HISTORICAL_QUOTE_TOKEN_TYPE;
  tokens: Token[];
}

export interface WorkspaceMarkdownFacts {
  hasInlineRich: boolean;
  hasRichBlocks: boolean;
  hasMentions: boolean;
  hasLinks: boolean;
  hasCodeBlocks: boolean;
  hasMedia: boolean;
  hasProtectedMedia: boolean;
  hasAttachments: boolean;
}

interface PrepareWorkspaceMarkdownOptions {
  parseOptions: WorkspaceMessageParseOptions;
  lexBlocks: (markdown: string) => TokensList;
}

function normalizeMentionDisplayText(displayText: string): string {
  return displayText.replace(WHITESPACE_PATTERN, " ").trim().replace(/^@+/, "");
}

function resolveMentionUserUuid(
  sourceUserUuid: string | undefined,
  resolvedUserUuid: string | undefined,
): string | undefined {
  if (sourceUserUuid != null && UUID_PATTERN.test(sourceUserUuid)) {
    return sourceUserUuid;
  }
  return resolvedUserUuid != null && resolvedUserUuid.length > 0 ? resolvedUserUuid : undefined;
}

function resolveMention(
  displayText: string,
  sourceUserUuid: string | undefined,
  options: WorkspaceMessageParseOptions,
): WorkspaceMentionMarkedToken {
  const normalizedDisplayText = normalizeMentionDisplayText(displayText);
  const resolution: WorkspaceMessageMentionResolution | null | undefined =
    options.resolveMention?.(normalizedDisplayText);
  const resolvedDisplayText = normalizeMentionDisplayText(
    resolution?.displayText ?? normalizedDisplayText,
  );
  const normalizedSourceUserUuid = sourceUserUuid?.trim();
  const resolvedUserUuid = resolution?.userUuid?.trim();
  const userUuid = resolveMentionUserUuid(normalizedSourceUserUuid, resolvedUserUuid);
  const mentionIsResolved = resolution != null && resolution.unresolved !== true;

  return {
    type: WORKSPACE_MENTION_TOKEN_TYPE,
    raw: sourceUserUuid == null ? `@${displayText}` : `<@${sourceUserUuid}>`,
    displayText: resolvedDisplayText.length > 0 ? resolvedDisplayText : normalizedDisplayText,
    ...(userUuid == null ? {} : { userUuid }),
    ...(!mentionIsResolved ? { unresolved: true } : {}),
  };
}

function createTextToken(text: string): Tokens.Text {
  return { type: "text", raw: text, text, escaped: false };
}

function createEmojiToken(raw: string, shortcode: string): WorkspaceEmojiMarkedToken | null {
  const unicode = resolveShortcodeToUnicode(shortcode);
  if (unicode == null) {
    return null;
  }
  return {
    type: WORKSPACE_EMOJI_TOKEN_TYPE,
    raw,
    text: raw,
    shortcode: normalizeEmojiShortcodeName(shortcode),
    unicode,
  };
}

function splitPlainText(text: string, options: WorkspaceMessageParseOptions): Token[] {
  if (text.length === 0) {
    return [];
  }

  const result: Token[] = [];
  let cursor = 0;
  INLINE_TEXT_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(INLINE_TEXT_PATTERN)) {
    const matchIndex = match.index ?? 0;
    const fullMatch = match[0] ?? "";
    const separator = match[2] ?? "";
    const startIndex = matchIndex + separator.length;
    if (startIndex > cursor) {
      result.push(createTextToken(text.slice(cursor, startIndex)));
    }

    const sourceUserUuid = match[1];
    const displayMention = match[3];
    const shortcode = match[4];
    if (sourceUserUuid != null && sourceUserUuid.length > 0) {
      result.push(resolveMention(sourceUserUuid, sourceUserUuid, options));
    } else if (displayMention != null && displayMention.length > 0) {
      result.push(resolveMention(displayMention, undefined, options));
    } else if (shortcode != null && shortcode.length > 0) {
      result.push(createEmojiToken(fullMatch, shortcode) ?? createTextToken(fullMatch));
    } else {
      result.push(createTextToken(fullMatch));
    }
    cursor = matchIndex + fullMatch.length;
  }

  if (cursor < text.length) {
    result.push(createTextToken(text.slice(cursor)));
  }
  return result.length > 0 ? result : [createTextToken(text)];
}

function splitTextWithSpoilers(text: string, options: WorkspaceMessageParseOptions): Token[] {
  if (!text.includes("||")) {
    return splitPlainText(text, options);
  }

  const result: Token[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const spoilerStart = text.indexOf("||", cursor);
    if (spoilerStart < 0) {
      result.push(...splitPlainText(text.slice(cursor), options));
      break;
    }
    const spoilerEnd = text.indexOf("||", spoilerStart + 2);
    if (spoilerEnd < 0) {
      result.push(...splitPlainText(text.slice(cursor), options));
      break;
    }
    if (spoilerStart > cursor) {
      result.push(...splitPlainText(text.slice(cursor, spoilerStart), options));
    }

    const spoilerText = text.slice(spoilerStart + 2, spoilerEnd);
    if (spoilerText.length === 0) {
      result.push(createTextToken("||||"));
    } else {
      result.push({
        type: WORKSPACE_INLINE_SPOILER_TOKEN_TYPE,
        raw: text.slice(spoilerStart, spoilerEnd + 2),
        tokens: splitPlainText(spoilerText, options),
      } satisfies WorkspaceInlineSpoilerMarkedToken);
    }
    cursor = spoilerEnd + 2;
  }

  return result.length > 0 ? result : [createTextToken(text)];
}

function plainTextFromTokens(tokens: readonly Token[]): string {
  return tokens
    .map((token) => {
      switch (token.type) {
        case "text":
        case "escape":
        case "codespan":
        case "html":
          return token.text;
        case WORKSPACE_EMOJI_TOKEN_TYPE:
          return (token as WorkspaceEmojiMarkedToken).unicode;
        case WORKSPACE_MENTION_TOKEN_TYPE:
          return (token as WorkspaceMentionMarkedToken).displayText;
        case "strong":
        case "em":
        case "del":
        case "link":
          return plainTextFromTokens(token.tokens ?? []);
        default:
          return "";
      }
    })
    .join("")
    .replace(WHITESPACE_PATTERN, " ")
    .trim();
}

function canStartStrongMention(prefix: string): boolean {
  if (!prefix.endsWith("@")) {
    return false;
  }
  return prefix.length === 1 || /[\s([{"'.,!?;:]$/.test(prefix.slice(0, -1));
}

function mergeStrongMentions(
  tokens: readonly Token[],
  options: WorkspaceMessageParseOptions,
): Token[] {
  const merged: Token[] = [];
  for (const token of tokens) {
    const previous = merged[merged.length - 1];
    if (
      token.type === "strong" &&
      previous?.type === "text" &&
      canStartStrongMention(previous.text)
    ) {
      const displayText = plainTextFromTokens(token.tokens ?? []);
      if (displayText.length > 0) {
        const prefix = previous.text.slice(0, -1);
        if (prefix.length > 0) {
          merged[merged.length - 1] = createTextToken(prefix);
        } else {
          merged.pop();
        }
        merged.push(resolveMention(displayText, undefined, options));
        continue;
      }
    }
    merged.push(token);
  }
  return merged;
}

function prepareInlineTokens(
  tokens: readonly Token[],
  options: WorkspaceMessageParseOptions,
): Token[] {
  const prepared = tokens.flatMap((token): Token[] => {
    switch (token.type) {
      case "text": {
        const nested = token.tokens;
        if (nested != null && nested.length > 0) {
          return prepareInlineTokens(nested, options);
        }
        return splitTextWithSpoilers(token.text, options);
      }
      case "escape":
        return [token];
      case "strong":
      case "em":
      case "del":
        token.tokens = prepareInlineTokens(token.tokens ?? [], options);
        return [token];
      case "link": {
        token.tokens = prepareInlineTokens(token.tokens ?? [], options);
        const workspaceReference = parseWorkspaceReferenceUrn(token.href);
        if (workspaceReference?.kind === "user") {
          return [resolveMention(token.text, workspaceReference.userUuid, options)];
        }
        const fileReference = parseWorkspaceMessageFileHref(token.href, token.text);
        if (fileReference != null) {
          return [
            {
              type: WORKSPACE_FILE_TOKEN_TYPE,
              raw: token.raw,
              reference: fileReference,
            } satisfies WorkspaceFileMarkedToken,
          ];
        }
        return [token];
      }
      case "image": {
        const fileReference = parseWorkspaceMessageFileHref(token.href, token.text);
        if (fileReference != null) {
          return [
            {
              type: WORKSPACE_FILE_TOKEN_TYPE,
              raw: token.raw,
              reference: fileReference,
            } satisfies WorkspaceFileMarkedToken,
          ];
        }
        return [
          {
            type: WORKSPACE_UNSUPPORTED_MEDIA_TOKEN_TYPE,
            raw: token.raw,
            label: token.text.length > 0 ? token.text : "Изображение",
          } satisfies WorkspaceUnsupportedMediaMarkedToken,
        ];
      }
      default:
        return [token];
    }
  });
  return mergeStrongMentions(prepared, options);
}

function prepareBlockTokens(tokens: Token[], options: PrepareWorkspaceMarkdownOptions): void {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token == null) {
      continue;
    }
    switch (token.type) {
      case "paragraph":
      case "heading":
        token.tokens = prepareInlineTokens(token.tokens ?? [], options.parseOptions);
        break;
      case "text":
        if (token.tokens != null) {
          token.tokens = prepareInlineTokens(token.tokens, options.parseOptions);
        }
        break;
      case "blockquote":
        prepareBlockTokens(token.tokens ?? [], options);
        break;
      case "list":
        for (const item of token.items) {
          prepareBlockTokens(item.tokens, options);
        }
        break;
      case "table":
        for (const cell of [...token.header, ...token.rows.flat()]) {
          cell.tokens = prepareInlineTokens(cell.tokens, options.parseOptions);
        }
        break;
      case "code": {
        tokens[index] = prepareCodeBlockToken(token as Tokens.Code, options);
        break;
      }
      default:
        break;
    }
  }
}

function prepareCodeBlockToken(
  token: Tokens.Code,
  options: PrepareWorkspaceMarkdownOptions,
): Token {
  const language = token.lang?.trim() ?? "";
  const spoilerMatch = SPOILER_CODE_LANGUAGE_PATTERN.exec(language);
  if (spoilerMatch != null) {
    const header = spoilerMatch[1]?.replace(WHITESPACE_PATTERN, " ").trim();
    const headerText =
      header == null || header.length === 0 ? DEFAULT_WORKSPACE_SPOILER_HEADER : header;
    const nestedTokens = options.lexBlocks(token.text);
    prepareBlockTokens(nestedTokens, options);
    return {
      type: WORKSPACE_BLOCK_SPOILER_TOKEN_TYPE,
      raw: token.raw,
      headerTokens: prepareInlineTokens([createTextToken(headerText)], options.parseOptions),
      tokens: nestedTokens,
    } satisfies WorkspaceBlockSpoilerMarkedToken;
  }
  if (language.toLowerCase() !== "quote") {
    return token;
  }

  const nestedTokens = options.lexBlocks(token.text);
  prepareBlockTokens(nestedTokens, options);
  return {
    type: WORKSPACE_HISTORICAL_QUOTE_TOKEN_TYPE,
    raw: token.raw,
    tokens: nestedTokens,
  } satisfies WorkspaceHistoricalQuoteMarkedToken;
}

export function createWorkspaceMarkdownLexer(): Marked {
  return new Marked({ gfm: true, breaks: true });
}

export function prepareWorkspaceMarkdownTokens(
  tokens: TokensList,
  options: PrepareWorkspaceMarkdownOptions,
): TokensList {
  prepareBlockTokens(tokens, options);
  return tokens;
}

export function getStandaloneWorkspaceQuoteReference(
  token: Token,
): WorkspaceMessageQuoteReference | null {
  if (token.type !== "paragraph" && token.type !== "text") {
    return null;
  }
  const inlineTokens = token.tokens;
  if (inlineTokens?.length !== 1) {
    return null;
  }
  const onlyToken = inlineTokens[0];
  if (onlyToken?.type !== "link") {
    return null;
  }
  const reference = parseWorkspaceReferenceUrn(onlyToken.href);
  if (reference?.kind !== "quote") {
    return null;
  }
  const fallbackAuthorLabel = plainTextFromTokens(onlyToken.tokens ?? []);
  return {
    messageUuid: reference.messageUuid,
    ...(reference.text == null ? {} : { selectedText: reference.text }),
    fallbackAuthorLabel,
  };
}

export function trimBlockBoundaryTokens(tokens: readonly Token[]): Token[] {
  const firstContentIndex = tokens.findIndex(
    (token) => token.type !== "space" && token.type !== "def",
  );
  if (firstContentIndex < 0) {
    return [];
  }

  let lastContentIndex = tokens.length - 1;
  while (
    lastContentIndex > firstContentIndex &&
    (tokens[lastContentIndex]?.type === "space" || tokens[lastContentIndex]?.type === "def")
  ) {
    lastContentIndex -= 1;
  }
  return tokens.slice(firstContentIndex, lastContentIndex + 1);
}

function findNearestVisualToken(
  tokens: readonly Token[],
  startIndex: number,
  step: -1 | 1,
): Token | undefined {
  for (let index = startIndex; index >= 0 && index < tokens.length; index += step) {
    const token = tokens[index];
    if (token != null && token.type !== "space" && token.type !== "def") {
      return token;
    }
  }
  return undefined;
}

export function removeStandaloneQuoteAdjacentSpaces(tokens: readonly Token[]): Token[] {
  const isStandaloneQuote = (token: Token | undefined): boolean =>
    token != null && getStandaloneWorkspaceQuoteReference(token) != null;

  return tokens.filter(
    (token, index) =>
      token.type !== "space" ||
      (!isStandaloneQuote(findNearestVisualToken(tokens, index - 1, -1)) &&
        !isStandaloneQuote(findNearestVisualToken(tokens, index + 1, 1))),
  );
}

/** Top-level tokens in the same shape the renderer turns into DOM blocks. */
export function selectRenderableWorkspaceBlockTokens(tokens: readonly Token[]): Token[] {
  return removeStandaloneQuoteAdjacentSpaces(trimBlockBoundaryTokens(tokens));
}

export function resolveWorkspaceMarkdownLastBlockKind(
  tokens: readonly Token[],
): WorkspaceMessageLastBlockKind {
  const renderableTokens = selectRenderableWorkspaceBlockTokens(tokens);
  const lastToken = renderableTokens[renderableTokens.length - 1];
  if (lastToken == null) {
    return "none";
  }
  if (getStandaloneWorkspaceQuoteReference(lastToken) != null) {
    return "quote-reference";
  }
  // Only a paragraph renders as a plain text flow container the meta can share a line with.
  if (lastToken.type !== "paragraph") {
    return "block";
  }

  // A trailing file placeholder is a fixed-size box, not text flow.
  const fileReferences: WorkspaceMessageFileReference[] = [];
  collectFiles([lastToken], fileReferences);
  return fileReferences.length > 0 ? "block" : "paragraph";
}

function createEmptyFacts(): WorkspaceMarkdownFacts {
  return {
    hasInlineRich: false,
    hasRichBlocks: false,
    hasMentions: false,
    hasLinks: false,
    hasCodeBlocks: false,
    hasMedia: false,
    hasProtectedMedia: false,
    hasAttachments: false,
  };
}

function inspectTokens(tokens: readonly Token[], facts: WorkspaceMarkdownFacts): void {
  for (const token of tokens) {
    switch (token.type) {
      case WORKSPACE_MENTION_TOKEN_TYPE:
        facts.hasInlineRich = true;
        facts.hasMentions = true;
        break;
      case WORKSPACE_EMOJI_TOKEN_TYPE:
      case WORKSPACE_INLINE_SPOILER_TOKEN_TYPE:
        facts.hasInlineRich = true;
        if (token.type === WORKSPACE_INLINE_SPOILER_TOKEN_TYPE) {
          inspectTokens((token as WorkspaceInlineSpoilerMarkedToken).tokens, facts);
        }
        break;
      case WORKSPACE_FILE_TOKEN_TYPE: {
        facts.hasInlineRich = true;
        const reference = (token as WorkspaceFileMarkedToken).reference;
        if (reference.kind === "media") {
          facts.hasMedia = true;
          facts.hasProtectedMedia = true;
        } else {
          facts.hasAttachments = true;
        }
        break;
      }
      case WORKSPACE_BLOCK_SPOILER_TOKEN_TYPE:
      case WORKSPACE_HISTORICAL_QUOTE_TOKEN_TYPE:
        facts.hasRichBlocks = true;
        inspectTokens(token.tokens ?? [], facts);
        break;
      case "heading":
      case "hr":
      case "table":
      case "blockquote":
      case "list":
        facts.hasRichBlocks = true;
        break;
      case "code":
        facts.hasRichBlocks = true;
        facts.hasCodeBlocks = true;
        break;
      case "strong":
      case "em":
      case "del":
      case "codespan":
        facts.hasInlineRich = true;
        break;
      case "link":
        facts.hasInlineRich = true;
        facts.hasLinks = true;
        break;
      default:
        break;
    }

    switch (token.type) {
      case "paragraph":
      case "heading":
      case "strong":
      case "em":
      case "del":
      case "link":
        inspectTokens(token.tokens ?? [], facts);
        break;
      case "text":
        inspectTokens(token.tokens ?? [], facts);
        break;
      case "blockquote":
        inspectTokens(token.tokens ?? [], facts);
        break;
      case "list":
        for (const item of token.items) {
          inspectTokens(item.tokens, facts);
        }
        break;
      case "table":
        for (const cell of [...token.header, ...token.rows.flat()]) {
          inspectTokens(cell.tokens, facts);
        }
        break;
      default:
        break;
    }
  }
}

export function inspectWorkspaceMarkdownTokens(tokens: TokensList): WorkspaceMarkdownFacts {
  const facts = createEmptyFacts();
  inspectTokens(tokens, facts);
  return facts;
}

function collectFiles(tokens: readonly Token[], references: WorkspaceMessageFileReference[]): void {
  for (const token of tokens) {
    if (token.type === WORKSPACE_FILE_TOKEN_TYPE) {
      references.push((token as WorkspaceFileMarkedToken).reference);
      continue;
    }
    switch (token.type) {
      case "paragraph":
      case "heading":
      case "strong":
      case "em":
      case "del":
      case "link":
        collectFiles(token.tokens ?? [], references);
        break;
      case "text":
        collectFiles(token.tokens ?? [], references);
        break;
      case "blockquote":
        collectFiles(token.tokens ?? [], references);
        break;
      case "list":
        for (const item of token.items) {
          collectFiles(item.tokens, references);
        }
        break;
      case "table":
        for (const cell of [...token.header, ...token.rows.flat()]) {
          collectFiles(cell.tokens, references);
        }
        break;
      case WORKSPACE_INLINE_SPOILER_TOKEN_TYPE:
      case WORKSPACE_BLOCK_SPOILER_TOKEN_TYPE:
      case WORKSPACE_HISTORICAL_QUOTE_TOKEN_TYPE:
        collectFiles(token.tokens ?? [], references);
        break;
      default:
        break;
    }
  }
}

export function collectWorkspaceMarkdownFileReferences(
  tokens: TokensList,
): readonly WorkspaceMessageFileReference[] {
  const references: WorkspaceMessageFileReference[] = [];
  collectFiles(tokens, references);
  return references;
}
