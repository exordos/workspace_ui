/**
 * Draft entity type definitions.
 *
 * Drafts are saved locally and synced with the Zulip Drafts API.
 * Each draft has a type (stream or DM), target, and content.
 */

export type DraftType = "stream" | "private";

export interface Draft {
  /** Server-assigned ID (null if local-only, not yet synced). */
  id: number | null;
  /** "stream" for channel messages, "private" for DMs. */
  type: DraftType;
  /** For stream: [streamId]. For DM: recipient user IDs. */
  to: number[];
  /** Topic name (stream drafts only). */
  topic: string;
  /** Draft message content (markdown). */
  content: string;
  /** Last update timestamp (Unix seconds). */
  timestamp: number;
}

export interface DraftInput {
  type: DraftType;
  to: number[];
  topic: string;
  content: string;
}
