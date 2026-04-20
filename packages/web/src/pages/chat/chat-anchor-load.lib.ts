import type { MockMessage } from "~/shared/api/zulip.types";
import { dmRouteKey } from "~/shared/lib/dm-key";
import {
  chatKeyFromMockMessage,
  normalizeStreamTopicForMessageCache,
} from "~/shared/lib/message-cache-keys.lib";

interface IsFocusedMessageLoadedInRouteParams {
  focusedMessageId: number | null;
  messages: MockMessage[];
  isDmView: boolean;
  currentUserId: number | null;
  dmRecipientIds: number[];
  resolvedStreamId: number | null;
  topicName: string | undefined;
  streamRouteTopic: string;
}

export function isFocusedMessageLoadedInRoute(
  params: IsFocusedMessageLoadedInRouteParams,
): boolean {
  const {
    focusedMessageId,
    messages,
    isDmView,
    currentUserId,
    dmRecipientIds,
    resolvedStreamId,
    topicName,
    streamRouteTopic,
  } = params;
  if (focusedMessageId == null) return false;
  const focusedMessage = messages.find((message) => message.id === focusedMessageId);
  if (focusedMessage == null) return false;

  if (isDmView) {
    const messageChatKey = chatKeyFromMockMessage(focusedMessage, currentUserId);
    if (messageChatKey == null) return false;
    const expectedDmKey = `dm:${dmRouteKey(dmRecipientIds, currentUserId)}`;
    return messageChatKey === expectedDmKey;
  }

  if (resolvedStreamId == null || focusedMessage.stream_id !== resolvedStreamId) {
    return false;
  }
  if (topicName == null) return true;
  return normalizeStreamTopicForMessageCache(focusedMessage.subject ?? "") === streamRouteTopic;
}
