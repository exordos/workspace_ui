import type { MockMessage } from "~/shared/api/zulip.types";
import type { MessageListCallbacks } from "~/widgets/message-list/message-list.types";

export type ChatMessagesLoadErrorKind = "initial" | "refresh";

export interface ChatPageMessageListSectionProps {
  messagesLoading: boolean;
  // Что делает: показывает, что для текущего route-контекста уже есть initial payload.
  // Зачем: блокирующий loader должен зависеть от факта наличия данных, а не только от флага загрузки.
  hasInitialPayload: boolean;
  isDmView: boolean;
  activeDmUserIds: number[] | null;
  activeStream: string | null | undefined;
  activeTopic: string | null | undefined;
  messages: MockMessage[];
  currentUserId: number | undefined;
  callbacks: MessageListCallbacks;
  selectionMode: boolean;
  selectedMessageIds: Set<number>;
  onLoadMore: () => void;
  isLoadingMore: boolean;
  isLoadingNewer: boolean;
  onLoadNewer: () => void;
  hasNewerMessages: boolean;
  firstUnreadId: number | undefined;
  unreadCount: number;
  focusedMessageId: number | null | undefined;
  onUnreadMessagesVisible: (messageIds: number[]) => void;
  onUnreadMessagesAtBottom: (messageIds: number[]) => void;
  /** Failed initial load (no cache) vs network refresh failed after IndexedDB hydrate. */
  messagesLoadError: ChatMessagesLoadErrorKind | null;
  onRetryMessagesLoad: () => void;
  /** Paginating older/newer messages failed (store). */
  boundaryLoadFailed: boolean;
  onDismissBoundaryLoadFailed: () => void;
  /** Bumped when the user sends a message so the list scrolls to the new tail */
  scrollToBottomAfterSendNonce: number;
}
