import type { MessageReactionPayload, MockMessage } from "~/shared/api/zulip.types";
import type { Dispatch, SetStateAction } from "react";
import type { NavigateFunction } from "react-router-dom";

export interface UseChatMessageListCallbacksParams {
  selectionMode: boolean;
  currentUserId: number | null;
  /** Active Zulip realm base URL for reply-quote permalinks */
  realmBaseUrl: string;
  streams: { stream_id: number; name: string }[];
  locationPathname: string;
  locationSearch: string;
  isDmView: boolean;
  dmRecipientIds: number[];
  resolvedStreamId: number | null;
  topicName: string | undefined;
  streamRouteTopic: string;
  navigate: NavigateFunction;
  rightDrawer: { openUserProfile?: (userId: number) => void } | null;
  setReplyQuote: Dispatch<
    SetStateAction<{
      id: number;
      content: string;
      sender_full_name: string;
      sender_id: number;
      permalinkUrl: string | null;
    } | null>
  >;
  requestMessageEdit: (message: MockMessage) => void;
  setDeleteConfirm: Dispatch<
    SetStateAction<
      { type: "single"; messageId: number } | { type: "bulk"; messageIds: number[] } | null
    >
  >;
  setToastMessage: Dispatch<SetStateAction<string | null>>;
  setForwardMessages: Dispatch<SetStateAction<MockMessage[]>>;
  setForwardSelectedText: Dispatch<SetStateAction<string | undefined>>;
  setActionError: Dispatch<SetStateAction<string | null>>;
  setSelectedMessageIds: Dispatch<SetStateAction<Set<number>>>;
  setSelectionMode: Dispatch<SetStateAction<boolean>>;
  updateMessageFlagsInStore: (ids: number[], flag: string, op: "add" | "remove") => void;
  onMessageAddReaction: (messageId: number, payload: MessageReactionPayload) => void;
  onMessageRemoveReaction: (messageId: number, payload: MessageReactionPayload) => void;
  openJitsiCall: (url: string, locationName: string) => void;
  setReadReceiptsOpen: Dispatch<SetStateAction<boolean>>;
  onRetryFailedOutgoing: (message: MockMessage) => void;
  onRemoveFailedOutgoing: (message: MockMessage) => void;
}
