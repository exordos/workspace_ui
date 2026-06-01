import React from "react";
import { usePinStore } from "~/features/pin-chat/pin-chat.model";
import { DmContextMenu } from "./sidebar-chat-context-menu.ui";
import { DmChatRow } from "./sidebar-folder-dm-row.ui";
import { SidebarFolderStreamRow } from "./sidebar-folder-stream-row.ui";
import { chatToWorkspaceChatId } from "./sidebar.lib";
import type { NewTopicDialogState } from "./sidebar-folder-chat-list.types";
import type { SidebarChat } from "./sidebar.types";

export interface SidebarFolderChatRowProps {
  chat: SidebarChat;
  pinApiFolderUuid: string | null;
  pinScopeFolderId: string | undefined;
  isCompactDensity: boolean;
  canExpandStreams: boolean;
  expandedStreamSlugs: string[];
  activeStreamSlug: string | null;
  activeDmIdParam: string | null;
  activeTopic: string | null;
  isStreamMuted: (streamId: number) => boolean;
  onToggleStream: ((slug: string) => void) | undefined;
  onNewTopic: ((streamSlug: string, topicName: string) => void) | undefined;
  openTopicDialogForStream: (state: NewTopicDialogState) => void;
  onMuteError: (retry: () => void) => void;
}

export const SidebarFolderChatRow = React.memo(function SidebarFolderChatRow({
  chat,
  pinApiFolderUuid,
  pinScopeFolderId,
  isCompactDensity,
  canExpandStreams,
  expandedStreamSlugs,
  activeStreamSlug,
  activeDmIdParam,
  activeTopic,
  isStreamMuted,
  onToggleStream,
  onNewTopic,
  openTopicDialogForStream,
  onMuteError,
}: SidebarFolderChatRowProps): React.ReactElement {
  const chatWsId = chatToWorkspaceChatId(chat);
  const isPinnedChat =
    pinApiFolderUuid != null && usePinStore.getState().isPinned(pinApiFolderUuid, chatWsId);
  const dmTriggerOffsetClassName = isCompactDensity ? "right-1 top-6" : "right-1 top-8";

  if (chat.type === "stream") {
    return (
      <SidebarFolderStreamRow
        chat={chat}
        pinScopeFolderId={pinScopeFolderId}
        isPinnedChat={isPinnedChat}
        isCompactDensity={isCompactDensity}
        canExpandStreams={canExpandStreams}
        expandedStreamSlugs={expandedStreamSlugs}
        activeStreamSlug={activeStreamSlug}
        activeTopic={activeTopic}
        isStreamMuted={isStreamMuted}
        onToggleStream={onToggleStream}
        onNewTopic={onNewTopic}
        openTopicDialogForStream={openTopicDialogForStream}
        onMuteError={onMuteError}
      />
    );
  }

  return (
    <DmContextMenu
      chat={chat}
      folderId={pinScopeFolderId}
      triggerOffsetClassName={dmTriggerOffsetClassName}
    >
      <DmChatRow
        chat={chat}
        isActive={chat.slug === activeDmIdParam}
        isPinned={isPinnedChat}
        compact={isCompactDensity}
      />
    </DmContextMenu>
  );
});
