export interface TopicWithLast {
  subject: string;
  lastMessage?: string;
  lastMessageSenderName?: string;
  time?: string;
  badge?: number;
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
    }
  | {
      type: "dm";
      id: number;
      name: string;
      slug: string;
      isGroup?: boolean;
      lastMessage?: string;
      time?: string;
      badge?: number;
      pinned?: boolean;
      userIds?: number[];
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
  // Признак загрузки списка чатов выбранной папки.
  sidebarChatsLoading?: boolean;
  pinReorderMode?: boolean;
  onExitPinReorderMode?: () => void;
}

export interface StreamWithLast {
  stream_id: number;
  name: string;
  lastMessage?: string;
  lastMessageSenderName?: string;
  time?: string;
  topics?: TopicWithLast[];
  badge?: number;
}

export interface StreamEntryInternal {
  stream_id: number;
  name: string;
  lastMessage: string;
  lastMessageSenderName?: string;
  time: string;
  ts: number;
  topics: Map<
    string,
    {
      subject: string;
      lastMessage: string;
      lastMessageSenderName?: string;
      time: string;
      ts: number;
      unreadCount: number;
      lastMessageId?: number;
    }
  >;
}

export interface DmEntryInternal {
  id: number;
  name: string;
  slug: string;
  isGroup: boolean;
  lastMessage: string;
  time: string;
  ts: number;
  userIds?: number[];
  unreadCount: number;
  avatar_url?: string;
  lastMessageId?: number;
}
