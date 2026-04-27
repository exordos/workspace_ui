import emojibaseShortcodes from "emojibase-data/en/shortcodes/emojibase.json";

const EMOJI_SHORTCODE_PATTERN = /:([a-zA-Z0-9+-][a-zA-Z0-9_+\s-]{0,62}):/g;

let unicodeEmojiByShortcodeCache: ReadonlyMap<string, string> | null = null;

export interface RenderEmojiShortcodesOptions {
  resolveCustomEmojiShortcodeImageUrl?: (shortcode: string) => string | undefined;
}

type EmojibaseShortcodeEntry = string | string[];
type EmojibaseShortcodeDataset = Record<string, EmojibaseShortcodeEntry>;

function decodeUnicodeEmojiCode(code: string): string | null {
  const sanitized = code.trim().replace(/_/g, "-");
  if (!sanitized) {
    return null;
  }
  const points = sanitized
    .split("-")
    .map((part) => Number.parseInt(part, 16))
    .filter((point) => Number.isFinite(point));
  if (points.length === 0) {
    return null;
  }
  try {
    return String.fromCodePoint(...points);
  } catch {
    return null;
  }
}

function normalizeEmojiAlias(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^:+|:+$/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_+]+/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildUnicodeEmojiShortcodeMap(): ReadonlyMap<string, string> {
  const aliasToCodepoints = new Map<string, Set<string>>();
  const shortcodeDataset = emojibaseShortcodes as EmojibaseShortcodeDataset;

  for (const [hexCodeRaw, aliasesRaw] of Object.entries(shortcodeDataset)) {
    const codepoint = hexCodeRaw.trim();
    if (codepoint.length === 0) continue;
    const aliases = Array.isArray(aliasesRaw) ? aliasesRaw : [aliasesRaw];
    for (const aliasRaw of aliases) {
      const alias = normalizeEmojiAlias(aliasRaw);
      if (alias.length === 0) continue;
      const existing = aliasToCodepoints.get(alias);
      if (existing == null) {
        aliasToCodepoints.set(alias, new Set([codepoint]));
      } else {
        existing.add(codepoint);
      }
    }
  }

  const unicodeByShortcode = new Map<string, string>();
  for (const [alias, codepoints] of aliasToCodepoints) {
    if (codepoints.size !== 1) continue;
    const [single] = codepoints;
    if (single == null) continue;
    const unicode = decodeUnicodeEmojiCode(single);
    if (unicode == null) continue;
    unicodeByShortcode.set(alias, unicode);
  }

  return unicodeByShortcode;
}

function getUnicodeEmojiShortcodeMap(): ReadonlyMap<string, string> {
  if (unicodeEmojiByShortcodeCache != null) {
    return unicodeEmojiByShortcodeCache;
  }
  unicodeEmojiByShortcodeCache = buildUnicodeEmojiShortcodeMap();
  return unicodeEmojiByShortcodeCache;
}

function resolveUnicodeEmojiShortcode(shortcode: string): string | null {
  const normalized = normalizeEmojiAlias(shortcode);
  if (normalized.length === 0) {
    return null;
  }
  return getUnicodeEmojiShortcodeMap().get(normalized) ?? null;
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function createInlineEmojiImage(
  doc: Document,
  shortcode: string,
  imageUrl: string,
): HTMLImageElement {
  const img = doc.createElement("img");
  img.className = "message-inline-emoji";
  img.setAttribute("src", imageUrl);
  const label = `:${shortcode}:`;
  img.setAttribute("alt", label);
  img.setAttribute("title", label);
  img.setAttribute("loading", "lazy");
  img.setAttribute("decoding", "async");
  img.draggable = false;
  return img;
}

function appendReplacementNodes(options: {
  fragment: DocumentFragment;
  fullMatch: string;
  rawShortcode: string;
  doc: Document;
  resolveCustomEmojiShortcodeImageUrl?: (shortcode: string) => string | undefined;
}): boolean {
  const { fragment, fullMatch, rawShortcode, doc, resolveCustomEmojiShortcodeImageUrl } = options;
  const normalized = normalizeEmojiAlias(rawShortcode);
  if (normalized.length === 0) {
    fragment.append(doc.createTextNode(fullMatch));
    return false;
  }
  const customEmojiImageUrl = resolveCustomEmojiShortcodeImageUrl?.(normalized)?.trim() ?? "";
  if (customEmojiImageUrl.length > 0) {
    fragment.append(createInlineEmojiImage(doc, normalized, customEmojiImageUrl));
    return true;
  }
  const unicode = resolveUnicodeEmojiShortcode(normalized);
  if (unicode != null) {
    fragment.append(doc.createTextNode(unicode));
    return true;
  }
  fragment.append(doc.createTextNode(fullMatch));
  return false;
}

function replaceEmojiShortcodesInTextNode(
  node: Text,
  resolveCustomEmojiShortcodeImageUrl?: (shortcode: string) => string | undefined,
): void {
  const text = node.data;
  if (!containsEmojiShortcode(text)) {
    return;
  }
  const doc = node.ownerDocument;
  const fragment = doc.createDocumentFragment();
  const regex = new RegExp(EMOJI_SHORTCODE_PATTERN.source, "g");
  let changed = false;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    const fullMatch = match[0];
    const rawShortcode = match[1] ?? "";
    if (start > lastIndex) {
      fragment.append(doc.createTextNode(text.slice(lastIndex, start)));
    }
    changed =
      appendReplacementNodes({
        fragment,
        fullMatch,
        rawShortcode,
        doc,
        resolveCustomEmojiShortcodeImageUrl,
      }) || changed;
    lastIndex = start + fullMatch.length;
  }

  if (!changed) {
    return;
  }

  if (lastIndex < text.length) {
    fragment.append(doc.createTextNode(text.slice(lastIndex)));
  }

  node.replaceWith(fragment);
}

