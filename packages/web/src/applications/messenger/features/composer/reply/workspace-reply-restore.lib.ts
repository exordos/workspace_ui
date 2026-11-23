import { parseWorkspaceReferenceUrn } from "~/shared/lib/workspace-reference-urn.lib";
import { createWorkspaceReplyTab, normalizeWorkspaceReplySession } from "./workspace-reply.model";
import type {
  WorkspaceReplyQuote,
  WorkspaceReplySession,
  WorkspaceReplyTabIdentity,
} from "./workspace-reply.types";

const UUID_SOURCE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const WORKSPACE_REPLY_HEADER_PATTERN = new RegExp(
  String.raw`^\[((?:\\.|[^\]])*)\]\(urn:user:(${UUID_SOURCE})\)\s+\[(?:\\.|[^\]])*\]\(urn:message:(${UUID_SOURCE})\):\s*$`,
  "i",
);
const WORKSPACE_QUOTE_REFERENCE_PATTERN = /^\[((?:\\.|[^\]])*)\]\((urn:quote:[^)]+)\)\s*$/i;

export interface RestoredWorkspaceReplySession {
  session: WorkspaceReplySession;
  activeAnswer: string;
}

interface ParsedWorkspaceReplyQuote {
  format: "reference" | "legacy";
  fallbackSenderName: string;
  senderUuid?: string;
  messageUuid: string;
  quotedContent: string;
  selectedText?: string;
  endLineIndex: number;
}

export type ResolveRestoredWorkspaceReplyQuote = (
  messageUuid: string,
) => Pick<WorkspaceReplyQuote, "senderUuid" | "senderName" | "quotedContent"> | null;

function normalizeMarkdown(markdown: string): string {
  return markdown.replace(/\r\n?/g, "\n").trim();
}

function unescapeWorkspaceMarkdownInline(value: string): string {
  return value.replace(/\\([\\`*_{()[\]#+.!|>~-])/g, "$1");
}

function isQuoteLine(line: string): boolean {
  return line.startsWith(">");
}

function quoteLineContent(line: string): string {
  return line.startsWith("> ") ? line.slice(2) : line.slice(1);
}

function parseWorkspaceQuoteReference(
  lines: readonly string[],
  startLineIndex: number,
): ParsedWorkspaceReplyQuote | null {
  const line = lines[startLineIndex];
  if (line == null) return null;

  const match = WORKSPACE_QUOTE_REFERENCE_PATTERN.exec(line);
  if (match == null) return null;
  const fallbackSenderName = unescapeWorkspaceMarkdownInline(match[1] ?? "").trim();
  const reference = parseWorkspaceReferenceUrn(match[2]);
  if (fallbackSenderName.length === 0 || reference?.kind !== "quote") return null;

  return {
    format: "reference",
    fallbackSenderName,
    messageUuid: reference.messageUuid,
    quotedContent: "",
    ...(reference.text == null ? {} : { selectedText: reference.text }),
    endLineIndex: startLineIndex + 1,
  };
}

// TODO: Keep edit support for persisted replies; remove this parser after the backend/client
// contract migration is complete and persisted old-format messages are no longer supported.
function parseLegacyWorkspaceReplyQuote(
  lines: readonly string[],
  startLineIndex: number,
): ParsedWorkspaceReplyQuote | null {
  const headerLine = lines[startLineIndex];
  if (headerLine == null || !isQuoteLine(headerLine)) return null;

  const headerMatch = WORKSPACE_REPLY_HEADER_PATTERN.exec(quoteLineContent(headerLine));
  if (headerMatch == null) return null;

  let endLineIndex = startLineIndex + 1;
  const quotedLines: string[] = [];
  while (endLineIndex < lines.length) {
    const line = lines[endLineIndex];
    if (line == null || !isQuoteLine(line)) break;
    quotedLines.push(quoteLineContent(line));
    endLineIndex += 1;
  }

  const senderName = unescapeWorkspaceMarkdownInline(headerMatch[1] ?? "").trim();
  const senderUuid = headerMatch[2]?.trim() ?? "";
  const messageUuid = headerMatch[3]?.trim() ?? "";
  if (senderName.length === 0 || senderUuid.length === 0 || messageUuid.length === 0) return null;

  return {
    format: "legacy",
    fallbackSenderName: senderName,
    senderUuid,
    messageUuid,
    quotedContent: quotedLines.join("\n").trim(),
    endLineIndex,
  };
}

function parseWorkspaceReplyQuote(
  lines: readonly string[],
  startLineIndex: number,
): ParsedWorkspaceReplyQuote | null {
  return (
    parseWorkspaceQuoteReference(lines, startLineIndex) ??
    parseLegacyWorkspaceReplyQuote(lines, startLineIndex)
  );
}

/**
 * Restores the reply state only from the canonical Markdown emitted by the Workspace composer.
 * Other blockquotes remain ordinary message content.
 */
export function restoreWorkspaceReplySessionFromMarkdown(
  markdown: string,
  createIdentity: (index: number) => WorkspaceReplyTabIdentity,
  resolveQuote?: ResolveRestoredWorkspaceReplyQuote,
): RestoredWorkspaceReplySession | null {
  const normalizedMarkdown = normalizeMarkdown(markdown);
  if (normalizedMarkdown.length === 0) return null;

  const lines = normalizedMarkdown.split("\n");
  const firstQuote = parseWorkspaceReplyQuote(lines, 0);
  if (firstQuote == null) return null;

  const parsedQuotes: (ParsedWorkspaceReplyQuote & { answer: string })[] = [];
  let currentQuote: ParsedWorkspaceReplyQuote | null = firstQuote;

  while (currentQuote != null) {
    let nextQuote: ParsedWorkspaceReplyQuote | null = null;
    let nextQuoteStartIndex = lines.length;

    for (let index = currentQuote.endLineIndex; index < lines.length; index += 1) {
      if (lines[index - 1]?.trim().length !== 0) continue;
      const candidate = parseWorkspaceReplyQuote(lines, index);
      if (candidate == null) continue;
      nextQuote = candidate;
      nextQuoteStartIndex = index;
      break;
    }

    parsedQuotes.push({
      ...currentQuote,
      answer: lines.slice(currentQuote.endLineIndex, nextQuoteStartIndex).join("\n").trim(),
    });
    currentQuote = nextQuote;
  }

  const tabs = parsedQuotes.flatMap((quote, index) => {
    const resolvedQuote = quote.format === "reference" ? resolveQuote?.(quote.messageUuid) : null;
    if (quote.format === "reference" && resolvedQuote == null) {
      return [];
    }
    const senderUuid = resolvedQuote?.senderUuid ?? quote.senderUuid;
    const senderName = resolvedQuote?.senderName ?? quote.fallbackSenderName;
    const quotedContent = resolvedQuote?.quotedContent ?? quote.quotedContent;
    if (senderUuid == null) return [];

    const tab = createWorkspaceReplyTab(
      {
        messageUuid: quote.messageUuid,
        senderUuid,
        senderName,
        quotedContent,
        ...(quote.selectedText == null ? {} : { selectedText: quote.selectedText }),
      },
      createIdentity(index),
    );
    return tab == null ? [] : [{ ...tab, answer: quote.answer }];
  });
  if (tabs.length !== parsedQuotes.length) {
    return null;
  }
  const session = normalizeWorkspaceReplySession({
    tabs,
    activeTabId: tabs[0]?.id ?? null,
  });
  const activeAnswer = session.tabs[0]?.answer;
  if (activeAnswer == null) return null;

  return { session, activeAnswer };
}
