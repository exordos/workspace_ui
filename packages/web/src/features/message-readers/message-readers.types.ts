/**
 * Message Readers ("Read By" modal) type definitions.
 *
 * Displays which users have read a particular message when backend support exists.
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
