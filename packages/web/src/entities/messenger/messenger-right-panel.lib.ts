import type { WorkspaceMessengerStreamNotificationMode } from "~/shared/api/messenger.types";
import {
  type WorkspaceMessengerRouteMatch,
  workspaceMessengerTopicRoute,
} from "~/shared/lib/workspace-messenger-route.lib";
import {
  selectWorkspaceConversationUiKind,
  selectWorkspaceStreamConversationUiKind,
} from "./messenger-conversation-ui-kind.lib";
import { selectMessengerConversationFromWorkspaceRoute } from "./messenger-ids.lib";
import type { MessengerStoreState } from "./messenger.model";
import type { MessengerStreamBinding, MessengerUser, MessengerUuid } from "./messenger.types";

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

export interface WorkspaceRightPanelMemberView {
  bindingUuid: MessengerUuid;
  userUuid: MessengerUuid;
  name: string;
  email: string | null;
  status: MessengerUser["status"] | null;
  role: MessengerStreamBinding["role"];
  isOnline: boolean;
  isCurrentUser: boolean;
  canRemove: boolean;
}

export type WorkspaceRightPanelDirectPrivateDetailId =
  | "email"
  | "username"
  | "phone"
  | "jobTitle"
  | "manager"
  | "timezone"
  | "birthday";

export interface WorkspaceRightPanelDirectPrivateDetailView {
  id: WorkspaceRightPanelDirectPrivateDetailId;
  value: string;
  isTemporarilyUnavailable: boolean;
}

export interface WorkspaceRightPanelChannelInfoView {
  kind: "channel";
  streamUuid: string | null;
  notificationMode: WorkspaceMessengerStreamNotificationMode | null;
  title: string;
  description: string | null;
  participantsCount: number;
  onlineCount: number;
  members: WorkspaceRightPanelMemberView[];
  topics: WorkspaceRightPanelTopicView[];
}

export interface WorkspaceRightPanelDirectPrivateInfoView {
  kind: "directPrivate";
  directUserUuid: MessengerUuid;
  title: string;
  avatarUrl: null;
  status: MessengerUser["status"] | null;
  details: WorkspaceRightPanelDirectPrivateDetailView[];
}

export type WorkspaceRightPanelInfoView =
  | WorkspaceRightPanelChannelInfoView
  | WorkspaceRightPanelDirectPrivateInfoView;

export interface SelectWorkspaceRightPanelInfoViewOptions {
  route: WorkspaceMessengerRouteMatch | null;
  fallbackTitle: string;
  currentUserUuid?: MessengerUuid | null;
  temporarilyNotConnectedText: string;
}

function resolveWorkspaceRightPanelMemberName(
  user: MessengerUser | undefined,
  userUuid: MessengerUuid,
): string {
  if (user == null) return userUuid;

  const fullName = [user.firstName, user.lastName]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part.length > 0)
    .join(" ")
    .trim();
  if (fullName.length > 0) return fullName;

  const username = user.username.trim();
  if (username.length > 0) return username;

  const email = user.email?.trim() ?? "";
  return email.length > 0 ? email : userUuid;
}

function resolveWorkspaceRightPanelDirectUserName(
  user: MessengerUser | undefined,
  fallback: string,
): string {
  if (user == null) return fallback;
  return resolveWorkspaceRightPanelMemberName(user, fallback);
}

function createWorkspaceRightPanelDetail(
  id: WorkspaceRightPanelDirectPrivateDetailId,
  value: string | null | undefined,
  temporarilyNotConnectedText: string,
): WorkspaceRightPanelDirectPrivateDetailView {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length > 0) {
    return {
      id,
      value: trimmed,
      isTemporarilyUnavailable: false,
    };
  }

  return {
    id,
    value: temporarilyNotConnectedText,
    isTemporarilyUnavailable: true,
  };
}

function createWorkspaceRightPanelUnsupportedDetail(
  id: WorkspaceRightPanelDirectPrivateDetailId,
  temporarilyNotConnectedText: string,
): WorkspaceRightPanelDirectPrivateDetailView {
  return {
    id,
    value: temporarilyNotConnectedText,
    isTemporarilyUnavailable: true,
  };
}

