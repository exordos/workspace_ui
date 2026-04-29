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
import { marked } from "marked";
import { stripHtml } from "~/shared/lib/html";
import { renderEmojiShortcodesInHtml } from "~/shared/lib/message-emoji-shortcodes.lib";
import {
  injectZulipMentionPlaceholders,
  restoreZulipMentionPlaceholders,
} from "~/shared/lib/message-zulip-mentions.lib";

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

/** True when the string looks like HTML from Zulip, not raw `<https://…>` autolink markdown. */
export function isLikelyRenderedMessageHtml(s: string): boolean {
  const t = s.trimStart();
  if (t.length === 0) return false;
  if (!t.startsWith("<")) return false;
  if (/^<(https?:|mailto:)/i.test(t)) return false;
  return /^<[a-z!?]/i.test(t);
}

export function renderMarkdownFallbackHtml(markdown: string): string {
  const rendered = marked.parse(markdown, {
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
  if (isLikelyRenderedMessageHtml(t)) {
    return t;
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
  let html = applySyntaxHighlighting(mdHtml);
  if (mentionTokens != null && mentionTokens.length > 0) {
    html = restoreZulipMentionPlaceholders(html, mentionTokens);
  }
  html = renderEmojiShortcodesInHtml(html, {
    resolveCustomEmojiShortcodeImageUrl: options?.resolveCustomEmojiShortcodeImageUrl,
  });
  return html;
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
