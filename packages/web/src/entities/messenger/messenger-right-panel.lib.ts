import {
  resolveUserPresenceVisual,
  selectUserDisplayName,
} from "~/entities/user/user-selectors.lib";
import type { User, UsersById } from "~/entities/user/user.types";
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
import type { MessengerStreamBinding, MessengerUuid } from "./messenger.types";

type WorkspaceRightPanelState = Pick<
  MessengerStoreState,
  | "conversationsById"
  | "streamsById"
  | "topicsById"
  | "topicIds"
  | "streamBindingsById"
  | "streamBindingIdsByStreamId"
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
  avatarUrl: string | null;
  email: string | null;
  status: User["status"] | null;
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
  color: number | null;
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
  avatarUrl: string | null;
  status: User["status"] | null;
  details: WorkspaceRightPanelDirectPrivateDetailView[];
}

export interface WorkspaceRightPanelUserProfileInfoView {
  kind: "userProfile";
  userUuid: MessengerUuid;
  title: string;
  avatarUrl: string | null;
  status: User["status"] | null;
  details: WorkspaceRightPanelDirectPrivateDetailView[];
}

export type WorkspaceRightPanelInfoView =
  | WorkspaceRightPanelChannelInfoView
  | WorkspaceRightPanelDirectPrivateInfoView
  | WorkspaceRightPanelUserProfileInfoView;

export interface SelectWorkspaceRightPanelInfoViewOptions {
  route: WorkspaceMessengerRouteMatch | null;
  usersById: UsersById;
  fallbackTitle: string;
  currentUserUuid?: MessengerUuid | null;
  workspaceUserUuidOverride?: MessengerUuid | null;
  temporarilyNotConnectedText: string;
}

function resolveWorkspaceRightPanelMemberName(
  user: User | undefined,
  userUuid: MessengerUuid,
): string {
  return selectUserDisplayName(user, userUuid);
}

function resolveWorkspaceRightPanelDirectUserName(
  user: User | undefined,
  fallback: string,
): string {
  return selectUserDisplayName(user, fallback);
}

function resolveDirectPrivateFallbackTitle(
  title: string | null | undefined,
  temporarilyNotConnectedText: string,
): string {
  const trimmedTitle = title?.trim() ?? "";
  return trimmedTitle.length > 0 ? trimmedTitle : temporarilyNotConnectedText;
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

function createWorkspaceRightPanelUserDetails(
  user: User | undefined,
  temporarilyNotConnectedText: string,
): WorkspaceRightPanelDirectPrivateDetailView[] {
  return [
    createWorkspaceRightPanelDetail("email", user?.email, temporarilyNotConnectedText),
    createWorkspaceRightPanelDetail("username", user?.username, temporarilyNotConnectedText),
    createWorkspaceRightPanelUnsupportedDetail("phone", temporarilyNotConnectedText),
    createWorkspaceRightPanelUnsupportedDetail("jobTitle", temporarilyNotConnectedText),
    createWorkspaceRightPanelUnsupportedDetail("manager", temporarilyNotConnectedText),
    createWorkspaceRightPanelUnsupportedDetail("timezone", temporarilyNotConnectedText),
    createWorkspaceRightPanelUnsupportedDetail("birthday", temporarilyNotConnectedText),
  ];
}

function createWorkspaceRightPanelUserProfileInfoView(
  userUuid: MessengerUuid,
  user: User | undefined,
  temporarilyNotConnectedText: string,
): WorkspaceRightPanelUserProfileInfoView {
  return {
    kind: "userProfile",
    userUuid,
    title: resolveWorkspaceRightPanelDirectUserName(user, userUuid),
    avatarUrl: user?.avatarUrl ?? null,
    status: user?.status ?? null,
    details: createWorkspaceRightPanelUserDetails(user, temporarilyNotConnectedText),
  };
}

export function canRemoveWorkspaceRightPanelMember(input: {
  isCurrentUser: boolean;
  isCurrentUserStreamOwner: boolean;
}): boolean {
  // Workspace business rule: every member can remove themselves, and only the
  // channel owner can remove other members. Binding roles are not used here
  // because the backend does not expose a separate permission matrix yet.
  return input.isCurrentUser || input.isCurrentUserStreamOwner;
}

export function selectWorkspaceRightPanelInfoView(
  state: WorkspaceRightPanelState,
  {
    route,
    usersById,
    fallbackTitle,
    currentUserUuid = null,
    workspaceUserUuidOverride = null,
    temporarilyNotConnectedText,
  }: SelectWorkspaceRightPanelInfoViewOptions,
): WorkspaceRightPanelInfoView | null {
  const selection = selectMessengerConversationFromWorkspaceRoute(route);
  if (selection.status !== "conversation" || route == null) return null;

  const normalizedWorkspaceUserUuidOverride = workspaceUserUuidOverride?.trim() ?? "";
  if (normalizedWorkspaceUserUuidOverride.length > 0) {
    return createWorkspaceRightPanelUserProfileInfoView(
      normalizedWorkspaceUserUuidOverride,
      usersById[normalizedWorkspaceUserUuidOverride],
      temporarilyNotConnectedText,
    );
  }

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
    const user = usersById[routeDirectUserUuid];
    const directFallbackTitle = resolveDirectPrivateFallbackTitle(
      stream?.name ?? conversation?.title,
      temporarilyNotConnectedText,
    );

    return {
      kind: "directPrivate",
      directUserUuid: routeDirectUserUuid,
      title: resolveWorkspaceRightPanelDirectUserName(user, directFallbackTitle),
      avatarUrl: user?.avatarUrl ?? null,
      status: user?.status ?? null,
      details: createWorkspaceRightPanelUserDetails(user, temporarilyNotConnectedText),
    };
  }

  const titleSeed = stream?.name ?? (selection.kind === "stream" ? conversation?.title : undefined);
  const title = titleSeed != null && titleSeed.trim().length > 0 ? titleSeed : fallbackTitle;
  const bindingIds = state.streamBindingIdsByStreamId[selection.streamUuid] ?? [];
  const effectiveCurrentUserUuid = currentUserUuid ?? stream?.userUuid ?? null;
  // Calculate remove permission in the projection, so UI stays thin: the panel
  // only shows the button from ready `canRemove` and does not know role rules.
  const isCurrentUserStreamOwner =
    effectiveCurrentUserUuid != null && stream?.ownerUuid === effectiveCurrentUserUuid;
  const members = bindingIds
    .map((bindingId) => state.streamBindingsById[bindingId])
    .filter((binding): binding is NonNullable<typeof binding> => binding != null)
    .map((binding): WorkspaceRightPanelMemberView => {
      const user = usersById[binding.userUuid];
      const isCurrentUser = binding.userUuid === effectiveCurrentUserUuid;
      return {
        bindingUuid: binding.uuid,
        userUuid: binding.userUuid,
        name: resolveWorkspaceRightPanelMemberName(user, binding.userUuid),
        avatarUrl: user?.avatarUrl ?? null,
        email: user?.email?.trim() || null,
        status: user?.status ?? null,
        role: binding.role,
        isOnline: resolveUserPresenceVisual(user?.status) === "active",
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
    color: stream?.color ?? null,
    description: rawDescription != null && rawDescription.length > 0 ? rawDescription : null,
    participantsCount,
    onlineCount,
    members,
    topics,
  };
}
