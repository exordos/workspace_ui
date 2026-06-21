import React from "react";
import { usePinStore } from "~/features/pin-chat/pin-chat.model";
import { SidebarFolderStreamRow } from "./sidebar-folder-stream-row.ui";
import { chatToWorkspaceChatId } from "./sidebar.lib";
import type { SidebarChat } from "./sidebar.types";

type SidebarStreamChat = Extract<SidebarChat, { type: "stream" }>;

export interface SidebarFolderChatRowProps {
  chat: SidebarStreamChat;
  pinApiFolderUuid: string | null;
  selectedFolderId?: string;
  isCompactDensity: boolean;
  canExpandStreams: boolean;
  expandedStreamSlugs: string[];
  activeStreamSlug: string | null;
  activeTopic: string | null;
  onToggleStream: ((slug: string) => void) | undefined;
  onNewTopic?: (streamSlug: string, topicName: string) => void;
}

export const SidebarFolderChatRow = React.memo(function SidebarFolderChatRow({
  chat,
  pinApiFolderUuid,
  selectedFolderId,
  isCompactDensity,
  canExpandStreams,
  expandedStreamSlugs,
  activeStreamSlug,
  activeTopic,
  onToggleStream,
  onNewTopic,
}: SidebarFolderChatRowProps): React.ReactElement {
  const chatWsId = chatToWorkspaceChatId(chat);
  const isPinnedChat =
    pinApiFolderUuid != null && usePinStore.getState().isPinned(pinApiFolderUuid, chatWsId);

  return (
    <SidebarFolderStreamRow
      chat={chat}
      isPinnedChat={isPinnedChat}
      selectedFolderId={selectedFolderId}
      isCompactDensity={isCompactDensity}
      canExpandStreams={canExpandStreams}
      expandedStreamSlugs={expandedStreamSlugs}
      activeStreamSlug={activeStreamSlug}
      activeTopic={activeTopic}
      onToggleStream={onToggleStream}
      onNewTopic={onNewTopic}
    />
  );
});
