import { useEffect, useMemo, useRef } from "react";
import type { UserRecord } from "~/entities/user/user.model";
import { getChatInfoNetworkKey } from "~/features/chat-info/chat-info.lib";
import { useChatInfoStore } from "~/features/chat-info/chat-info.model";
import type { ChatInfoContext } from "~/features/chat-info/chat-info.types";
import type { UserId } from "~/shared/lib/user-id.lib";
import type { SidebarChat } from "~/widgets/sidebar/sidebar.types";

export function useLayoutChatInfoSync(options: {
  currentInstanceId: string | null;
  dmChat: Extract<SidebarChat, { type: "dm" }> | undefined;
  dmParticipantIds: UserId[];
  activeStreamId: string | null;
  activeStreamName: string | null;
  topics: { name: string; topicUuid?: string; unreadCount: number; isDone?: boolean }[];
  usersMapForChatInfo: Map<string, UserRecord>;
}) {
  const {
    currentInstanceId,
    dmChat,
    dmParticipantIds,
    activeStreamId,
    activeStreamName,
    topics,
    usersMapForChatInfo,
  } = options;

  const chatInfoContext = useMemo<ChatInfoContext>(() => {
    if (!currentInstanceId) {
      return { kind: "none", instanceId: null };
    }
    if (dmChat) {
      return {
        kind: "dm",
        instanceId: currentInstanceId,
        dmName: dmChat.name,
        participantIds: dmParticipantIds,
      };
    }
    if (activeStreamId != null) {
      return {
        kind: "stream",
        instanceId: currentInstanceId,
        streamUuid: activeStreamId,
        streamName: activeStreamName ?? "",
        isMuted: false,
        topics,
      };
    }
    return { kind: "none", instanceId: currentInstanceId };
  }, [activeStreamId, activeStreamName, currentInstanceId, dmChat, dmParticipantIds, topics]);

  const chatInfoNetworkKey = useMemo(
    () => getChatInfoNetworkKey(chatInfoContext),
    [chatInfoContext],
  );
  const hydratedChatInfoKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (hydratedChatInfoKeyRef.current === chatInfoNetworkKey) {
      return;
    }
    hydratedChatInfoKeyRef.current = chatInfoNetworkKey;
    void useChatInfoStore.getState().hydrate(chatInfoContext);
  }, [chatInfoContext, chatInfoNetworkKey]);

  useEffect(() => {
    useChatInfoStore.getState().syncDerived(chatInfoContext);
  }, [chatInfoContext, usersMapForChatInfo]);

  const chatInfoData = useChatInfoStore((s) => s.data);
  return { chatInfoContext, chatInfoNetworkKey, chatInfoData };
}
