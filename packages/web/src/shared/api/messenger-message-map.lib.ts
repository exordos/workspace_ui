/**
 * Maps Messenger REST message payloads to MockMessage.
 * With `apply_markdown=false`, `content` is Workspace-flavored Markdown; optional `markdown_source`
 * from the API is preserved. Rendered HTML from events/API (legacy) is stored as-is in `content`.
 */
import { normalizeMessageId } from "~/shared/lib/message-id.lib";
import { isLikelyRenderedMessageHtml } from "~/shared/lib/message-markdown-display.lib";
import type { MockMessage, RawMessageToMockInput, WorkspaceRawMessage } from "./messenger.types";

export function rawMessageToMockMessage(m: RawMessageToMockInput): MockMessage {
  const contentTrim = m.content.trim();
  const apiMd = m.markdown_source?.trim();
  const isHtmlBody = isLikelyRenderedMessageHtml(contentTrim);
  let markdownSource: string | undefined;
  if (apiMd != null && apiMd.length > 0) {
    markdownSource = apiMd;
  } else if (!isHtmlBody && contentTrim.length > 0) {
    markdownSource = contentTrim;
  }

  const base: MockMessage = {
    id: m.id,
    ...(m.source_message_uuid != null ? { source_message_uuid: m.source_message_uuid } : {}),
    sender_id: m.sender_id,
    sender_full_name: m.sender_full_name ?? "",
    stream_id: m.stream_id ?? (m.type === "private" ? null : (m.stream_id ?? null)),
    display_recipient: m.display_recipient,
    channel: typeof m.display_recipient === "string" ? m.display_recipient : undefined,
    subject: m.subject ?? "",
    content: m.content,
    timestamp: m.timestamp,
    flags: m.flags,
    reactions: m.reactions,
  };
  if (markdownSource != null && markdownSource.length > 0) {
    base.markdown_source = markdownSource;
  }
  return base;
}

type MessageRow = WorkspaceRawMessage & { content_type?: string };

/** Parses GET /messages/{id} JSON (nested `message` or flat row + optional `raw_content`). */
export function mockMessageFromGetMessageApiData(data: unknown): MockMessage | null {
  if (data == null || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.result === "error") return null;

  const rawContent = typeof d.raw_content === "string" ? d.raw_content : undefined;
  let row: MessageRow | null = null;
  if (d.message != null && typeof d.message === "object") {
    row = d.message as MessageRow;
  } else if (normalizeMessageId(d.id) != null) {
    row = d as unknown as MessageRow;
  }
  const rowId = normalizeMessageId(row?.id);
  if (rowId == null || row == null) return null;

  const markdownFromMarkdownMode = row.content_type === "text/x-markdown" ? row.content : undefined;
  const markdownSource =
    rawContent !== undefined && rawContent.trim().length > 0
      ? rawContent
      : markdownFromMarkdownMode;

  return rawMessageToMockMessage({
    id: rowId,
    source_message_uuid: row.source_message_uuid,
    sender_id: row.sender_id,
    sender_full_name: row.sender_full_name,
    content: row.content,
    timestamp: row.timestamp,
    display_recipient: row.display_recipient,
    subject: row.subject,
    type: row.type,
    stream_id: row.stream_id ?? null,
    flags: row.flags,
    reactions: row.reactions,
    markdown_source: markdownSource,
  });
}
