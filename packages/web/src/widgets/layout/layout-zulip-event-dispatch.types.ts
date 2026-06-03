import type { ChatListStreamMetadataRow } from "~/entities/chat-list/chat-list.model.types";
import type { CurrentChatContext } from "~/entities/message/message.model";
import type { IncomingDmCallInvite } from "~/features/jitsi-call/jitsi-call.model";
import type { MockMessage, ZulipRawMessage } from "~/shared/api/zulip.types";
import type { LinkPreviewData } from "~/shared/lib/message-link-preview.types";
import type { StreamEntryInternal } from "~/shared/types/sidebar-chat";

export type LayoutMessageFlagOp = "add" | "remove";

export interface LayoutChatListActions {
  currentUserId: number | null;
  // Current stream metadata map (partial channel-level permission updates).
  streamsMap: Map<number, StreamEntryInternal>;
  addMessage: (message: ZulipRawMessage, options?: { suppressUnreadBump?: boolean }) => void;
  // Upsert channels from metadata and subscription events.
  upsertStreamMetadataRows: (rows: ChatListStreamMetadataRow[]) => void;
  // Rename channel on subscription update(name).
  renameStream: (streamId: number, nextName: string) => void;
  // Move topic within channel on update_message rename (resolved/unresolved).
  moveStreamTopic: (params: {
    streamId: number;
    oldTopic: string;
    newTopic: string;
    messageIds?: number[];
    anchorMessageId?: number;
  }) => void;
  // Remove channel from sidebar on unsubscribe/remove.
  removeStream: (streamId: number) => void;
  decrementUnreadForMessages: (messageIds: number[]) => void;
  incrementUnreadForMessages: (messageIds: number[]) => void;
  handleDeleteMessages: (messageIds: number[]) => void;
}

export interface LayoutCurrentChatReaction {
  emoji_name: string;
  emoji_code: string;
  reaction_type: "unicode_emoji" | "realm_emoji" | "zulip_extra_emoji";
  user_id: number;
}

export interface LayoutCurrentChatActions {
  context: CurrentChatContext | null;
  hasNewerMessages: boolean;
  appendMessage: (message: MockMessage) => void;
  updateMessageFlags: (messageIds: number[], flag: string, op: LayoutMessageFlagOp) => void;
  updateMessageReaction: (
    messageId: number,
    reaction: LayoutCurrentChatReaction,
    op: LayoutMessageFlagOp,
  ) => void;
  removeMessages: (messageIds: number[]) => void;
  updateMessageContent: (messageId: number, content: string, markdownSource?: string) => void;
  updateMessageLinkPreview: (messageId: number, linkPreview: LinkPreviewData | null) => void;
  moveStreamTopicMessages: (params: {
    streamId: number;
    oldTopic: string;
    newTopic: string;
    messageIds?: number[];
    anchorMessageId?: number;
  }) => void;
}

export interface LayoutUsersActions {
  mergeFromMessage: (message: ZulipRawMessage) => void;
  setPresenceByEmail: (
    email: string,
    presence: { status: "active" | "idle"; timestamp: number },
  ) => void;
  setStatus: (
    userId: number,
    status: {
      text: string;
      emojiName?: string;
      emojiCode?: string;
      reactionType?: "unicode_emoji" | "realm_emoji" | "zulip_extra_emoji";
      away: boolean;
    } | null,
    updatedAtMs: number,
  ) => void;
}

export interface LayoutTypingActions {
  setTyping: (chatKey: string, userId: number, isTyping: boolean) => void;
}

export interface LayoutMuteActions {
  isEffectivelyMuted: (streamId: number, topic: string) => boolean;
  isTopicFollowed: (streamId: number, topic: string) => boolean;
  muteStream: (streamId: number) => void;
  unmuteStream: (streamId: number) => void;
  muteTopic: (streamId: number, topic: string) => void;
  unmuteTopic: (streamId: number, topic: string) => void;
  followTopic: (streamId: number, topic: string) => void;
  clearTopicVisibilityOverride: (streamId: number, topic: string) => void;
}

export interface LayoutActivityActions {
  markStale: () => void;
  markStarredSummaryStale: () => void;
}

export interface LayoutInboxActions {
  markStale: () => void;
}

export interface LayoutNotificationsActions {
  show: (options: { title: string; body: string; tag: string; silent?: boolean }) => Promise<void>;
  closeByTag: (tag: string) => void;
  playSound: (preset?: string) => void;
  getSoundPreset: () => string;
  requestAttentionIfNotFocused: () => void;
}

export interface LayoutJitsiCallActions {
  ingestIncomingInvite: (invite: IncomingDmCallInvite) => void;
}

export interface LayoutZulipEventDispatchContext {
  chatList: LayoutChatListActions;
  currentChat: LayoutCurrentChatActions;
  users: LayoutUsersActions;
  typing: LayoutTypingActions;
  mute: LayoutMuteActions;
  activity: LayoutActivityActions;
  inbox: LayoutInboxActions;
  notifications: LayoutNotificationsActions;
  jitsiCall: LayoutJitsiCallActions;
  updateLatestMessageId: (id: number) => void;
  // Notifies stream member changes from peer_add/peer_remove for external index updates.
  onStreamPeerMembersChanged?: (streamIds: number[]) => void;
  onMessage?: (message: ZulipRawMessage) => void;
}
