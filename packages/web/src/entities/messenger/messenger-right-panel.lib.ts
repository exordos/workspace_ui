import {
  resolveUserPresenceVisual,
  selectUserDisplayName,
} from "~/entities/user/user-selectors.lib";
import type { User, UsersById } from "~/entities/user/user.types";
import type {
  WorkspaceMessengerStreamNotificationMode,
  WorkspaceMessengerTopicNotificationMode,
} from "~/shared/api/messenger.types";
import { formatDateJoined } from "~/shared/lib/datetime.lib";
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
  activeUnreadCount?: number;
  passiveUnreadCount?: number;
  notificationMode: WorkspaceMessengerTopicNotificationMode;
  route: string;
}

export interface WorkspaceRightPanelTopicSummaryView {
  topicUuid: MessengerUuid;
  topicName: string;
  text: string | null;
  hasNewMessages: boolean | null;
  enabled: boolean;
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
  | "userId"
  | "email"
  | "phone"
  | "jobTitle"
  | "manager"
  | "role"
  | "accountType"
  | "accountStatus"
  | "timezone"
  | "localTime"
  | "joined"
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
  topicSummary?: WorkspaceRightPanelTopicSummaryView | null;
}

export interface WorkspaceRightPanelDirectPrivateInfoView {
  kind: "directPrivate";
  directUserUuid: MessengerUuid;
  title: string;
  avatarUrl: string | null;
  status: User["status"] | null;
  /** True when the panel shows the signed-in user's own profile. */
  isOwnProfile: boolean;
  details: WorkspaceRightPanelDirectPrivateDetailView[];
}

export interface WorkspaceRightPanelUserProfileInfoView {
  kind: "userProfile";
  userUuid: MessengerUuid;
  title: string;
  avatarUrl: string | null;
  status: User["status"] | null;
  /** True when the panel shows the signed-in user's own profile. */
  isOwnProfile: boolean;
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

function resolveIsOwnProfile(
  profileUserUuid: MessengerUuid,
  currentUserUuid: MessengerUuid | null | undefined,
): boolean {
  const normalizedCurrent = currentUserUuid?.trim() ?? "";
  return normalizedCurrent.length > 0 && normalizedCurrent === profileUserUuid;
}

function createWorkspaceRightPanelUserDetails(
  user: User | undefined,
  userUuid: MessengerUuid,
  temporarilyNotConnectedText: string,
): WorkspaceRightPanelDirectPrivateDetailView[] {
  const joined = formatDateJoined(user?.createdAt);
  return [
    createWorkspaceRightPanelDetail("userId", userUuid, temporarilyNotConnectedText),
    createWorkspaceRightPanelDetail("email", user?.email, temporarilyNotConnectedText),
    createWorkspaceRightPanelUnsupportedDetail("phone", temporarilyNotConnectedText),
    createWorkspaceRightPanelUnsupportedDetail("jobTitle", temporarilyNotConnectedText),
    createWorkspaceRightPanelUnsupportedDetail("manager", temporarilyNotConnectedText),
    createWorkspaceRightPanelUnsupportedDetail("role", temporarilyNotConnectedText),
    createWorkspaceRightPanelUnsupportedDetail("accountType", temporarilyNotConnectedText),
    createWorkspaceRightPanelUnsupportedDetail("accountStatus", temporarilyNotConnectedText),
    createWorkspaceRightPanelUnsupportedDetail("timezone", temporarilyNotConnectedText),
    createWorkspaceRightPanelUnsupportedDetail("localTime", temporarilyNotConnectedText),
    createWorkspaceRightPanelDetail("joined", joined, temporarilyNotConnectedText),
    createWorkspaceRightPanelUnsupportedDetail("birthday", temporarilyNotConnectedText),
  ];
}

/**
 * Builds a user-profile right-panel view without requiring an open conversation route.
 * Used by the account menu "Personal info" subview.
 */
export function createWorkspaceRightPanelUserProfileView(options: {
  userUuid: MessengerUuid;
  usersById: UsersById;
  currentUserUuid?: MessengerUuid | null;
  temporarilyNotConnectedText: string;
}): WorkspaceRightPanelUserProfileInfoView {
  const userUuid = options.userUuid.trim();
  const user = options.usersById[userUuid];
  return {
    kind: "userProfile",
    userUuid,
    title: resolveWorkspaceRightPanelDirectUserName(user, userUuid),
    avatarUrl: user?.avatarUrl ?? null,
    status: user?.status ?? null,
    isOwnProfile: resolveIsOwnProfile(userUuid, options.currentUserUuid),
    details: createWorkspaceRightPanelUserDetails(
      user,
      userUuid,
      options.temporarilyNotConnectedText,
    ),
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
    return createWorkspaceRightPanelUserProfileView({
      userUuid: normalizedWorkspaceUserUuidOverride,
      usersById,
      currentUserUuid,
      temporarilyNotConnectedText,
    });
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
      isOwnProfile: resolveIsOwnProfile(routeDirectUserUuid, currentUserUuid),
      details: createWorkspaceRightPanelUserDetails(
        user,
        routeDirectUserUuid,
        temporarilyNotConnectedText,
      ),
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
      activeUnreadCount: candidate.activeUnreadCount,
      passiveUnreadCount: candidate.passiveUnreadCount,
      notificationMode: candidate.notificationMode,
      route: workspaceMessengerTopicRoute({
        orgId: route.orgId,
        projectId: route.projectId,
        streamUuid: candidate.streamUuid,
        topicUuid: candidate.uuid,
      }),
    }));

  const rawDescription = stream?.description?.trim();
  const selectedTopic =
    selection.kind === "topic" ? state.topicsById[selection.topicUuid] : undefined;

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
    ...(selectedTopic == null
      ? {}
      : {
          topicSummary: {
            topicUuid: selectedTopic.uuid,
            topicName: selectedTopic.name,
            text: selectedTopic.summary ?? null,
            hasNewMessages: selectedTopic.summaryHasNewMessages ?? null,
            enabled: selectedTopic.summaryEnabled ?? true,
          },
        }),
  };
}
