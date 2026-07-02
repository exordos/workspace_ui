import type { WorkspaceMessengerRouteMatch } from "~/shared/lib/workspace-messenger-route.lib";
import {
  selectWorkspaceConversationUiKind,
  selectWorkspaceStreamConversationUiKind,
} from "./messenger-conversation-ui-kind.lib";
import { selectMessengerConversationFromWorkspaceRoute } from "./messenger-ids.lib";
import type { MessengerStoreState } from "./messenger.model";
import type { MessengerUser, MessengerUuid } from "./messenger.types";

type WorkspaceChatHeaderState = Pick<
  MessengerStoreState,
  | "conversationsById"
  | "streamsById"
  | "topicsById"
  | "streamBindingsById"
  | "streamBindingIdsByStreamId"
  | "usersById"
>;

export interface WorkspaceChatHeaderDirectPrivatePartnerView {
  name: string;
  avatarUrl: null;
  presenceState: "active" | "idle" | "offline" | null;
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
  fallbackTitle: string;
  missingDirectUserTitle: string;
}

function resolveWorkspaceHeaderUserName(user: MessengerUser | undefined, fallback: string): string {
  if (user == null) return fallback;

  const fullName = [user.firstName, user.lastName]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part.length > 0)
    .join(" ")
    .trim();
  if (fullName.length > 0) return fullName;

  const username = user.username.trim();
  if (username.length > 0) return username;

  const email = user.email?.trim() ?? "";
  return email.length > 0 ? email : fallback;
}

function resolveWorkspaceHeaderPresenceState(
  user: MessengerUser | undefined,
): WorkspaceChatHeaderDirectPrivatePartnerView["presenceState"] {
  if (user == null) return null;
  if (user.status === "do_not_disturb") return "idle";
  return user.status;
}

export function selectWorkspaceChatHeaderView(
  state: WorkspaceChatHeaderState,
  { route, fallbackTitle, missingDirectUserTitle }: SelectWorkspaceChatHeaderViewOptions,
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
      const user = state.usersById[directUserUuid];

      return {
        kind: "directPrivate",
        directUserUuid,
        dmPartner: {
          // Источник правды для заголовка личного диалога — новый Workspace messenger store.
          // Старый user store относится к Zulip-модели и может быть пустым или указывать на другого
          // пользователя, пока приложение находится на Workspace-маршруте.
          name: resolveWorkspaceHeaderUserName(user, missingDirectUserTitle),
          avatarUrl: null,
          presenceState: resolveWorkspaceHeaderPresenceState(user),
        },
      };
    }
  }

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
    kind: "channel",
    channelName: `#${title}`,
    topic: selection.kind === "topic" ? (topic?.name ?? conversation?.title) : undefined,
    hideTopic: selection.kind !== "topic",
    participantsCount,
    onlineCount,
  };
}
