import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { useUsersStore } from "~/entities/user/user.model";
import { AddStreamMembersDialog } from "~/features/add-stream-members/add-stream-members-dialog.ui";
import { useAddStreamMembersStore } from "~/features/add-stream-members/add-stream-members.model";
import { useChatInfoStore } from "~/features/chat-info/chat-info.model";
import {
  EXTERNAL_CAPABILITY,
  isExternalCapabilityAvailable,
} from "~/features/external-accounts/external-capabilities.lib";
import { ExternalOperationPreflightDialog } from "~/features/external-accounts/external-operation-preflight-dialog.ui";
import { useExternalOperationPreflight } from "~/features/external-accounts/external-operation-preflight.hook";
import { runOptimisticStreamNotificationLevelUpdate } from "~/features/mute-chat/mute-chat-notification.optimistic.lib";
import { setStreamNotificationLevel } from "~/features/mute-chat/mute-chat.api";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { StreamNotificationLevelSwitch } from "~/features/mute-chat/stream-notification-level-switch.ui";
import type { StreamNotificationLevel } from "~/features/mute-chat/stream-notification-level.lib";
import { t } from "~/i18n/i18n";
import {
  archiveStream,
  deleteStream,
  deleteStreamBinding,
  deleteTopic,
  unarchiveStream,
  updateStream,
  updateStreamBindingRole,
} from "~/shared/api/messenger-streams";
import type { WorkspaceStreamRole } from "~/shared/api/messenger.types";
import { useRightDrawer } from "~/shared/contexts/right-drawer";
import { createLogger } from "~/shared/lib/logger";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { resolveCurrentUserChannelCapabilities } from "~/shared/lib/stream-member-management-permissions.lib";
import { resolveCanonicalStreamName } from "~/shared/lib/stream-name.lib";
import { resolveTopicDisplayInfo } from "~/shared/lib/topic-display.lib";
import { encodeTopicForRoute, normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { formatTopicDoneLabel } from "~/shared/lib/topic-resolve";
import { userIdsEqual, userIdStorageKey, type UserId } from "~/shared/lib/user-id.lib";
import { Avatar } from "~/shared/ui/avatar";
import {
  DropdownMenu,
  type DropdownMenuContextAnchor,
  type DropdownMenuItem,
} from "~/shared/ui/dropdown-menu";
import { Icon } from "~/shared/ui/icon";
import { PresenceIndicator } from "~/shared/ui/presence-indicator";
import { ScrollArea } from "~/shared/ui/scroll-area";
import { RightPanelUser } from "./right-panel-user.ui";
import {
  buildRightPanelStreamMembers,
  buildStreamSlug,
  resolveAvatarSrc,
  type RightPanelStreamMemberViewModel,
} from "./right-panel.lib";
import type { RightPanelInfoProps } from "./right-panel.types";

const log = createLogger("right-panel");

// Fallback edit seed: strip leading "#" from channel title when stream name isn't loaded yet.
function stripSingleUiHashPrefix(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("#")) return trimmed;
  return trimmed.slice(1).trimStart();
}

const STREAM_MEMBER_EDITABLE_ROLES: readonly WorkspaceStreamRole[] = [
  "guest",
  "member",
  "moderator",
  "administrator",
];

function isContextMenuKeyboardEvent(event: React.KeyboardEvent): boolean {
  return event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
}

function buildStreamRoleLabels(): Record<WorkspaceStreamRole, string> {
  return {
    owner: t("roles.owner"),
    administrator: t("roles.admin"),
    moderator: t("roles.moderator"),
    member: t("roles.member"),
    guest: t("roles.guest"),
  };
}

