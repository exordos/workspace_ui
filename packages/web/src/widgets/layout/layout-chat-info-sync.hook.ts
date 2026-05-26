import { useEffect, useMemo, useRef } from "react";
import { getChatInfoNetworkKey } from "~/features/chat-info/chat-info.lib";
import { useChatInfoStore } from "~/features/chat-info/chat-info.model";
import type { ChatInfoContext } from "~/features/chat-info/chat-info.types";
import type { SidebarChat } from "~/widgets/sidebar/sidebar.types";

export function useLayoutChatInfoSync(options: {
  currentInstanceId: string | null;
  dmChat: Extract<SidebarChat, { type: "dm" }> | undefined;
  dmParticipantIds: number[];
  activeStreamId: number | null;
  activeStreamName: string | null;
  mutedStreamIds: Set<number>;
  topics: { name: string; unreadCount: number }[];
  usersMapForChatInfo: Map<number, unknown>;
}) {
  const {
    currentInstanceId,
    dmChat,
    dmParticipantIds,
    activeStreamId,
    activeStreamName,
    mutedStreamIds,
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
        streamId: activeStreamId,
        streamName: activeStreamName ?? "",
        isMuted: mutedStreamIds.has(activeStreamId),
        topics,
      };
    }
    return { kind: "none", instanceId: currentInstanceId };
  }, [
    activeStreamId,
    activeStreamName,
    currentInstanceId,
    dmChat,
    dmParticipantIds,
    mutedStreamIds,
    topics,
  ]);

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
