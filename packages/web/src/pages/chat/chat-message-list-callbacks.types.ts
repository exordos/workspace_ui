import type { MockMessage, Reaction } from "~/shared/api/zulip";
import type { Dispatch, SetStateAction } from "react";
import type { NavigateFunction } from "react-router-dom";

export interface UseChatMessageListCallbacksParams {
  selectionMode: boolean;
  currentUserId: number | null;
  /** Active Zulip realm base URL for reply-quote permalinks */
  realmBaseUrl: string;
  streams: { stream_id: number; name: string }[];
  locationPathname: string;
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
  setEditingMessage: Dispatch<SetStateAction<MockMessage | null>>;
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
  updateMessageReactionInStore: (
    messageId: number,
    reaction: Reaction,
    op: "add" | "remove",
  ) => void;
  openJitsiCall: (url: string, locationName: string) => void;
  setReadReceiptsOpen: Dispatch<SetStateAction<boolean>>;
  onRetryFailedOutgoing: (message: MockMessage) => void;
  onRemoveFailedOutgoing: (message: MockMessage) => void;
}
