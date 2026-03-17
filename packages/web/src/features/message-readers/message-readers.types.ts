/**
 * Message Readers ("Read By" modal) type definitions.
 *
 * Zulip API: GET /messages/{id}/read_receipts → { user_ids: number[] }
 * Displays which users have read a particular message.
 */

export interface ReadReceiptsResponse {
  user_ids: number[];
}

export interface MessageReadersState {
  loading: boolean;
  userIds: number[];
  error: string | null;
  messageId: number | null;

  fetchReadReceipts: (messageId: number) => Promise<void>;
  clear: () => void;
}
