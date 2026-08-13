import type { WorkspaceMessageFileReference } from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import { parseWorkspaceMessageFileHref } from "~/shared/lib/workspace-message-render/workspace-message-file-reference.lib";
import { createWorkspaceMarkdownLexer } from "~/shared/lib/workspace-message-render/workspace-message-marked.lib";
import type { Tokens } from "marked";

const workspaceMarkdownLexer = createWorkspaceMarkdownLexer();

export interface WorkspaceComposerExistingAttachment {
  id: string;
  markdown: string;
  reference: WorkspaceMessageFileReference;
}

export interface WorkspaceComposerEditContent {
  markdown: string;
  attachments: WorkspaceComposerExistingAttachment[];
}

interface ParsedAttachmentLine {
  markdown: string;
  reference: WorkspaceMessageFileReference;
}

function parseAttachmentLine(line: string): ParsedAttachmentLine | null {
  const tokens = workspaceMarkdownLexer.lexer(line, { async: false, breaks: true, gfm: true });
  const block = tokens.length === 1 ? tokens[0] : undefined;
  if (block?.type !== "paragraph" || block.tokens?.length !== 1) return null;
  const inline = block.tokens[0];
  if (inline?.type !== "link" && inline?.type !== "image") return null;
  const fileToken = inline as Tokens.Link | Tokens.Image;
  const reference = parseWorkspaceMessageFileHref(fileToken.href, fileToken.text);
  return reference == null ? null : { markdown: line, reference };
}

export function extractWorkspaceComposerEditContent(
  markdown: string,
): WorkspaceComposerEditContent {
  const lines = markdown.split("\n");
  let lastContentIndex = lines.length - 1;
  while (lastContentIndex >= 0 && lines[lastContentIndex]?.trim().length === 0) {
    lastContentIndex -= 1;
  }

  const reversedAttachments: ParsedAttachmentLine[] = [];
  let firstAttachmentIndex = lastContentIndex + 1;
  for (let index = lastContentIndex; index >= 0; index -= 1) {
    const line = lines[index];
    if (line == null) break;
    const attachment = parseAttachmentLine(line);
    if (attachment == null) break;
    reversedAttachments.push(attachment);
    firstAttachmentIndex = index;
  }

  if (reversedAttachments.length === 0) {
    return { markdown, attachments: [] };
  }

  const orderedAttachments = reversedAttachments.toReversed();
  const attachments = orderedAttachments.map((attachment, index) => ({
    id: `existing:${attachment.reference.fileUuid}:${index}`,
    markdown: attachment.markdown,
    reference: attachment.reference,
  }));

  return {
    markdown: lines.slice(0, firstAttachmentIndex).join("\n").replace(/\n+$/, ""),
    attachments,
  };
}

export function appendWorkspaceComposerEditAttachmentMarkdown(
  markdown: string,
  links: readonly string[],
): string {
  if (links.length === 0) return markdown;
  if (markdown.length === 0) return links.join("\n");
  const separator = markdown.endsWith("\n") ? "" : "\n";
  return `${markdown}${separator}${links.join("\n")}`;
}

export function appendWorkspaceComposerExistingAttachmentMarkdown(
  markdown: string,
  attachments: readonly WorkspaceComposerExistingAttachment[],
): string {
  return appendWorkspaceComposerEditAttachmentMarkdown(
    markdown,
    attachments.map((attachment) => attachment.markdown),
  );
}
