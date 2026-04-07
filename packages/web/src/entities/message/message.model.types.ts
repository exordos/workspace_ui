import type {
  MockMessage,
  MockMessageDeliveryStatus,
  Reaction,
} from "~/shared/api/zulip.types";

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
  isLoadingMore: boolean;
  hasOlderMessages: boolean;
  hasNewerMessages: boolean;
  setContext: (context: CurrentChatContext | null) => void;
  setMessages: (messages: MockMessage[]) => void;
  prependMessages: (msgs: MockMessage[]) => void;
  appendMessages: (msgs: MockMessage[]) => void;
  appendMessage: (msg: MockMessage) => void;
  removeMessage: (messageId: number) => void;
  removeMessages: (messageIds: number[]) => void;
  updateMessageReaction: (messageId: number, reaction: Reaction, op: "add" | "remove") => void;
  updateMessageFlags: (messageIds: number[], flag: string, op: "add" | "remove") => void;
  updateMessageContent: (messageId: number, content: string) => void;
  setIsLoadingMore: (loading: boolean) => void;
  setHasOlderMessages: (has: boolean) => void;
  setHasNewerMessages: (has: boolean) => void;
  setContextFromNavigation: (context: CurrentChatContext | null) => void;

  loadInitialMessagesForContext: (options: {
    context: CurrentChatContext;
    focusedMessageId: number | null;
    currentUserId: number | null;
  }) => Promise<void>;
  loadOlderBoundaryPage: (options: { pageSize: number; currentUserId: number | null }) => Promise<void>;
  loadNewerBoundaryPage: (options: { pageSize: number; currentUserId: number | null }) => Promise<void>;
}
