import type { MockMessage, MockMessageDeliveryStatus, Reaction } from "~/shared/api/zulip.types";

export type CurrentChatContext =
  | {
      type: "stream";
      streamId: number;
      streamName: string;
      topic: string;
      /** True when the route is `/stream/:slug` without `/topic/...` (whole-stream view). */
      streamWideView?: boolean;
    }
  | { type: "dm"; dmKey: string };

export interface CurrentChatMessagesState {
  context: CurrentChatContext | null;
  messages: MockMessage[];
  /**
   * FIFO keys (`local_echo_key`) for optimistic sends still waiting for a server id.
   * Drives pairing when several outgoing messages are in flight.
   */
  pendingOutgoingEchoKeys: number[];
  isLoadingMore: boolean;
  hasOlderMessages: boolean;
  hasNewerMessages: boolean;
  setContext: (context: CurrentChatContext | null) => void;
  setMessages: (messages: MockMessage[]) => void;
  prependMessages: (msgs: MockMessage[]) => void;
  appendMessages: (msgs: MockMessage[]) => void;
  appendMessage: (msg: MockMessage) => void;
  /** Replaces optimistic row and/or merges with an existing server echo in one update. */
  commitOutgoingMessage: (optimisticId: number, finalMessage: MockMessage) => void;
  removeMessage: (messageId: number) => void;
  removeMessages: (messageIds: number[]) => void;
  updateMessageReaction: (messageId: number, reaction: Reaction, op: "add" | "remove") => void;
  updateMessageFlags: (messageIds: number[], flag: string, op: "add" | "remove") => void;
  updateMessageContent: (messageId: number, content: string, markdownSource?: string) => void;
  setIsLoadingMore: (loading: boolean) => void;
  setHasOlderMessages: (has: boolean) => void;
  setHasNewerMessages: (has: boolean) => void;
  setContextFromNavigation: (context: CurrentChatContext | null) => void;

  loadInitialMessagesForContext: (options: {
    context: CurrentChatContext;
    focusedMessageId: number | null;
    currentUserId: number | null;
  }) => Promise<void>;
  loadOlderBoundaryPage: (options: {
    pageSize: number;
    currentUserId: number | null;
  }) => Promise<void>;
  loadNewerBoundaryPage: (options: {
    pageSize: number;
    currentUserId: number | null;
  }) => Promise<void>;
}
