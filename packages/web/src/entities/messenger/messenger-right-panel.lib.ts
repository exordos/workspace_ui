import {
  type WorkspaceMessengerRouteMatch,
  workspaceMessengerTopicRoute,
} from "~/shared/lib/workspace-messenger-route.lib";
import { selectMessengerConversationFromWorkspaceRoute } from "./messenger-ids.lib";
import type { MessengerStoreState } from "./messenger.model";

type WorkspaceRightPanelState = Pick<
  MessengerStoreState,
  | "conversationsById"
  | "streamsById"
  | "topicsById"
  | "topicIds"
  | "streamBindingsById"
  | "streamBindingIdsByStreamId"
  | "usersById"
>;

export interface WorkspaceRightPanelTopicView {
  id: string;
  name: string;
  unreadCount: number;
  route: string;
}

export interface WorkspaceRightPanelInfoView {
  title: string;
  description: string | null;
  participantsCount: number;
  onlineCount: number;
  topics: WorkspaceRightPanelTopicView[];
}

export interface SelectWorkspaceRightPanelInfoViewOptions {
  route: WorkspaceMessengerRouteMatch | null;
  fallbackTitle: string;
}

export function selectWorkspaceRightPanelInfoView(
  state: WorkspaceRightPanelState,
  { route, fallbackTitle }: SelectWorkspaceRightPanelInfoViewOptions,
): WorkspaceRightPanelInfoView | null {
  const selection = selectMessengerConversationFromWorkspaceRoute(route);
  if (selection.status !== "conversation" || route == null) return null;

  const stream = state.streamsById[selection.streamUuid];
  const conversation = state.conversationsById[selection.conversationId];
  const titleSeed = stream?.name ?? (selection.kind === "stream" ? conversation?.title : undefined);
  const title = titleSeed != null && titleSeed.trim().length > 0 ? titleSeed : fallbackTitle;
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

  const topics = state.topicIds
    .map((topicId) => state.topicsById[topicId])
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate != null)
    .filter((candidate) => candidate.streamUuid === selection.streamUuid)
    .map((candidate) => ({
      id: candidate.uuid,
      name: candidate.name,
      unreadCount: candidate.unreadCount,
      route: workspaceMessengerTopicRoute({
        orgId: route.orgId,
        projectId: route.projectId,
        streamUuid: candidate.streamUuid,
        topicUuid: candidate.uuid,
      }),
    }));

  const rawDescription = stream?.description?.trim();

  return {
    title: `#${title}`,
    description: rawDescription != null && rawDescription.length > 0 ? rawDescription : null,
    participantsCount,
    onlineCount,
    topics,
  };
}
