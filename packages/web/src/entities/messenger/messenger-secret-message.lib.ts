import { t } from "~/i18n/i18n";
import { isWorkspaceMessageWithinLimit } from "~/shared/lib/workspace-message-limits.lib";
import { createWorkspaceMarkdownLexer } from "~/shared/lib/workspace-message-render/workspace-message-marked.lib";
import {
  buildWorkspaceSecretUrn,
  isWorkspaceSecretUrn,
  parseWorkspaceSecretUrn,
  type WorkspaceSecretUrnReference,
} from "~/shared/lib/workspace-reference-urn.lib";
import {
  hasWorkspaceSecretDraft,
  parseWorkspaceSecretDraft,
  replaceWorkspaceSecretDraft,
} from "~/shared/lib/workspace-secret-draft.lib";
import type { ChatEncryptedPayload } from "./chat-e2ee.types";
import type { Token } from "marked";

/** Restore only real links; identical text in code must remain untouched. */
export async function restoreMessengerSecretMarkdown(
  markdown: string,
  decrypt: (reference: WorkspaceSecretUrnReference) => Promise<string | null>,
): Promise<string> {
  const source = markdown.replace(/\r\n?/g, "\n");
  const lexer = createWorkspaceMarkdownLexer();
  const leaves = (tokens: readonly Token[]): Token[] =>
    tokens.flatMap((token) => {
      let children: readonly Token[] = [];
      if (token.type === "list") children = token.items;
      else if (token.type === "table")
        children = [...token.header, ...token.rows.flat()].flatMap((cell) => cell.tokens);
      // These legacy fences render their body as Markdown; ordinary code stays opaque.
      else if (
        token.type === "code" &&
        /^(?:quote|spoiler(?:[ \t].*)?)$/i.test(token.lang?.trim() ?? "")
      )
        children = lexer.lexer(token.text);
      else if ("tokens" in token && token.type !== "link" && token.type !== "image")
        children = token.tokens ?? [];
      return children.length > 0 ? leaves(children) : [token];
    });
  // Rendering rewrites mentions and other tokens, so locate ranges in lexical tokens only.
  const tokens = leaves(lexer.lexer(source));
  if (!tokens.some((token) => token.type === "link" && parseWorkspaceSecretUrn(token.href)))
    return markdown;
  if (hasWorkspaceSecretDraft(source)) throw new Error("invalid-secret");
  const ranges: { start: number; end: number; reference: WorkspaceSecretUrnReference }[] = [];
  let offset = 0;
  for (const token of tokens) {
    // Blockquotes and lists strip line prefixes from their child tokens.
    const pattern = token.raw
      .split("\n")
      .map((line) => line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .map((line, index, lines) => {
        if (index === 0) return line;
        return index === lines.length - 1 && line.length === 0
          ? "\n"
          : `\n[ \t]*(?:>[ \t]?)*${line}`;
      })
      .join("");
    const match = new RegExp(pattern).exec(source.slice(offset));
    if (match == null) throw new Error("invalid-secret");
    const start = offset + match.index;
    offset = start + match[0].length;
    if (token.type !== "link" || !isWorkspaceSecretUrn(token.href)) continue;
    const reference = parseWorkspaceSecretUrn(token.href);
    if (reference == null) throw new Error("invalid-secret");
    ranges.push({ start, end: offset, reference });
  }
  let result = "";
  offset = 0;
  for (const range of ranges) {
    const plaintext = await decrypt(range.reference);
    if (!plaintext?.trim() || hasWorkspaceSecretDraft(plaintext)) throw new Error("invalid-secret");
    result += source.slice(offset, range.start) + `:::${plaintext}:::`;
    offset = range.end;
  }
  return result + source.slice(offset);
}

export function buildMessengerSecretMarkdown(
  streamUuid: string,
  markdown: string,
  payloads: readonly ChatEncryptedPayload[],
): string {
  const result = replaceWorkspaceSecretDraft(
    markdown,
    parseWorkspaceSecretDraft(markdown),
    payloads.map((payload) => {
      const urn = buildWorkspaceSecretUrn(streamUuid, payload.keyUuid, payload.content);
      if (urn == null) throw new Error(t("composer.invalidSecret"));
      return `[${t("e2ee.secretFragment")}](${urn})`;
    }),
  );
  if (!isWorkspaceMessageWithinLimit(result)) throw new Error(t("composer.messageTooLong"));
  return result;
}
