/**
 * Types for the chat-list Zustand store (see chat-list.model.ts).
 */
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import type {
  SidebarChat,
  StreamWithLast,
  StreamEntryInternal,
  DmEntryInternal,
} from "~/shared/types/sidebar-chat";

export type MessageLocation =
  | { type: "stream"; stream_id: number; topic: string }
  | { type: "dm"; dmKey: string };

export interface ChatListState {
  streamsMap: Map<number, StreamEntryInternal>;
  dmsMap: Map<string, DmEntryInternal>;
  currentUserId: number | null;
  lastAppliedMessages: ZulipRawMessage[] | null;
  messageIdToLocation: Map<number, MessageLocation>;
  setFromMessages: (messages: ZulipRawMessage[], currentUserId: number | null) => void;
  addMessage: (message: ZulipRawMessage) => void;
  addMessages: (messages: ZulipRawMessage[]) => void;
  setCurrentUserId: (id: number | null) => void;
  renameStream: (streamId: number, nextName: string) => void;
  removeStream: (streamId: number) => void;
  clear: () => void;
  decrementUnreadForMessages: (messageIds: number[]) => void;
  decrementUnreadForTopic: (streamId: number, topic: string, count: number) => void;
  decrementUnreadForDmKey: (dmKey: string, count: number) => void;
  incrementUnreadForMessages: (messageIds: number[]) => void;
  handleDeleteMessages: (messageIds: number[]) => void;
  streams: () => StreamWithLast[];
  dms: () => Extract<SidebarChat, { type: "dm" }>[];
}
