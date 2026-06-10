import type { MockMessage, Reaction } from "~/shared/api/zulip.types";
import type { LinkPreviewData } from "~/shared/lib/message-link-preview.types";

export type DmMessagesAppliedSource = "cache" | "api";

export interface OnDmMessagesAppliedPayload {
  messages: readonly MockMessage[];
  context: CurrentChatContext;
  hasNewerMessages: boolean;
  focusedMessageId: number | null;
  source: DmMessagesAppliedSource;
}

export type StreamMessagesAppliedSource = "cache" | "api";

export interface OnStreamMessagesAppliedPayload {
  messages: readonly MockMessage[];
  context: { type: "stream"; streamId: number };
  hasNewerMessages: boolean;
  focusedMessageId: number | null;
  source: StreamMessagesAppliedSource;
}

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
  /** True only while load-newer pagination is in flight (excludes load-older). */
  isLoadingNewer: boolean;
  hasOlderMessages: boolean;
  hasNewerMessages: boolean;
  /** True after loadOlder/loadNewer network failure until cleared from UI. */
  boundaryLoadFailed: boolean;
  /** Set when initial message load fails for the active chat context. */
  initialLoadError: string | null;
  clearBoundaryLoadFailed: () => void;
  clearInitialLoadError: () => void;
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
  updateMessageLinkPreview: (messageId: number, linkPreview: LinkPreviewData | null) => void;
  moveStreamTopicMessages: (params: {
    streamId: number;
    oldTopic: string;
    newTopic: string;
    messageIds?: number[];
    anchorMessageId?: number;
  }) => void;
  moveTopicToStreamMessages: (params: {
    sourceStreamId: number;
    targetStreamId: number;
    targetStreamName: string;
    oldTopic: string;
    newTopic: string;
    messageIds?: number[];
    anchorMessageId?: number;
  }) => void;
  setIsLoadingMore: (loading: boolean) => void;
  setHasOlderMessages: (has: boolean) => void;
  setHasNewerMessages: (has: boolean) => void;
  setContextFromNavigation: (context: CurrentChatContext | null) => void;

  loadInitialMessagesForContext: (options: {
    context: CurrentChatContext;
    focusedMessageId: number | null;
    currentUserId: number | null;
    /** Fired once cache-first payload is in store — use to hide blocking loader while API refresh runs. */
    onCacheHydrated?: () => void;
    /** Aborts in-flight initial load on fast route switches so stale requests do not compete. */
    signal?: AbortSignal;
    /** After cache/API apply for a DM — sync sidebar preview from loaded messages (pages/widgets wire this). */
    onDmMessagesApplied?: (payload: OnDmMessagesAppliedPayload) => void;
    /** After cache/API apply for a stream — sync sidebar topic previews from loaded messages. */
    onStreamMessagesApplied?: (payload: OnStreamMessagesAppliedPayload) => void;
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
