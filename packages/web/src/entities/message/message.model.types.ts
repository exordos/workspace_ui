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
  /** True only while load-newer pagination is in flight (excludes load-older). */
  isLoadingNewer: boolean;
  hasOlderMessages: boolean;
  hasNewerMessages: boolean;
  /** True after loadOlder/loadNewer network failure until cleared from UI. */
  boundaryLoadFailed: boolean;
  clearBoundaryLoadFailed: () => void;
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
  moveStreamTopicMessages: (params: {
    streamId: number;
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
    // Что делает: сигнализирует UI, что cache-first payload уже применён в store.
    // Зачем: отделить блокирующий loader (нет данных) от фонового refresh (данные уже есть).
    onCacheHydrated?: () => void;
    // Что делает: позволяет отменить in-flight initial загрузку при быстром route-switch.
    // Зачем: старый запрос не должен продолжать сетевую работу и конкурировать с новым.
    signal?: AbortSignal;
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
