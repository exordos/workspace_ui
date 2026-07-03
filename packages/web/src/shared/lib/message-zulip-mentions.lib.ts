/**
 * Client-side Zulip mention markup for Markdown message bodies (`@**Name**`, reply quotes
 * `@_**Name|userId**`, silent without id `@_**Name**`).
 *
 * `marked` parses `**` as emphasis, so we replace mentions with placeholders before
 * Markdown, then substitute `<span class="user-mention" data-user-id="…">` after render.
 *
 * Usage (via `messageBodyToUnsanitizedDisplayHtml` options):
 *   messageBodyToUnsanitizedDisplayHtml(body, { resolveUserMention: (name) => … });
 *
 * Only for Markdown paths; skip when `isLikelyRenderedMessageHtml` (server HTML).
 */

/** Stream/topic wildcard labels (Zulip) — rendered as user-group-mention, not resolved via users store. */
const STREAM_WILDCARD_DISPLAY_NAMES = new Set(
  ["all", "everyone", "channel", "topic", "stream"].map((s) => s.toLowerCase()),
);

const PLACEHOLDER_START = "\uE000";
const PLACEHOLDER_END = "\uE001";

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface ZulipMentionToken {
  displayName: string;
  kind: "user" | "wildcard" | "unresolved";
  userId?: number;
  userUuid?: string;
}

export interface ZulipMentionResolution {
  userId?: number | null;
  userUuid?: string | null;
}

export type ResolveZulipMention =
  | ((displayName: string) => number | null)
  | ((displayName: string) => ZulipMentionResolution | null);

/**
 * Combined mention matcher: `@_**Name|id**` (reply/silent with id), `@_**Name**` (silent),
 * `@**Name**` (regular). Order inside `_**…**` prefers `Name|digits` before bare `Name`.
 */
const ZULIP_MENTION_COMBINED = /@(?:_\*\*(?:([^*|]+)\|(\d+)|([^*|]+))\*\*|\*\*([^*]+)\*\*)/g;

function isStreamWildcard(displayName: string): boolean {
  return STREAM_WILDCARD_DISPLAY_NAMES.has(displayName.trim().toLowerCase());
}

function tokenFromDisplayName(
  displayName: string,
  resolveUserMention: ResolveZulipMention,
): ZulipMentionToken {
  const trimmed = displayName.trim();
  if (isStreamWildcard(trimmed)) {
    return { displayName: trimmed, kind: "wildcard" };
  }
  const resolved = resolveUserMention(trimmed);
  const id = typeof resolved === "number" ? resolved : resolved?.userId;
  const uuid = typeof resolved === "number" ? null : resolved?.userUuid;
  if ((id != null && id > 0) || (uuid != null && uuid.length > 0)) {
    return {
      displayName: trimmed,
      kind: "user",
      ...(id != null && id > 0 ? { userId: id } : {}),
      ...(uuid != null && uuid.length > 0 ? { userUuid: uuid } : {}),
    };
  }
  return { displayName: trimmed, kind: "unresolved" };
}

function buildMentionSpanHtml(token: ZulipMentionToken): string {
  // Visible label: leading `@` + display name (Zulip source already has `@**…**`; we mirror that in HTML).
  const label = `@${escapeHtmlText(token.displayName)}`;
  if (token.kind === "wildcard") {
    return `<span class="user-mention user-group-mention" data-user-id="*">${label}</span>`;
  }
  if (token.kind === "user") {
    const attrs: string[] = [];
    if (token.userId != null && token.userId > 0) {
      attrs.push(`data-user-id="${String(token.userId)}"`);
    }
    if (token.userUuid != null && token.userUuid.length > 0) {
      attrs.push(`data-user-uuid="${escapeHtmlText(token.userUuid)}"`);
    }
    if (attrs.length > 0) {
      return `<span class="user-mention" ${attrs.join(" ")}>${label}</span>`;
    }
  }
  return `<span class="user-mention">${label}</span>`;
}

/**
 * Replaces Zulip mention Markdown with private-use placeholders and records tokens for HTML substitution.
 */
export function injectZulipMentionPlaceholders(
  markdown: string,
  resolveUserMention: ResolveZulipMention,
): { markdown: string; tokens: ZulipMentionToken[] } {
  const tokens: ZulipMentionToken[] = [];
  const regex = new RegExp(ZULIP_MENTION_COMBINED.source, "g");
  let result = "";
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(markdown)) !== null) {
    const fullMatch = m[0];
    const start = m.index;
    result += markdown.slice(lastIndex, start);

    const nameWithId = m[1]?.trim();
    const idStr = m[2];
    const silentBare = m[3]?.trim();
    const regular = m[4]?.trim();

    let token: ZulipMentionToken;
    if (nameWithId != null && nameWithId.length > 0 && idStr != null && idStr.length > 0) {
      const parsedId = Number(idStr);
      if (Number.isFinite(parsedId) && Number.isInteger(parsedId) && parsedId > 0) {
        token = { displayName: nameWithId, kind: "user", userId: parsedId };
      } else {
        token = { displayName: nameWithId, kind: "unresolved" };
      }
    } else if (silentBare != null && silentBare.length > 0) {
      token = tokenFromDisplayName(silentBare, resolveUserMention);
    } else if (regular != null && regular.length > 0) {
      token = tokenFromDisplayName(regular, resolveUserMention);
    } else {
      result += fullMatch;
      lastIndex = start + fullMatch.length;
      continue;
    }

    const tokenIndex = tokens.length;
    tokens.push(token);
    result += `${PLACEHOLDER_START}${String(tokenIndex)}${PLACEHOLDER_END}`;
    lastIndex = start + fullMatch.length;
  }
  result += markdown.slice(lastIndex);
  return { markdown: result, tokens };
}

/** Substitutes placeholder sequences in rendered HTML with Zulip-style mention spans. */
export function restoreZulipMentionPlaceholders(html: string, tokens: ZulipMentionToken[]): string {
  let out = html;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const marker = `${PLACEHOLDER_START}${String(i)}${PLACEHOLDER_END}`;
    const span = buildMentionSpanHtml(token);
    if (out.includes(marker)) {
      out = out.split(marker).join(span);
    }
  }
  return out;
}
