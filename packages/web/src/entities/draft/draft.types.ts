/**
 * Draft entity type definitions.
 *
 * Drafts are saved locally. Workspace API does not expose a drafts contract.
 */

export type DraftType = "stream" | "private";

export interface Draft {
  /** Local draft identifier, or null for timestamp-only drafts. */
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
