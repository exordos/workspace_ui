import type {
  MessengerGroupSettingValue,
  MessengerSource,
  MessengerSourceName,
} from "~/shared/api/messenger.types";
import type { MessageId } from "~/shared/lib/message-id.lib";
import type { UserId } from "~/shared/lib/user-id.lib";

export interface TopicWithLast {
  topicUuid?: string;
  subject: string;
  lastMessage?: string;
  lastMessageSenderName?: string;
  time?: string;
  badge?: number;
  /** True when this topic has at least one unread @mention. */
  hasMention?: boolean;
  /** Server-owned done state. UI may render a checkmark, but the topic name stays unchanged. */
  isDone?: boolean;
  /** Server-owned topic color as 0xRRGGBB. */
  color?: number;
  sourceName?: MessengerSourceName;
  source?: MessengerSource;
}

export type SidebarChat =
  | {
      type: "stream";
      streamUuid: string;
      private?: boolean;
      /** Server-owned stream color as 0xRRGGBB. */
      color?: number;
      sourceName?: MessengerSourceName;
      source?: MessengerSource;
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
      id: UserId;
      name: string;
      slug: string;
      lastMessage?: string;
      time?: string;
      badge?: number;
      hasMention?: boolean;
      pinned?: boolean;
      userIds?: UserId[];
      streamUuid?: string;
      userUuid?: string;
      avatar_url?: string;
      ts?: number;
    };

export interface SidebarProps {
  streams: {
    streamUuid: string;
    private?: boolean;
    /** Server-owned stream color as 0xRRGGBB. */
    color?: number;
    sourceName?: MessengerSourceName;
    source?: MessengerSource;
    name: string;
    lastMessage?: string;
    time?: string;
    topics?: TopicWithLast[];
  }[];
  selectedFolderId: string;
  pinFolderId?: string;
  activeStreamSlug?: string | null;
  activeTopic?: string | null;
  sidebarChats?: Extract<SidebarChat, { type: "stream" }>[];
  sidebarChatsLoading?: boolean;
}

export interface StreamWithLast {
  streamUuid: string;
  private?: boolean;
  /** Server-owned stream color as 0xRRGGBB. */
  color?: number;
  sourceName?: MessengerSourceName;
  source?: MessengerSource;
  name: string;
  lastMessage?: string;
  lastMessageSenderName?: string;
  time?: string;
  topics?: TopicWithLast[];
  badge?: number;
  hasMention?: boolean;
}

export interface StreamEntryInternal {
  /** Workspace stream UUID used as the stream identity and for gateway reads/writes. */
  streamUuid: string;
  /** Workspace private streams are shown in Personal. */
  private?: boolean;
  /** Server-owned stream color as 0xRRGGBB. */
  color?: number;
  name: string;
  lastMessage: string;
  lastMessageSenderName?: string;
  time: string;
  ts: number;
  unreadCount?: number;
  isArchived?: boolean;
  creatorId?: string;
  inviteOnly?: boolean;
  sourceName?: MessengerSourceName;
  source?: MessengerSource;
  canAddSubscribersGroup?: MessengerGroupSettingValue;
  canRemoveSubscribersGroup?: MessengerGroupSettingValue;
  canAdministerChannelGroup?: MessengerGroupSettingValue;
  canResolveTopicsGroup?: MessengerGroupSettingValue;
  canMoveMessagesOutOfChannelGroup?: MessengerGroupSettingValue;
  topics: Map<
    string,
    {
      topicUuid?: string;
      subject: string;
      lastMessage: string;
      lastMessageSenderName?: string;
      time: string;
      ts: number;
      unreadCount: number;
      isDone?: boolean;
      /** Server-owned topic color as 0xRRGGBB. */
      color?: number;
      sourceName?: MessengerSourceName;
      source?: MessengerSource;
      lastMessageId?: MessageId;
    }
  >;
}

export interface DmEntryInternal {
  id: UserId;
  name: string;
  slug: string;
  lastMessage: string;
  time: string;
  ts: number;
  userIds?: UserId[];
  streamUuid?: string;
  userUuid?: string;
  unreadCount: number;
  avatar_url?: string;
  lastMessageId?: MessageId;
}
