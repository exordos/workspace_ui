/**
 * Client-side message body display: detect Zulip-rendered HTML vs Markdown, render Markdown
 * with `marked` + syntax highlighting, produce plain-text previews.
 *
 * Used when GET /messages uses `apply_markdown=false` (body is Markdown) and for composer
 * preview fallback. Real-time events may still deliver rendered HTML — `isLikelyRenderedMessageHtml`
 * picks the safe path before `sanitizeHtml`.
 *
 * Usage:
 *   import {
 *     isLikelyRenderedMessageHtml,
 *     messageBodyToUnsanitizedDisplayHtml,
 *     plainTextPreviewFromMessageBody,
 *   } from "~/shared/lib/message-markdown-display.lib";
 */
import hljs from "highlight.js/lib/common";
import { Marked, type Token, type TokenizerAndRendererExtension, type Tokens } from "marked";
import { stripHtml } from "~/shared/lib/html";
import { renderEmojiShortcodesInHtml } from "~/shared/lib/message-emoji-shortcodes.lib";
import { createInlineUserUploadVideoElement } from "~/shared/lib/message-inline-user-upload-video.lib";
import {
  injectZulipMentionPlaceholders,
  restoreZulipMentionPlaceholders,
} from "~/shared/lib/message-zulip-mentions.lib";
import {
  isUserUploadImagePath,
  toUserUploadThumbnailUrl,
} from "~/shared/lib/protected-message-media-thumbnail";
import { isUserUploadVideoPath } from "~/shared/lib/user-upload-media-path.lib";

