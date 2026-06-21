import type { MessengerGroupSettingValue } from "~/shared/api/messenger.types";
import type { MessageId } from "~/shared/lib/message-id.lib";
import type { UserId } from "~/shared/lib/user-id.lib";

export interface TopicWithLast {
  subject: string;
  lastMessage?: string;
  lastMessageSenderName?: string;
  time?: string;
  badge?: number;
  /** True when this topic has at least one unread @mention. */
  hasMention?: boolean;
}

export type SidebarChat =
  | {
      type: "stream";
      stream_id: number;
      name: string;
      lastMessage?: string;
      lastMessageSenderName?: string;
      time?: string;
      topics?: TopicWithLast[];
      badge?: number;
      hasMention?: boolean;
    }
  | {
      type: "dm";
      id: number;
      name: string;
      slug: string;
      lastMessage?: string;
      time?: string;
      badge?: number;
      hasMention?: boolean;
      pinned?: boolean;
      userIds?: UserId[];
      streamUuid?: string;
      sourceStreamUuid?: string;
      userUuid?: string;
      avatar_url?: string;
      ts?: number;
    };

export interface SidebarProps {
  streams: {
    stream_id: number;
    name: string;
    lastMessage?: string;
    time?: string;
    topics?: TopicWithLast[];
  }[];
  selectedFolderId: string;
  pinFolderId?: string;
  activeStreamSlug?: string | null;
  activeTopic?: string | null;
  activeDmIdParam?: string | null;
  sidebarDms?: Extract<SidebarChat, { type: "dm" }>[];
  sidebarChats?: SidebarChat[];
  sidebarChatsLoading?: boolean;
}

export interface StreamWithLast {
  stream_id: number;
  name: string;
  lastMessage?: string;
  lastMessageSenderName?: string;
  time?: string;
  topics?: TopicWithLast[];
  badge?: number;
  hasMention?: boolean;
}

export interface StreamEntryInternal {
  stream_id: number;
  /** Per-user stream UUID; used to fetch channel messages via the me/messages endpoint. */
  streamUuid?: string;
  /** Source stream UUID; used to create messages via the gateway messages endpoint. */
  sourceStreamUuid?: string;
  name: string;
  lastMessage: string;
  lastMessageSenderName?: string;
  time: string;
  ts: number;
  isArchived?: boolean;
  creatorId?: number;
  inviteOnly?: boolean;
  canAddSubscribersGroup?: MessengerGroupSettingValue;
  canRemoveSubscribersGroup?: MessengerGroupSettingValue;
  canAdministerChannelGroup?: MessengerGroupSettingValue;
  canResolveTopicsGroup?: MessengerGroupSettingValue;
  canMoveMessagesOutOfChannelGroup?: MessengerGroupSettingValue;
  topics: Map<
    string,
    {
      subject: string;
      lastMessage: string;
      lastMessageSenderName?: string;
      time: string;
      ts: number;
      unreadCount: number;
      lastMessageId?: MessageId;
    }
  >;
}

export interface DmEntryInternal {
  id: number;
  name: string;
  slug: string;
  lastMessage: string;
  time: string;
  ts: number;
  userIds?: UserId[];
  streamUuid?: string;
  sourceStreamUuid?: string;
  userUuid?: string;
  unreadCount: number;
  avatar_url?: string;
  lastMessageId?: MessageId;
}