export function canRemoveWorkspaceRightPanelMember(input: {
  isCurrentUser: boolean;
  isCurrentUserStreamOwner: boolean;
}): boolean {
  // Бизнес-правило Workspace: каждый участник может отписать сам себя, а чужих
  // участников может отписывать только владелец канала. Роли binding здесь не
  // используем, потому что backend пока не отдает отдельную матрицу прав.
  return input.isCurrentUser || input.isCurrentUserStreamOwner;
}

export function selectWorkspaceRightPanelInfoView(
  state: WorkspaceRightPanelState,
  {
    route,
    fallbackTitle,
    currentUserUuid = null,
    temporarilyNotConnectedText,
  }: SelectWorkspaceRightPanelInfoViewOptions,
): WorkspaceRightPanelInfoView | null {
  const selection = selectMessengerConversationFromWorkspaceRoute(route);
  if (selection.status !== "conversation" || route == null) return null;

  const stream = state.streamsById[selection.streamUuid];
  const conversation = state.conversationsById[selection.conversationId];
  const routeUiKind =
    stream != null
      ? selectWorkspaceStreamConversationUiKind(stream)
      : conversation != null
        ? selectWorkspaceConversationUiKind(conversation)
        : "channel";
  const routeDirectUserUuid = stream?.directUserUuid ?? conversation?.directUserUuid ?? null;

  if (routeUiKind === "directPrivate" && routeDirectUserUuid != null) {
    const user = state.usersById[routeDirectUserUuid];

    return {
      kind: "directPrivate",
      directUserUuid: routeDirectUserUuid,
      title: resolveWorkspaceRightPanelDirectUserName(user, temporarilyNotConnectedText),
      avatarUrl: null,
      status: user?.status ?? null,
      details: [
        createWorkspaceRightPanelDetail("email", user?.email, temporarilyNotConnectedText),
        createWorkspaceRightPanelDetail("username", user?.username, temporarilyNotConnectedText),
        createWorkspaceRightPanelUnsupportedDetail("phone", temporarilyNotConnectedText),
        createWorkspaceRightPanelUnsupportedDetail("jobTitle", temporarilyNotConnectedText),
        createWorkspaceRightPanelUnsupportedDetail("manager", temporarilyNotConnectedText),
        createWorkspaceRightPanelUnsupportedDetail("timezone", temporarilyNotConnectedText),
        createWorkspaceRightPanelUnsupportedDetail("birthday", temporarilyNotConnectedText),
      ],
    };
  }

  const titleSeed = stream?.name ?? (selection.kind === "stream" ? conversation?.title : undefined);
  const title = titleSeed != null && titleSeed.trim().length > 0 ? titleSeed : fallbackTitle;
  const bindingIds = state.streamBindingIdsByStreamId[selection.streamUuid] ?? [];
  const effectiveCurrentUserUuid = currentUserUuid ?? stream?.userUuid ?? null;
  // Право на удаление считаем в проекции, чтобы UI оставался тонким: панель
  // только показывает кнопку по готовому `canRemove`, а не знает правила ролей.
  const isCurrentUserStreamOwner =
    effectiveCurrentUserUuid != null && stream?.ownerUuid === effectiveCurrentUserUuid;
  const members = bindingIds
    .map((bindingId) => state.streamBindingsById[bindingId])
    .filter((binding): binding is NonNullable<typeof binding> => binding != null)
    .map((binding): WorkspaceRightPanelMemberView => {
      const user = state.usersById[binding.userUuid];
      const isCurrentUser = binding.userUuid === effectiveCurrentUserUuid;
      return {
        bindingUuid: binding.uuid,
        userUuid: binding.userUuid,
        name: resolveWorkspaceRightPanelMemberName(user, binding.userUuid),
        email: user?.email?.trim() || null,
        status: user?.status ?? null,
        role: binding.role,
        isOnline: user?.status === "active",
        isCurrentUser,
        canRemove: canRemoveWorkspaceRightPanelMember({
          isCurrentUser,
          isCurrentUserStreamOwner,
        }),
      };
    });
  const participantsCount = members.length;
  const onlineCount = members.reduce((total, member) => total + (member.isOnline ? 1 : 0), 0);

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
    kind: "channel",
    streamUuid: stream?.uuid ?? null,
    notificationMode: stream?.notificationMode ?? null,
    title: `#${title}`,
    description: rawDescription != null && rawDescription.length > 0 ? rawDescription : null,
    participantsCount,
    onlineCount,
    members,
    topics,
  };
}
