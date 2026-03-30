import type {
  MockMessage,
  MockMessageDeliveryStatus,
  Reaction,
} from "~/shared/api/zulip.types";

export type CurrentChatContext =
  | { type: "stream"; streamId: number; streamName: string; topic: string }
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
}
