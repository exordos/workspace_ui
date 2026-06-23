import type { MockMessage } from "~/shared/api/messenger.types";
import type { MessageId } from "~/shared/lib/message-id.lib";
import type { UserId } from "~/shared/lib/user-id.lib";
import type { MessageListCallbacks } from "~/widgets/message-list/message-list.types";

export type ChatMessagesLoadErrorKind = "initial" | "refresh";

export interface ChatPageMessageListSectionProps {
  messagesLoading: boolean;
  // True when initial payload exists for current route — blocking loader depends on data presence, not loading flag alone.
  hasInitialPayload: boolean;
  isDmView: boolean;
  activeDmUserIds: UserId[] | null;
  activeStreamId: string | null | undefined;
  activeStream: string | null | undefined;
  activeTopicUuid: string | null | undefined;
  activeTopic: string | null | undefined;
  messages: MockMessage[];
  currentUserId: UserId | undefined;
  callbacks: MessageListCallbacks;
  selectionMode: boolean;
  selectedMessageIds: Set<MessageId>;
  onLoadMore: () => void;
  isLoadingMore: boolean;
  isLoadingNewer: boolean;
  onLoadNewer: () => void;
  hasNewerMessages: boolean;
  firstUnreadId: MessageId | undefined;
  unreadCount: number;
  focusedMessageId: MessageId | null | undefined;
  /** Failed initial load (no cache) vs network refresh failed after IndexedDB hydrate. */
  messagesLoadError: ChatMessagesLoadErrorKind | null;
  onRetryMessagesLoad: () => void;
  /** Paginating older/newer messages failed (store). */
  boundaryLoadFailed: boolean;
  onDismissBoundaryLoadFailed: () => void;
  /** Bumped when the user sends a message so the list scrolls to the new tail */
  scrollToBottomAfterSendNonce: number;
}
