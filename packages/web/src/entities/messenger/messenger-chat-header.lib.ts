import type { WorkspaceMessengerRouteMatch } from "~/shared/lib/workspace-messenger-route.lib";
import { selectMessengerConversationFromWorkspaceRoute } from "./messenger-ids.lib";
import type { MessengerStoreState } from "./messenger.model";

type WorkspaceChatHeaderState = Pick<
  MessengerStoreState,
  | "conversationsById"
  | "streamsById"
  | "topicsById"
  | "streamBindingsById"
  | "streamBindingIdsByStreamId"
  | "usersById"
>;

export interface WorkspaceChatHeaderView {
  channelName: string;
  topic?: string;
  hideTopic: boolean;
  participantsCount: number;
  onlineCount: number;
}

export interface SelectWorkspaceChatHeaderViewOptions {
  route: WorkspaceMessengerRouteMatch | null;
  fallbackTitle: string;
}

export function selectWorkspaceChatHeaderView(
  state: WorkspaceChatHeaderState,
  { route, fallbackTitle }: SelectWorkspaceChatHeaderViewOptions,
): WorkspaceChatHeaderView {
  const selection = selectMessengerConversationFromWorkspaceRoute(route);

  if (selection.status !== "conversation") {
    return {
      channelName: `#${fallbackTitle}`,
      hideTopic: true,
      participantsCount: 0,
      onlineCount: 0,
    };
  }

  const conversation = state.conversationsById[selection.conversationId];
  const stream = state.streamsById[selection.streamUuid];
  const topic = selection.kind === "topic" ? state.topicsById[selection.topicUuid] : undefined;
  const title = stream?.name ?? conversation?.title ?? fallbackTitle;
  const bindingIds = state.streamBindingIdsByStreamId[selection.streamUuid] ?? [];
  let participantsCount = 0;
  let onlineCount = 0;

  for (const bindingId of bindingIds) {
    const binding = state.streamBindingsById[bindingId];
    if (binding == null) continue;

    participantsCount += 1;
    if (state.usersById[binding.userUuid]?.status === "active") {
      onlineCount += 1;
    }
  }

  return {
    channelName: `#${title}`,
    topic: selection.kind === "topic" ? (topic?.name ?? conversation?.title) : undefined,
    hideTopic: selection.kind !== "topic",
    participantsCount,
    onlineCount,
  };
}
