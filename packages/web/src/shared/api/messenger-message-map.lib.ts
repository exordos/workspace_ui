/**
 * Maps Messenger REST message payloads to MockMessage.
 * Native message rows carry Workspace-flavored Markdown; optional `markdown_source` from older
 * payloads is preserved. Rendered HTML from events/cache is stored as-is in `content`.
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
    ...(m.author_uuid != null ? { author_uuid: m.author_uuid } : {}),
    ...(m.sender_uuid != null ? { sender_uuid: m.sender_uuid } : {}),
    ...(m.is_own != null ? { is_own: m.is_own } : {}),
    ...(m.read != null ? { read: m.read } : {}),
    ...(m.pinned != null ? { pinned: m.pinned } : {}),
    ...(m.starred != null ? { starred: m.starred } : {}),
    sender_full_name: m.sender_full_name ?? "",
    stream_uuid: m.stream_uuid ?? null,
    ...(m.source_name != null ? { source_name: m.source_name } : {}),
    ...(m.source != null ? { source: m.source } : {}),
    ...(m.topic_uuid != null ? { topic_uuid: m.topic_uuid } : {}),
    display_recipient: m.display_recipient,
    channel: typeof m.display_recipient === "string" ? m.display_recipient : undefined,
    subject: m.subject ?? "",
    content: m.content,
    timestamp: m.timestamp,
    flags: m.flags,
    reactions: m.reactions ?? {},
    ...(m.provider !== undefined ? { provider: m.provider } : {}),
    ...(m.delivery !== undefined ? { delivery: m.delivery } : {}),
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
    author_uuid: row.author_uuid,
    sender_uuid: row.sender_uuid,
    is_own: row.is_own,
    read: row.read,
    pinned: row.pinned,
    starred: row.starred,
    sender_full_name: row.sender_full_name,
    content: row.content,
    timestamp: row.timestamp,
    display_recipient: row.display_recipient,
    subject: row.subject,
    topic_uuid: row.topic_uuid,
    type: row.type,
    stream_uuid: row.stream_uuid ?? null,
    source_name: row.source_name,
    source: row.source,
    flags: row.flags,
    reactions: row.reactions ?? {},
    provider: row.provider,
    delivery: row.delivery,
    markdown_source: markdownSource,
  });
}