export const RightPanelInfo: React.FC<RightPanelInfoProps> = ({
  title,
  participantsCount = 0,
  onlineCount = 0,
  user,
  onOpenDirectMessage,
}) => {
  const navigate = useNavigate();
  const rightDrawer = useRightDrawer();
  const chatInfoData = useChatInfoStore((s) => s.data);
  const streamMemberIds = useChatInfoStore((s) => s.streamMemberIds);
  const streamMemberRolesByUserId = useChatInfoStore((s) => s.streamMemberRolesByUserId);
  const streamMemberBindingUuidsByUserId = useChatInfoStore(
    (s) => s.streamMemberBindingUuidsByUserId,
  );
  const context = useCurrentChatMessagesStore((s) => s.context);
  const streamId = context?.type === "stream" ? context.streamId : null;
  const currentUserId = useChatListStore((s) => s.currentUserId);
  const streamMetadataHydrated = useChatListStore((s) => s.streamMetadataHydrated);
  const streamEntry = useChatListStore((s) =>
    streamId != null ? s.streamsMap.get(streamId) : undefined,
  );
  const streamProvider = streamEntry?.provider ?? null;
  const currentInstanceId = useInstancesStore((s) => s.currentInstanceId);
  const users = useUsersStore((s) => s.users);
  const currentUserStreamRole =
    currentUserId != null ? streamMemberRolesByUserId[userIdStorageKey(currentUserId)] : null;
  const channelActionCapabilities = useMemo(
    () =>
      streamId != null
        ? resolveCurrentUserChannelCapabilities({
            currentUserStreamRole,
          })
        : {
            canAddSubscribers: false,
            canRemoveSubscribers: false,
            canEditChannelMetadata: false,
            canArchiveChannel: false,
          },
    [currentUserStreamRole, streamId],
  );
  const canRenameExternalStream =
    streamProvider == null ||
    isExternalCapabilityAvailable(streamProvider.capabilities, EXTERNAL_CAPABILITY.streamRename);
  const canEditChannel =
    streamId != null && channelActionCapabilities.canEditChannelMetadata && canRenameExternalStream;
  const canArchiveChannel = streamId != null && channelActionCapabilities.canArchiveChannel;
  const canDeleteTopic = channelActionCapabilities.canEditChannelMetadata;
  const canAddMembers = streamId != null && channelActionCapabilities.canAddSubscribers;
  const canRemoveMembers = streamId != null && channelActionCapabilities.canRemoveSubscribers;
  const isCurrentStreamArchived = streamEntry?.isArchived === true;
  const canDeleteStream =
    streamId != null &&
    currentUserId != null &&
    streamEntry?.creatorId != null &&
    userIdsEqual(currentUserId, streamEntry.creatorId);
  const notificationLevel = useMuteStore((s) =>
    streamId != null ? s.getStreamNotificationLevel(streamId) : "default",
  );
  const [notificationPending, setNotificationPending] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [channelActionPending, setChannelActionPending] = useState(false);
  const [channelActionError, setChannelActionError] = useState<string | null>(null);
  const [topicDeletePendingName, setTopicDeletePendingName] = useState<string | null>(null);
  const [topicDeleteError, setTopicDeleteError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [memberMenuOpen, setMemberMenuOpen] = useState(false);
  const [memberMenuAnchor, setMemberMenuAnchor] = useState<DropdownMenuContextAnchor | null>(null);
  const [memberMenuUserKey, setMemberMenuUserKey] = useState<string | null>(null);
  const [memberMenuStreamId, setMemberMenuStreamId] = useState<string | null>(null);
  const [memberActionPendingKey, setMemberActionPendingKey] = useState<string | null>(null);
  const [memberActionError, setMemberActionError] = useState<string | null>(null);
  const externalPreflight = useExternalOperationPreflight();
  const openAddMembers = useAddStreamMembersStore((s) => s.openForStream);
  const syncExistingMembers = useAddStreamMembersStore((s) => s.setExistingMemberIds);

  const handleSetNotificationLevel = useCallback(
    async (level: StreamNotificationLevel) => {
      if (streamId == null || notificationPending || notificationLevel === level) return;

      setNotificationPending(true);
      setNotificationError(null);
      try {
        log.info("Setting stream notification level from right panel", { streamId, level });
        const ok = await runOptimisticStreamNotificationLevelUpdate({
          streamId,
          level,
          request: () => setStreamNotificationLevel(streamId, level),
        });
        if (!ok) {
          setNotificationError(t("app.error"));
        }
      } finally {
        setNotificationPending(false);
      }
    },
    [notificationLevel, notificationPending, streamId],
  );

  const handleOpenDirectMessage = useCallback(
    (userId: UserId) => {
      if (onOpenDirectMessage) {
        onOpenDirectMessage(userId);
        return;
      }
      void navigate(withCurrentOrgRoute(`/dm/${encodeURIComponent(String(userId))}`));
    },
    [navigate, onOpenDirectMessage],
  );
  const handleOpenUserProfile = useCallback(
    (userId: UserId) => {
      rightDrawer?.openUserProfile?.(userId);
    },
    [rightDrawer],
  );
  const streamInfoData = chatInfoData?.type === "stream" ? chatInfoData : null;
  const canonicalStreamName = useMemo(
    () =>
      resolveCanonicalStreamName({
        streamId,
        streamMapName: streamEntry?.name,
      }),
    [streamEntry?.name, streamId],
  );
  const handleOpenTopic = useCallback(
    (topic: { name: string; topicUuid?: string }) => {
      if (streamId == null) {
        return;
      }
      const topicRouteSegment = topic.topicUuid ?? topic.name;
      void navigate(
        withCurrentOrgRoute(
          `/stream/${buildStreamSlug(streamId)}/topic/${encodeURIComponent(
            encodeTopicForRoute(topicRouteSegment),
          )}`,
        ),
      );
    },
    [navigate, streamId],
  );
  const handleOpenAddMembers = useCallback(() => {
    if (streamId == null) return;
    if (canonicalStreamName == null) {
      log.warn("Blocked add-members without canonical stream name", { streamId });
      setChannelActionError(t("app.error"));
      return;
    }
    openAddMembers({
      streamId,
      streamName: canonicalStreamName,
      existingMemberIds: streamMemberIds,
    });
  }, [canonicalStreamName, openAddMembers, streamId, streamMemberIds]);
  // Refetch channel members after add/remove invalidation.
  const handleStreamMembersChangedSuccess = useCallback(
    (updatedStreamId: string) => {
      if (currentInstanceId == null) return;
      useChatInfoStore.getState().invalidateStream(currentInstanceId, updatedStreamId);
    },
    [currentInstanceId],
  );
  const canManageMember = useCallback(
    (member: RightPanelStreamMemberViewModel): boolean =>
      canRemoveMembers &&
      currentUserId != null &&
      member.bindingUuid != null &&
      !userIdsEqual(member.userId, currentUserId) &&
      !member.isStreamOwner,
    [canRemoveMembers, currentUserId],
  );

  const handleRemoveMember = useCallback(
    async (member: RightPanelStreamMemberViewModel) => {
      if (streamId == null || member.bindingUuid == null || !canManageMember(member)) return;
      const userKey = userIdStorageKey(member.userId);
      setMemberActionPendingKey(userKey);
      setMemberActionError(null);
      const ok = await deleteStreamBinding(member.bindingUuid);
      if (!ok) {
        setMemberActionError(t("channel.memberActionFailed"));
        setMemberActionPendingKey(null);
        return;
      }
      useChatInfoStore.getState().applyStreamMemberRemoval(member.userId);
      handleStreamMembersChangedSuccess(streamId);
      setMemberMenuOpen(false);
      setMemberActionPendingKey(null);
    },
    [canManageMember, handleStreamMembersChangedSuccess, streamId],
  );

  const handleChangeMemberRole = useCallback(
    async (member: RightPanelStreamMemberViewModel, role: WorkspaceStreamRole) => {
      if (streamId == null || member.bindingUuid == null || !canManageMember(member)) return;
      if (member.role === role) {
        setMemberMenuOpen(false);
        return;
      }
      const userKey = userIdStorageKey(member.userId);
      setMemberActionPendingKey(userKey);
      setMemberActionError(null);
      const ok = await updateStreamBindingRole(member.bindingUuid, role);
      if (!ok) {
        setMemberActionError(t("channel.memberActionFailed"));
        setMemberActionPendingKey(null);
        return;
      }
      useChatInfoStore.getState().applyStreamMemberRoleUpdate(member.userId, role);
      handleStreamMembersChangedSuccess(streamId);
      setMemberMenuOpen(false);
      setMemberActionPendingKey(null);
    },
    [canManageMember, handleStreamMembersChangedSuccess, streamId],
  );
  const streamMembers = streamInfoData?.members;
  const hasRealMembers = streamMembers != null && streamMembers.length > 0;
  const streamRoleLabels = useMemo(() => buildStreamRoleLabels(), []);
  const memberFallbackLabel = t("roles.member");
  const onlineLabel = t("presence.online");
  const offlineLabel = t("presence.offline");
  // Memoize member view-model to avoid remapping on UI-only rerenders.
  const members = useMemo(
    () =>
      hasRealMembers && streamMembers != null
        ? buildRightPanelStreamMembers({
            members: streamMembers,
            users,
            streamMemberRolesByUserId,
            streamMemberBindingUuidsByUserId,
            roleLabels: streamRoleLabels,
            memberFallbackLabel,
            onlineLabel,
            offlineLabel,
          })
        : [],
    [
      hasRealMembers,
      memberFallbackLabel,
      offlineLabel,
      onlineLabel,
      streamMembers,
      streamMemberBindingUuidsByUserId,
      streamMemberRolesByUserId,
      streamRoleLabels,
      users,
    ],
  );

  const memberMenuMatchesStream = memberMenuStreamId === streamId;
  const selectedMember = useMemo(
    () =>
      memberMenuUserKey == null || !memberMenuMatchesStream
        ? null
        : (members.find((member) => userIdStorageKey(member.userId) === memberMenuUserKey) ?? null),
    [memberMenuMatchesStream, memberMenuUserKey, members],
  );
  const isMemberMenuOpen = memberMenuOpen && selectedMember != null;
  const handleMemberMenuOpenChange = useCallback((open: boolean) => {
    setMemberMenuOpen(open);
    if (!open) {
      setMemberMenuAnchor(null);
      setMemberMenuUserKey(null);
      setMemberMenuStreamId(null);
    }
  }, []);

  const openMemberContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>, member: RightPanelStreamMemberViewModel) => {
      if (streamId == null || !canManageMember(member)) return;
      event.preventDefault();
      event.stopPropagation();
      setMemberActionError(null);
      setMemberMenuUserKey(userIdStorageKey(member.userId));
      setMemberMenuStreamId(streamId);
      setMemberMenuAnchor({ left: event.clientX, top: event.clientY });
      setMemberMenuOpen(true);
    },
    [canManageMember, streamId],
  );

  const openMemberKeyboardMenu = useCallback(
    (event: React.KeyboardEvent<HTMLElement>, member: RightPanelStreamMemberViewModel) => {
      if (streamId == null || !isContextMenuKeyboardEvent(event) || !canManageMember(member))
        return;
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      setMemberActionError(null);
      setMemberMenuUserKey(userIdStorageKey(member.userId));
      setMemberMenuStreamId(streamId);
      setMemberMenuAnchor({ left: rect.left + 16, top: rect.top + 16 });
      setMemberMenuOpen(true);
    },
    [canManageMember, streamId],
  );

  const memberMenuItems = useMemo<DropdownMenuItem[]>(() => {
    if (selectedMember == null) return [];
    const disabled = memberActionPendingKey != null;
    return [
      {
        type: "custom",
        key: "change-role-label",
        render: () => (
          <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-text-muted">
            {t("channel.changeMemberRole")}
          </div>
        ),
      },
      ...STREAM_MEMBER_EDITABLE_ROLES.map<DropdownMenuItem>((role) => ({
        type: "checkbox",
        key: `role-${role}`,
        label: streamRoleLabels[role],
        checked: selectedMember.role === role,
        disabled,
        onSelect: () => {
          void handleChangeMemberRole(selectedMember, role);
        },
      })),
      { type: "separator", key: "member-actions-separator" },
      {
        type: "action",
        key: "remove-member",
        icon: "close",
        danger: true,
        label: t("channel.removeMember"),
        disabled,
        onSelect: () => {
          void handleRemoveMember(selectedMember);
        },
      },
    ];
  }, [
    handleChangeMemberRole,
    handleRemoveMember,
    memberActionPendingKey,
    selectedMember,
    streamRoleLabels,
  ]);

  useEffect(() => {
    if (streamInfoData == null) return;
    syncExistingMembers(streamMemberIds);
  }, [streamInfoData, streamMemberIds, syncExistingMembers]);

  if (user) {
    return <RightPanelUser user={user} onOpenDirectMessage={handleOpenDirectMessage} />;
  }

  if (chatInfoData?.type === "dm") {
    // Workspace DMs are 1:1 only; the partner profile is shown via RightPanelUser above.
    return null;
  }

  const rawChannelDescription =
    streamInfoData != null ? streamInfoData.description?.trim() : undefined;
  const channelDescription =
    rawChannelDescription != null && rawChannelDescription.length > 0
      ? rawChannelDescription
      : null;
  const canonicalEditChannelName = streamInfoData?.name?.trim();
  const editChannelNameSeed =
    canonicalEditChannelName != null && canonicalEditChannelName.length > 0
      ? canonicalEditChannelName
      : stripSingleUiHashPrefix(title);
  const channelTopics = (streamInfoData?.topics ?? []).filter(
    (topic) => topic.name.trim().length > 0,
  );
  const handleOpenEdit = () => {
    setChannelActionError(null);
    setEditName(editChannelNameSeed);
    setEditDescription(channelDescription ?? "");
    setEditOpen(true);
  };
  const performSaveEdit = async (trimmedName: string, trimmedDescription: string) => {
    if (streamId == null || channelActionPending) return;

    setChannelActionPending(true);
    setChannelActionError(null);
    const ok = await updateStream(streamId, {
      name: trimmedName,
      description: trimmedDescription,
    });
    if (ok) {
      useChatListStore.getState().renameStream(streamId, trimmedName);
      const nextInfo = useChatInfoStore.getState().data;
      if (nextInfo?.type === "stream") {
        useChatInfoStore.getState().setData({
          ...nextInfo,
          name: trimmedName,
          description: trimmedDescription.length > 0 ? trimmedDescription : null,
        });
      }
      void navigate(withCurrentOrgRoute(`/stream/${buildStreamSlug(streamId)}`), {
        replace: true,
      });
      setEditOpen(false);
    } else {
      setChannelActionError(t("app.error"));
    }
    setChannelActionPending(false);
  };
  const handleSaveEdit = () => {
    if (streamId == null || channelActionPending || externalPreflight.pending) return;
    const trimmedName = editName.trim();
    if (trimmedName.length === 0) {
      setChannelActionError(t("app.error"));
      return;
    }

    const trimmedDescription = editDescription.trim();
    externalPreflight.run({
      provider: streamProvider,
      action: EXTERNAL_CAPABILITY.streamRename,
      target: { type: "stream", uuid: streamId },
      execute: () => {
        void performSaveEdit(trimmedName, trimmedDescription);
      },
    });
  };
  const handleDeleteChannel = async () => {
    if (streamId == null || channelActionPending) return;
    if (!window.confirm(t("channel.deleteChannel"))) return;

    setChannelActionPending(true);
    setChannelActionError(null);
    const chatList = useChatListStore.getState();
    const previousArchivedState = chatList.streamsMap.get(streamId)?.isArchived;
    chatList.setStreamArchived(streamId, true);
    useChatInfoStore.getState().clear();
    useCurrentChatMessagesStore.getState().setContext(null);
    useCurrentChatMessagesStore.getState().setMessages([]);

    const nextVisibleStream = chatList.streams().find((candidate) => {
      if (candidate.streamUuid === streamId) return false;
      const metadata = chatList.streamsMap.get(candidate.streamUuid);
      if (metadata?.isArchived === true) return false;
      if (!streamMetadataHydrated && metadata?.isArchived == null) return false;
      return true;
    });
    if (nextVisibleStream) {
      void navigate(
        withCurrentOrgRoute(`/stream/${buildStreamSlug(nextVisibleStream.streamUuid)}`),
        { replace: true },
      );
    } else {
      void navigate("/", { replace: true });
    }

    try {
      const ok = await archiveStream(streamId);
      if (!ok) {
        chatList.setStreamArchived(streamId, previousArchivedState);
        setChannelActionError(t("app.error"));
      }
    } catch {
      chatList.setStreamArchived(streamId, previousArchivedState);
      setChannelActionError(t("app.error"));
    } finally {
      setChannelActionPending(false);
    }
  };
  const handleUnarchiveChannel = async () => {
    if (streamId == null || channelActionPending) return;

    setChannelActionPending(true);
    setChannelActionError(null);
    const chatList = useChatListStore.getState();
    const previousArchivedState = chatList.streamsMap.get(streamId)?.isArchived;
    chatList.setStreamArchived(streamId, false);

    try {
      const result = await unarchiveStream(streamId);
      if (!result.ok) {
        chatList.setStreamArchived(streamId, previousArchivedState);
        setChannelActionError(t("channel.unarchiveFailed", { message: result.message }));
      }
    } catch (error) {
      chatList.setStreamArchived(streamId, previousArchivedState);
      setChannelActionError(t("channel.unarchiveFailed", { message: String(error) }));
    } finally {
      setChannelActionPending(false);
    }
  };
  const handleDeleteStream = async () => {
    if (streamId == null || channelActionPending || !canDeleteStream) return;
    const channelName = canonicalStreamName ?? title;
    if (!window.confirm(t("channel.deleteStreamConfirm", { channel: channelName }))) return;

    setChannelActionPending(true);
    setChannelActionError(null);
    const ok = await deleteStream(streamId);
    if (!ok) {
      setChannelActionError(t("channel.deleteStreamFailed"));
      setChannelActionPending(false);
      return;
    }

    const chatList = useChatListStore.getState();
    const nextVisibleStream = chatList.streams().find((candidate) => {
      if (candidate.streamUuid === streamId) return false;
      const metadata = chatList.streamsMap.get(candidate.streamUuid);
      if (metadata?.isArchived === true) return false;
      if (!streamMetadataHydrated && metadata?.isArchived == null) return false;
      return true;
    });

    chatList.removeStream(streamId);
    useChatInfoStore.getState().clear();
    useCurrentChatMessagesStore.getState().setContext(null);
    useCurrentChatMessagesStore.getState().setMessages([]);

    if (nextVisibleStream) {
      void navigate(
        withCurrentOrgRoute(`/stream/${buildStreamSlug(nextVisibleStream.streamUuid)}`),
        { replace: true },
      );
    } else {
      void navigate("/", { replace: true });
    }
    setChannelActionPending(false);
  };
  const handleDeleteTopic = async (topic: { name: string; topicUuid?: string }) => {
    if (streamId == null || topicDeletePendingName != null) return;
    if (topic.topicUuid == null) {
      setTopicDeleteError(t("app.error"));
      return;
    }
    const topicLabel = resolveTopicDisplayInfo(topic.name).label;
    if (!window.confirm(t("channel.deleteTopicConfirm", { topic: topicLabel }))) return;

    setTopicDeletePendingName(topic.name);
    setTopicDeleteError(null);
    const result = await deleteTopic(topic.topicUuid);
    if (result.ok && result.complete) {
      const chatList = useChatListStore.getState();
      chatList.removeStreamTopic(streamId, topic.name);
      const nextInfo = useChatInfoStore.getState().data;
      if (nextInfo?.type === "stream") {
        useChatInfoStore.getState().setData({
          ...nextInfo,
          topics: (nextInfo.topics ?? []).filter((candidate) =>
            topic.topicUuid != null
              ? candidate.topicUuid !== topic.topicUuid
              : normalizeTopicForIdentity(candidate.name) !== normalizeTopicForIdentity(topic.name),
          ),
        });
      }

      const isDeletingActiveTopic =
        context?.type === "stream" &&
        context.streamId === streamId &&
        context.streamWideView !== true &&
        (context.topicUuid === topic.topicUuid ||
          normalizeTopicForIdentity(context.topic) === normalizeTopicForIdentity(topic.name));
      if (isDeletingActiveTopic) {
        void navigate(withCurrentOrgRoute(`/stream/${buildStreamSlug(streamId)}`), {
          replace: true,
        });
      }
    } else {
      setTopicDeleteError(t("app.error"));
    }
    setTopicDeletePendingName(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden text-text-primary">
      <header className="flex-shrink-0 border-b border-border-subtle px-4 pb-3 pt-0">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">{t("info.channelInfo")}</h2>
        <div className="flex items-center gap-3">
          <Avatar size="lg" className="bg-bg-elevated text-text-secondary">
            {title.slice(0, 1)}
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text-primary">{title}</p>
            <p className="text-[11px] text-text-secondary">
              {t("channel.participants", { count: participantsCount })},{" "}
              {t("channel.online", { count: onlineCount })}
            </p>
          </div>
        </div>
      </header>

      <ScrollArea className="flex-1 space-y-4 px-4 py-3">
        {streamId != null && (
          <div>
            <p className="px-2 pb-2 text-[11px] font-medium uppercase tracking-wide text-text-muted">
              {t("channel.notifications")}
            </p>
            <StreamNotificationLevelSwitch
              value={notificationLevel}
              disabled={notificationPending}
              onChange={(level) => {
                void handleSetNotificationLevel(level);
              }}
              className="mx-2"
            />
            <p className="mx-2 mt-2 text-[11px] text-text-muted">
              {notificationLevel === "default" && t("channel.notificationDefault")}
              {notificationLevel === "muted" && t("channel.notificationMuted")}
              {notificationLevel === "subscribed" && t("channel.notificationSubscribed")}
            </p>
            {notificationError && (
              <div className="mt-1 flex items-center justify-between gap-2 px-2 text-xs text-notice-base">
                <span>{notificationError}</span>
                <button
                  type="button"
                  onClick={() => {
                    void handleSetNotificationLevel(notificationLevel);
                  }}
                  className="hover:bg-notice-base/20 rounded px-1.5 py-0.5 text-notice-base hover:text-notice-base"
                >
                  {t("common.retry")}
                </button>
              </div>
            )}
            {(canEditChannel || canArchiveChannel || canDeleteStream) && (
              <div className="mt-2 space-y-1.5">
                {canEditChannel && (
                  <button
                    type="button"
                    onClick={handleOpenEdit}
                    disabled={channelActionPending || externalPreflight.pending}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
                  >
                    <Icon name="pen" size={20} className="shrink-0 text-current" />
                    <span>{t("channel.editChannel")}</span>
                  </button>
                )}
                {canArchiveChannel && !isCurrentStreamArchived && (
                  <button
                    type="button"
                    onClick={handleDeleteChannel}
                    disabled={channelActionPending}
                    className="hover:bg-notice-base/10 flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm text-notice-base hover:text-notice-base"
                  >
                    <Icon name="close" size={20} className="shrink-0 text-current" />
                    <span>{t("channel.deleteChannel")}</span>
                  </button>
                )}
                {canArchiveChannel && isCurrentStreamArchived && (
                  <button
                    type="button"
                    onClick={() => {
                      void handleUnarchiveChannel();
                    }}
                    disabled={channelActionPending}
                    className="hover:bg-indicator-green/10 flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm text-indicator-green hover:text-indicator-green"
                  >
                    <Icon name="folder_open" size={20} className="shrink-0 text-current" />
                    <span>{t("channel.unarchiveChannel")}</span>
                  </button>
                )}
                {canDeleteStream && (
                  <button
                    type="button"
                    onClick={() => {
                      void handleDeleteStream();
                    }}
                    disabled={channelActionPending}
                    className="hover:bg-notice-base/10 flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm text-notice-base hover:text-notice-base"
                  >
                    <Icon name="delete" size={20} className="shrink-0 text-current" />
                    <span>{t("channel.deleteStream")}</span>
                  </button>
                )}
                {channelActionError && (
                  <p className="px-2 text-xs text-notice-base">{channelActionError}</p>
                )}
              </div>
            )}
            {editOpen && (
              <div className="mt-2 rounded-lg bg-bg-elevated px-2 py-2">
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-text-secondary">
                    {t("channel.channelName")}
                    <input
                      type="text"
                      aria-label={t("channel.channelName")}
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      className="mt-1 w-full rounded-md border border-border-subtle bg-bg px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                    />
                  </label>
                  <label className="block text-xs font-medium text-text-secondary">
                    {t("channel.description")}
                    <textarea
                      aria-label={t("channel.description")}
                      value={editDescription}
                      onChange={(event) => setEditDescription(event.target.value)}
                      rows={3}
                      className="mt-1 w-full resize-none rounded-md border border-border-subtle bg-bg px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
                    />
                  </label>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      className="rounded-md px-2 py-1 text-xs text-text-secondary hover:bg-bg hover:text-text-primary"
                      onClick={() => setEditOpen(false)}
                      disabled={channelActionPending || externalPreflight.pending}
                    >
                      {t("common.cancel")}
                    </button>
                    <button
                      type="button"
                      className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-on-accent hover:opacity-90 disabled:opacity-60"
                      onClick={handleSaveEdit}
                      disabled={channelActionPending || externalPreflight.pending}
                    >
                      {t("common.save")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {channelDescription && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              {t("chatInfo.description")}
            </h3>
            <p className="rounded-lg bg-bg-elevated px-2 py-2 text-sm text-text-primary">
              {channelDescription}
            </p>
          </div>
        )}

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {t("channel.topics")}
          </h3>
          {channelTopics.length === 0 ? (
            <p className="px-2 py-2 text-sm text-text-muted">{t("channel.noTopics")}</p>
          ) : (
            <ul className="space-y-1.5">
              {channelTopics.map((topic) => {
                const topicDisplay = resolveTopicDisplayInfo(topic.name);
                const topicLabel = formatTopicDoneLabel(topicDisplay.label, topic.isDone === true);
                return (
                  <li key={topic.topicUuid ?? topic.name}>
                    <div className="flex items-center gap-2 rounded-lg px-2 py-1 text-left text-sm text-text-primary transition-colors hover:bg-bg-elevated">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center justify-between gap-2 py-0.5 text-left"
                        onClick={() => handleOpenTopic(topic)}
                        disabled={topicDeletePendingName === topic.name}
                      >
                        <span className={`truncate ${topicDisplay.isSystem ? "italic" : ""}`}>
                          {topicLabel}
                        </span>
                        {topic.unreadCount > 0 && (
                          <span className="flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-medium text-on-accent">
                            {topic.unreadCount}
                          </span>
                        )}
                      </button>
                      {canDeleteTopic && (
                        <button
                          type="button"
                          className="hover:bg-notice-base/10 flex h-6 w-6 shrink-0 items-center justify-center rounded text-notice-base transition-colors disabled:opacity-40"
                          onClick={() => {
                            void handleDeleteTopic(topic);
                          }}
                          disabled={topicDeletePendingName != null}
                          aria-label={t("channel.deleteTopic")}
                          title={
                            topicDeletePendingName === topic.name
                              ? t("channel.deleteTopicInProgress")
                              : t("channel.deleteTopic")
                          }
                        >
                          <Icon name="close" size={14} className="text-current" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {topicDeleteError && (
            <p className="mt-1 px-2 text-xs text-notice-base">{topicDeleteError}</p>
          )}
        </div>

        <div>
          <h3 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-text-secondary">
            <span className="flex items-center gap-2">
              <Icon name="profile" size={16} className="shrink-0 text-current" />
              {t("channel.members")}
            </span>
            {canAddMembers && (
              <button
                type="button"
                aria-label={t("channel.addMembers")}
                onClick={handleOpenAddMembers}
                className="flex h-6 w-6 items-center justify-center rounded text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
              >
                <Icon name="person_add" size={16} className="text-current" />
              </button>
            )}
          </h3>
          {members.length === 0 ? (
            <p className="px-2 py-3 text-center text-sm text-text-muted">
              {t("channel.noMembers")}
            </p>
          ) : (
            <ul className="space-y-2">
              {members.map((p) => (
                <li key={userIdStorageKey(p.userId)} className="group/member">
                  <div className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors focus-within:bg-bg-elevated hover:bg-bg-elevated">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      onClick={() => handleOpenUserProfile(p.userId)}
                      onContextMenu={(event) => openMemberContextMenu(event, p)}
                      onKeyDown={(event) => openMemberKeyboardMenu(event, p)}
                      aria-label={t("a11y.openUserProfile", { name: p.name })}
                    >
                      <div className="relative shrink-0">
                        <Avatar
                          size="sm"
                          className="bg-bg-elevated text-text-primary"
                          src={resolveAvatarSrc(p.avatarUrl) ?? undefined}
                        >
                          {p.name.slice(0, 1)}
                        </Avatar>
                        <span className="absolute -bottom-0.5 -right-0.5">
                          <PresenceIndicator status={p.isOnline ? "active" : "offline"} size="sm" />
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm text-text-primary">
                          {p.name}
                          {p.isCreator && (
                            <span className="text-[10px] font-normal text-text-secondary">
                              {t("channel.memberBadgeCreator")}
                            </span>
                          )}
                          {!p.isCreator && p.isChannelAdmin && (
                            <span className="text-[10px] font-normal text-text-secondary">
                              {t("channel.memberBadgeChannelAdmin")}
                            </span>
                          )}
                        </p>
                        <p className="truncate text-[11px] text-text-secondary">
                          {p.roleLabel} - {p.status}
                        </p>
                      </div>
                    </button>
                    {memberMenuMatchesStream &&
                      memberActionPendingKey === userIdStorageKey(p.userId) && (
                        <span className="shrink-0 text-xs text-text-muted">...</span>
                      )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <DropdownMenu
            open={isMemberMenuOpen}
            onOpenChange={handleMemberMenuOpenChange}
            contextAnchor={memberMenuAnchor}
            source="context"
            items={memberMenuItems}
            contentVariant="narrow"
            contentProps={{ sideOffset: 4 }}
          />
          {memberMenuMatchesStream && memberActionError && (
            <p className="mt-2 px-2 text-xs text-notice-base">{memberActionError}</p>
          )}
        </div>
      </ScrollArea>
      <AddStreamMembersDialog onSuccess={handleStreamMembersChangedSuccess} />
      <ExternalOperationPreflightDialog
        error={externalPreflight.error}
        losses={externalPreflight.losses}
        onConfirm={externalPreflight.confirm}
        onDismiss={externalPreflight.dismiss}
      />
    </div>
  );
};