function shouldSkipEmojiReplacementInTextNode(node: Text): boolean {
  const parent = node.parentElement;
  if (parent == null) return true;
  return parent.closest("code,pre") != null;
}

function replaceEmojiShortcodesInPlainText(text: string): string {
  if (!containsEmojiShortcode(text)) {
    return text;
  }
  const regex = new RegExp(EMOJI_SHORTCODE_PATTERN.source, "g");
  return text.replace(regex, (fullMatch, rawShortcode: string) => {
    const unicode = resolveUnicodeEmojiShortcode(rawShortcode);
    return unicode ?? fullMatch;
  });
}

export function normalizeEmojiShortcodeName(name: string): string {
  return normalizeEmojiAlias(name);
}

export function containsEmojiShortcode(text: string): boolean {
  if (!text.includes(":")) return false;
  EMOJI_SHORTCODE_PATTERN.lastIndex = 0;
  return EMOJI_SHORTCODE_PATTERN.test(text);
}

export function renderEmojiShortcodesInHtml(
  html: string,
  options?: RenderEmojiShortcodesOptions,
): string {
  if (!containsEmojiShortcode(html)) {
    return html;
  }

  if (typeof document === "undefined") {
    if (options?.resolveCustomEmojiShortcodeImageUrl == null) {
      return replaceEmojiShortcodesInPlainText(html);
    }
    const regex = new RegExp(EMOJI_SHORTCODE_PATTERN.source, "g");
    return html.replace(regex, (fullMatch, rawShortcode: string) => {
      const normalized = normalizeEmojiAlias(rawShortcode);
      if (normalized.length === 0) return fullMatch;
      const customEmojiImageUrl =
        options.resolveCustomEmojiShortcodeImageUrl?.(normalized)?.trim() ?? "";
      if (customEmojiImageUrl.length > 0) {
        const safeUrl = escapeHtmlAttr(customEmojiImageUrl);
        const safeLabel = escapeHtmlAttr(`:${normalized}:`);
        return `<img class="message-inline-emoji" src="${safeUrl}" alt="${safeLabel}" title="${safeLabel}" loading="lazy" decoding="async">`;
      }
      const unicode = resolveUnicodeEmojiShortcode(normalized);
      return unicode ?? fullMatch;
    });
  }

  const template = document.createElement("template");
  template.innerHTML = html;
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const textNodesToUpdate: Text[] = [];
  let current: Node | null;
  while ((current = walker.nextNode()) != null) {
    const textNode = current as Text;
    if (shouldSkipEmojiReplacementInTextNode(textNode)) continue;
    if (!containsEmojiShortcode(textNode.data)) continue;
    textNodesToUpdate.push(textNode);
  }

  if (textNodesToUpdate.length === 0) {
    return html;
  }

  for (const textNode of textNodesToUpdate) {
    replaceEmojiShortcodesInTextNode(textNode, options?.resolveCustomEmojiShortcodeImageUrl);
  }

  return template.innerHTML;
}
