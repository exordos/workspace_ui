import { t } from "~/i18n/i18n";
import { isWorkspaceMessageWithinLimit } from "~/shared/lib/workspace-message-limits.lib";
import { parseWorkspaceMessageBody } from "~/shared/lib/workspace-message-render/workspace-message-parse.lib";
import { collectWorkspaceMessageSecretReferences } from "~/shared/lib/workspace-message-render/workspace-message-render.lib";
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
  const document = parseWorkspaceMessageBody(markdown);
  if (collectWorkspaceMessageSecretReferences(document).length === 0) return markdown;
  if (hasWorkspaceSecretDraft(document.sourceMarkdown)) throw new Error("invalid-secret");
  const leaves = (tokens: readonly Token[]): Token[] =>
    tokens.flatMap((token) => {
      let children: readonly Token[] = [];
      if (token.type === "list") children = token.items;
      else if (token.type === "table")
        children = [...token.header, ...token.rows.flat()].flatMap((cell) => cell.tokens);
      else if ("tokens" in token && token.type !== "link" && token.type !== "image")
        children = token.tokens ?? [];
      return children.length > 0 ? leaves(children) : [token];
    });
  let offset = 0;
  let result = "";
  for (const token of leaves(document.markdownTokens)) {
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
    const match = new RegExp(pattern).exec(document.sourceMarkdown.slice(offset));
    if (match == null) throw new Error("invalid-secret");
    const start = offset + match.index;
    const end = start + match[0].length;
    let replacement = document.sourceMarkdown.slice(start, end);
    if (token.type === "link" && isWorkspaceSecretUrn(token.href)) {
      const reference = parseWorkspaceSecretUrn(token.href);
      if (reference == null) throw new Error("invalid-secret");
      const plaintext = await decrypt(reference);
      if (!plaintext?.trim() || hasWorkspaceSecretDraft(plaintext))
        throw new Error("invalid-secret");
      replacement = `:::${plaintext}:::`;
    }
    result += document.sourceMarkdown.slice(offset, start) + replacement;
    offset = end;
  }
  return result + document.sourceMarkdown.slice(offset);
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
