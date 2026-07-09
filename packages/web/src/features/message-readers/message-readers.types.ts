/**
 * Message Readers ("Read By" modal) type definitions.
 */

export interface MessageReadersState {
  loading: boolean;
  userIds: number[];
  error: string | null;
  messageId: number | null;
  unsupported: boolean;
  requestVersion: number;

  showUnsupported: (messageId: number) => void;
  clear: () => void;
}
