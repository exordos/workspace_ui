/**
 * Message Readers ("Read By" modal) type definitions.
 *
 * Messenger API: GET /messages/{id}/read_receipts → { user_ids: number[] }
 * Displays which users have read a particular message.
 */
import type { MessageId } from "~/shared/lib/message-id.lib";

export interface ReadReceiptsResponse {
  user_ids: number[];
}

export interface MessageReadersState {
  loading: boolean;
  userIds: number[];
  error: string | null;
  messageId: MessageId | null;
  requestVersion: number;

  fetchReadReceipts: (messageId: MessageId) => Promise<void>;
  clear: () => void;
}
