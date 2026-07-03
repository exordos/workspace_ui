import {
  resolveUserPresenceVisual,
  selectOnlineUserCount,
  selectUserDisplayName,
} from "~/entities/user/user-selectors.lib";
import type { UsersById } from "~/entities/user/user.types";
import type { WorkspaceMessengerRouteMatch } from "~/shared/lib/workspace-messenger-route.lib";
import type { PresenceVisual } from "~/shared/ui/presence-indicator.types";
import {
  selectWorkspaceConversationUiKind,
  selectWorkspaceStreamConversationUiKind,
} from "./messenger-conversation-ui-kind.lib";
import { selectMessengerConversationFromWorkspaceRoute } from "./messenger-ids.lib";
import type { MessengerStoreState } from "./messenger.model";
import type { MessengerUuid } from "./messenger.types";

type WorkspaceChatHeaderState = Pick<
  MessengerStoreState,
  | "conversationsById"
  | "streamsById"
  | "topicsById"
  | "streamBindingsById"
  | "streamBindingIdsByStreamId"
>;

export interface WorkspaceChatHeaderDirectPrivatePartnerView {
  name: string;
  avatarUrl: string | null;
  presenceState: PresenceVisual;
}

export interface WorkspaceChatHeaderChannelView {
  kind: "channel";
  channelName: string;
  topic?: string;
  hideTopic: boolean;
  participantsCount: number;
  onlineCount: number;
}

export interface WorkspaceChatHeaderDirectPrivateView {
  kind: "directPrivate";
  directUserUuid: MessengerUuid;
  dmPartner: WorkspaceChatHeaderDirectPrivatePartnerView;
}

export type WorkspaceChatHeaderView =
  | WorkspaceChatHeaderChannelView
  | WorkspaceChatHeaderDirectPrivateView;

export interface SelectWorkspaceChatHeaderViewOptions {
  route: WorkspaceMessengerRouteMatch | null;
  usersById: UsersById;
  fallbackTitle: string;
  missingDirectUserTitle: string;
}

function resolveDirectPrivateFallbackTitle(
  title: string | null | undefined,
  missingDirectUserTitle: string,
): string {
  const trimmedTitle = title?.trim() ?? "";
  return trimmedTitle.length > 0 ? trimmedTitle : missingDirectUserTitle;
}

export function selectWorkspaceChatHeaderView(
  state: WorkspaceChatHeaderState,
  { route, usersById, fallbackTitle, missingDirectUserTitle }: SelectWorkspaceChatHeaderViewOptions,
): WorkspaceChatHeaderView {
  const selection = selectMessengerConversationFromWorkspaceRoute(route);

  if (selection.status !== "conversation") {
    return {
      kind: "channel",
      channelName: `#${fallbackTitle}`,
      hideTopic: true,
      participantsCount: 0,
      onlineCount: 0,
    };
  }

  const conversation = state.conversationsById[selection.conversationId];
  const stream = state.streamsById[selection.streamUuid];
  const topic = selection.kind === "topic" ? state.topicsById[selection.topicUuid] : undefined;

  const routeUiKind =
    stream != null
      ? selectWorkspaceStreamConversationUiKind(stream)
      : conversation != null
        ? selectWorkspaceConversationUiKind(conversation)
        : "channel";
  const routeDirectUserUuid = stream?.directUserUuid ?? conversation?.directUserUuid ?? null;

  if (routeUiKind === "directPrivate") {
    const directUserUuid = routeDirectUserUuid;
    if (directUserUuid != null) {
      const user = usersById[directUserUuid];
      const directFallbackTitle = resolveDirectPrivateFallbackTitle(
        stream?.name ?? conversation?.title,
        missingDirectUserTitle,
      );

      return {
        kind: "directPrivate",
        directUserUuid,
        dmPartner: {
          name: selectUserDisplayName(user, directFallbackTitle),
          avatarUrl: user?.avatarUrl ?? null,
          presenceState: resolveUserPresenceVisual(user?.status),
        },
      };
    }
  }

  const title = stream?.name ?? conversation?.title ?? fallbackTitle;
  const bindingIds = state.streamBindingIdsByStreamId[selection.streamUuid] ?? [];
  let participantsCount = 0;
  const memberUserUuids: MessengerUuid[] = [];

  for (const bindingId of bindingIds) {
    const binding = state.streamBindingsById[bindingId];
    if (binding == null) continue;

    participantsCount += 1;
    memberUserUuids.push(binding.userUuid);
  }
  const onlineCount = selectOnlineUserCount(usersById, memberUserUuids);

  return {
    kind: "channel",
    channelName: `#${title}`,
    topic: selection.kind === "topic" ? (topic?.name ?? conversation?.title) : undefined,
    hideTopic: selection.kind !== "topic",
    participantsCount,
    onlineCount,
  };
}
