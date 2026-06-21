/**
 * Draft entity type definitions.
 *
 * Drafts are saved locally and synced with the Workspace Drafts API.
 * Each draft has a type (stream or DM), target, and content.
 */

import type { MessageId } from "~/shared/lib/message-id.lib";

export type DraftType = "stream" | "private";
export type DraftTargetId = number | string;

export interface Draft {
  /** Server-assigned UUID (null if local-only, not yet synced). */
  id: MessageId | null;
  /** "stream" for channel messages, "private" for DMs. */
  type: DraftType;
  /** For stream: [streamUuid]. For DM: recipient user IDs. */
  to: DraftTargetId[];
  /** Topic name (stream drafts only). */
  topic: string;
  /** Draft message content (markdown). */
  content: string;
  /** Last update timestamp (Unix seconds). */
  timestamp: number;
}

export interface DraftInput {
  type: DraftType;
  to: DraftTargetId[];
  topic: string;
  content: string;
}
