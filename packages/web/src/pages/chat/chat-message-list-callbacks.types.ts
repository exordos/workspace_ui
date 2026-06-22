import type { MessageReactionPayload, MockMessage } from "~/shared/api/messenger.types";
import type { MessageId } from "~/shared/lib/message-id.lib";
import type { UserId } from "~/shared/lib/user-id.lib";
import type { Dispatch, SetStateAction } from "react";
import type { NavigateFunction } from "react-router-dom";

export interface UseChatMessageListCallbacksParams {
  selectionMode: boolean;
  currentUserId: UserId | null;
  /** Active organization realm base URL for reply-quote permalinks */
  realmBaseUrl: string;
  streams: { stream_uuid: string; name: string }[];
  locationPathname: string;
  locationSearch: string;
  isDmView: boolean;
  dmRecipientIds: UserId[];
  resolvedStreamId: string | null;
  topicName: string | undefined;
  streamRouteTopic: string;
  navigate: NavigateFunction;
  rightDrawer: { openUserProfile?: (userId: UserId) => void } | null;
  setReplyQuote: Dispatch<
    SetStateAction<{
      id: MessageId;
      content: string;
      sender_full_name: string;
      sender_id: UserId;
      permalinkUrl: string | null;
    } | null>
  >;
  requestMessageEdit: (message: MockMessage) => void;
  setDeleteConfirm: Dispatch<
    SetStateAction<
      { type: "single"; messageId: MessageId } | { type: "bulk"; messageIds: MessageId[] } | null
    >
  >;
  setToastMessage: Dispatch<SetStateAction<string | null>>;
  setForwardMessages: Dispatch<SetStateAction<MockMessage[]>>;
  setForwardSelectedText: Dispatch<SetStateAction<string | undefined>>;
  setActionError: Dispatch<SetStateAction<string | null>>;
  setSelectedMessageIds: Dispatch<SetStateAction<Set<MessageId>>>;
  setSelectionMode: Dispatch<SetStateAction<boolean>>;
  updateMessageFlagsInStore: (ids: MessageId[], flag: string, op: "add" | "remove") => void;
  onMessageAddReaction: (messageId: MessageId, payload: MessageReactionPayload) => void;
  onMessageRemoveReaction: (messageId: MessageId, payload: MessageReactionPayload) => void;
  openJitsiCall: (url: string, locationName: string) => void;
  setReadReceiptsOpen: Dispatch<SetStateAction<boolean>>;
  onRetryFailedOutgoing: (message: MockMessage) => void;
  onRemoveFailedOutgoing: (message: MockMessage) => void;
  onRetryFailedEdit: (message: MockMessage) => void;
  onCancelFailedEdit: (message: MockMessage) => void;
}