const LANGUAGE_CLASS_PATTERN = /\b(?:language|lang)-([a-z0-9#+-]+)\b/i;

const LANGUAGE_ALIASES: Record<string, string> = {
  cjs: "javascript",
  jsx: "javascript",
  py: "python",
  sh: "bash",
  ts: "typescript",
  tsx: "typescript",
};

function resolveLanguageFromClassName(className: string): string | null {
  const match = LANGUAGE_CLASS_PATTERN.exec(className);
  if (match == null) {
    return null;
  }
  const rawLanguage = match[1]?.toLowerCase();
  if (rawLanguage == null || rawLanguage.length === 0) {
    return null;
  }
  const normalizedLanguage = LANGUAGE_ALIASES[rawLanguage] ?? rawLanguage;
  return hljs.getLanguage(normalizedLanguage) ? normalizedLanguage : null;
}

interface InlineSpoilerToken extends Tokens.Generic {
  type: "inline_spoiler";
  text: string;
  tokens: Token[];
}

interface ZulipBlockSpoilerToken extends Tokens.Generic {
  type: "zulip_block_spoiler";
  header: string;
  headerTokens: Token[];
  text: string;
  tokens: Token[];
}

const INLINE_SPOILER_TOKEN_TYPE = "inline_spoiler";
const ZULIP_BLOCK_SPOILER_TOKEN_TYPE = "zulip_block_spoiler";
const DEFAULT_ZULIP_SPOILER_HEADER = "Spoiler";

// Расширение marked для локального fallback-рендера:
// превращает `||secret||` в интерактивный inline-элемент спойлера для bubble.
const INLINE_SPOILER_EXTENSION: TokenizerAndRendererExtension = {
  level: "inline",
  name: INLINE_SPOILER_TOKEN_TYPE,
  start(src) {
    // Оптимизация: подсказываем marked, где потенциально начинается inline spoiler.
    const index = src.indexOf("||");
    return index >= 0 ? index : undefined;
  },
  tokenizer(src) {
    // Поддерживаем только scoped-синтаксис `||...||` для bubble fallback-рендера.
    if (!src.startsWith("||")) return undefined;
    const match = /^\|\|([\s\S]+?)\|\|/.exec(src);
    if (match == null) return undefined;
    const raw = match[0];
    const text = match[1] ?? "";
    return {
      type: INLINE_SPOILER_TOKEN_TYPE,
      raw,
      text,
      tokens: this.lexer.inlineTokens(text),
    };
  },
  renderer(token) {
    if (token.type !== INLINE_SPOILER_TOKEN_TYPE) return false;
    const spoilerToken = token as InlineSpoilerToken;
    // Внутренний markdown внутри spoiler (например, emphasis) рендерим штатным parseInline.
    const inlineHtml = this.parser.parseInline(spoilerToken.tokens);
    return `<span class="inline-spoiler" data-inline-spoiler="true">${inlineHtml}</span>`;
  },
};

// Поддержка Zulip markdown-синтаксиса блочного спойлера:
// ```spoiler optional header
// content
// ```
// Рендерим нативную для bubble структуру аккордеона:
// `.spoiler-block > .spoiler-header + .spoiler-content`.
const ZULIP_BLOCK_SPOILER_EXTENSION: TokenizerAndRendererExtension = {
  level: "block",
  name: ZULIP_BLOCK_SPOILER_TOKEN_TYPE,
  start(src) {
    const index = src.indexOf("```spoiler");
    return index >= 0 ? index : undefined;
  },
  tokenizer(src) {
    if (!src.startsWith("```spoiler")) return undefined;
    const match = /^```spoiler(?:[ \t]+([^\n`]*))?[ \t]*\n([\s\S]*?)\n```(?:\n|$)/.exec(src);
    if (match == null) return undefined;
    const raw = match[0];
    const header = (match[1] ?? "").trim();
    const text = match[2] ?? "";
    const headerMarkdown = header.length > 0 ? header : DEFAULT_ZULIP_SPOILER_HEADER;
    return {
      type: ZULIP_BLOCK_SPOILER_TOKEN_TYPE,
      raw,
      header,
      headerTokens: this.lexer.inlineTokens(headerMarkdown),
      text,
      tokens: this.lexer.blockTokens(text, []),
    };
  },
  childTokens: ["tokens", "headerTokens"],
  renderer(token) {
    if (token.type !== ZULIP_BLOCK_SPOILER_TOKEN_TYPE) return false;
    const spoilerToken = token as ZulipBlockSpoilerToken;
    const blockHtml = this.parser.parse(spoilerToken.tokens);
    const headerHtml = this.parser.parseInline(spoilerToken.headerTokens);
    return `<div class="spoiler-block"><div class="spoiler-header">${headerHtml}</div><div class="spoiler-content">${blockHtml}</div></div>`;
  },
};

// Отдельный экземпляр marked, чтобы extension не влиял глобально на другие потребители.
const markdownRenderer = new Marked({
  extensions: [ZULIP_BLOCK_SPOILER_EXTENSION, INLINE_SPOILER_EXTENSION],
});

/** True when the string looks like HTML from Zulip, not raw `<https://…>` autolink markdown. */
export function isLikelyRenderedMessageHtml(s: string): boolean {
  const t = s.trimStart();
  if (t.length === 0) return false;
  if (!t.startsWith("<")) return false;
  if (/^<(https?:|mailto:)/i.test(t)) return false;
  return /^<[a-z!?]/i.test(t);
}

export function renderMarkdownFallbackHtml(markdown: string): string {
  // Здесь всегда синхронный рендер: это UI-путь пузыря/превью, без async-плагинов.
  const rendered = markdownRenderer.parse(markdown, {
    async: false,
    breaks: true,
    gfm: true,
  });
  return typeof rendered === "string" ? rendered : "";
}

export function applySyntaxHighlighting(html: string): string {
  if (typeof document === "undefined" || html.trim().length === 0) {
    return html;
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;

  const codeBlocks = wrapper.querySelectorAll("pre code");
  for (const codeBlock of codeBlocks) {
    const sourceCode = codeBlock.textContent ?? "";
    if (sourceCode.trim().length === 0) {
      continue;
    }

    try {
      const language = resolveLanguageFromClassName(codeBlock.className);
      const highlighted = language
        ? hljs.highlight(sourceCode, { ignoreIllegals: true, language }).value
        : hljs.highlightAuto(sourceCode).value;

      codeBlock.innerHTML = highlighted;
      codeBlock.classList.add("hljs");
      if (language != null) {
        codeBlock.classList.add(`language-${language}`);
      }
    } catch {
      continue;
    }
  }

  return wrapper.innerHTML;
}

function inlineUserUploadImageLinks(html: string): string {
  // Что делает: пост-обрабатывает уже срендеренный markdown HTML и
  // превращает ссылки на image-файлы из `/user_uploads/...` во встроенные preview-картинки.
  // Зачем: храним и редактируем сообщение как markdown, но в UI показываем inline image как в Zulip.
  if (typeof document === "undefined" || !html.includes("/user_uploads/")) {
    return html;
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;

  const links = wrapper.querySelectorAll<HTMLAnchorElement>("a[href]");
  for (const link of links) {
    const href = link.getAttribute("href")?.trim();
    if (href == null || href.length === 0) continue;
    // Обрабатываем только image-upload ссылки; не-image вложения (pdf/zip/...) остаются ссылками.
    if (!isUserUploadImagePath(href)) continue;
    // Если внутри ссылки уже есть `<img>`, ничего не переписываем.
    if (link.querySelector("img") != null) continue;

    const title = (link.textContent ?? "").trim();
    const fallbackLabel = title.length > 0 ? title : "image";
    const image = document.createElement("img");
    // Используем thumbnail URL, чтобы остался действующий protected-media pipeline:
    // `prepareProtectedMessageHtml` уберет реальный src из live DOM и загрузит blob через auth fetch.
    image.setAttribute("src", toUserUploadThumbnailUrl(href));
    image.setAttribute("alt", fallbackLabel);
    image.setAttribute("title", fallbackLabel);
    link.replaceChildren(image);
  }

  return wrapper.innerHTML;
}

function inlineUserUploadVideoLinks(html: string): string {
  // Пост-обработка: ссылки на video user_upload → inline `<video>` (как image → `<img>`).
  if (typeof document === "undefined" || !html.includes("/user_uploads/")) {
    return html;
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;

  const links = wrapper.querySelectorAll<HTMLAnchorElement>("a[href]");
  for (const link of links) {
    const href = link.getAttribute("href")?.trim();
    if (href == null || href.length === 0) continue;
    if (!isUserUploadVideoPath(href)) continue;
    if (link.querySelector("video") != null) continue;

    link.replaceWith(createInlineUserUploadVideoElement(href));
  }

  return wrapper.innerHTML;
}

function inlineUserUploadMediaLinks(html: string): string {
  return inlineUserUploadVideoLinks(inlineUserUploadImageLinks(html));
}

function normalizeZulipSpoilerBlocks(html: string): string {
  // Что делает: мягко нормализует входящую Zulip spoiler-разметку,
  // сохраняя block-аккордеон и добавляя fallback header, если он пустой/отсутствует.
  if (typeof document === "undefined" || !html.includes("spoiler-block")) {
    return html;
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;

  const spoilerBlocks = wrapper.querySelectorAll<HTMLElement>(".spoiler-block");
  for (const block of spoilerBlocks) {
    const header = block.querySelector<HTMLElement>(".spoiler-header");
    const content = block.querySelector<HTMLElement>(".spoiler-content");
    // Если структура неожиданная, не ломаем сообщение и оставляем исходный HTML.
    if (content == null) continue;

    if (header == null) {
      const fallbackHeader = document.createElement("div");
      fallbackHeader.classList.add("spoiler-header");
      fallbackHeader.textContent = DEFAULT_ZULIP_SPOILER_HEADER;
      block.insertBefore(fallbackHeader, content);
      continue;
    }

    if ((header.textContent ?? "").trim().length === 0) {
      header.textContent = DEFAULT_ZULIP_SPOILER_HEADER;
    }
  }

  return wrapper.innerHTML;
}

export interface MessageBodyDisplayOptions {
  /** Resolves `@**DisplayName**` to a user id for client-side mention spans. Wildcards (`@**all**`, …) do not use this. */
  resolveUserMention?: (displayName: string) => number | null;
  /** Resolves custom realm emoji shortcode (`:name:`) to image URL. */
  resolveCustomEmojiShortcodeImageUrl?: (shortcode: string) => string | undefined;
}

/** Markdown → HTML (marked + GFM + highlight). Caller must `sanitizeHtml` before DOM insertion. */
export function messageBodyToUnsanitizedDisplayHtml(
  body: string,
  options?: MessageBodyDisplayOptions,
): string {
  const t = body.trim();
  if (t.length === 0) return "";
  // Если пришел уже готовый HTML от Zulip, не прогоняем через markdown повторно.
  if (isLikelyRenderedMessageHtml(t)) {
    return inlineUserUploadMediaLinks(normalizeZulipSpoilerBlocks(t));
  }
  let mdInput = t;
  let mentionTokens: ReturnType<typeof injectZulipMentionPlaceholders>["tokens"] | undefined;
  if (options?.resolveUserMention != null) {
    const prepared = injectZulipMentionPlaceholders(t, options.resolveUserMention);
    if (prepared.tokens.length > 0) {
      mdInput = prepared.markdown;
      mentionTokens = prepared.tokens;
    }
  }
  const mdHtml = renderMarkdownFallbackHtml(mdInput);
  // Шаги post-processing разделены специально:
  // 1) синтаксис кода, 2) упоминания, 3) emoji, 4) inline user_upload image-links.
  let html = applySyntaxHighlighting(mdHtml);
  if (mentionTokens != null && mentionTokens.length > 0) {
    html = restoreZulipMentionPlaceholders(html, mentionTokens);
  }
  html = renderEmojiShortcodesInHtml(html, {
    resolveCustomEmojiShortcodeImageUrl: options?.resolveCustomEmojiShortcodeImageUrl,
  });
  const withInlineUploads = inlineUserUploadMediaLinks(html);
  return normalizeZulipSpoilerBlocks(withInlineUploads);
}

/** One-line / list previews: strip tags; Markdown is converted via marked first. */
export function plainTextPreviewFromMessageBody(body: string): string {
  const t = body.trim();
  if (t.length === 0) return "";
  if (isLikelyRenderedMessageHtml(t)) {
    return stripHtml(t);
  }
  const html = renderMarkdownFallbackHtml(t);
  return stripHtml(html);
}
