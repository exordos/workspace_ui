import type { MockMessage } from "~/shared/api/zulip.types";
import type { MessageListCallbacks } from "~/widgets/message-list/message-list.types";

export interface ChatPageMessageListSectionProps {
  messagesLoading: boolean;
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
  onLoadNewer: () => void;
  hasNewerMessages: boolean;
  firstUnreadId: number | undefined;
  unreadCount: number;
  focusedMessageId: number | null | undefined;
  onUnreadMessagesVisible: (messageIds: number[]) => void;
  onUnreadMessagesAtBottom: (messageIds: number[]) => void;
}
