import * as Dialog from "@radix-ui/react-dialog";
import React, { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  mapNotificationLevelToWorkspaceStreamMode,
  mapWorkspaceStreamNotificationModeToLevel,
  type WorkspaceStreamNotificationLevel,
} from "~/entities/messenger/messenger-notification-mode.lib";
import { runWorkspaceStreamNotificationUpdate } from "~/entities/messenger/messenger-sidebar-actions.lib";
import {
  addWorkspaceStreamMembers,
  removeWorkspaceStreamMember,
} from "~/entities/messenger/messenger-stream-member-actions.lib";
import {
  resolveMessengerTopicSummaryPermissions,
  type MessengerTopicSummaryPermissionResolution,
} from "~/entities/messenger/messenger-topic-summary-permissions.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerTopic, MessengerUuid } from "~/entities/messenger/messenger.types";
import {
  isSelectableWorkspaceUser,
  resolveUserPresenceVisual,
  selectUserDisplayName,
} from "~/entities/user/user-selectors.lib";
import { useUsersStore } from "~/entities/user/user.model";
import type { User, UsersById } from "~/entities/user/user.types";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import {
  selectWorkspaceIamPermissionsForOwner,
  useWorkspaceIamCapabilitiesStore,
} from "~/entities/workspace-auth/workspace-iam-capabilities.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { useChatDmCallBridgeStore } from "~/features/chat-dm-call-bridge/chat-dm-call-bridge.model";
import { EncryptedChatInfoConnected } from "~/features/encrypted-chat-info/encrypted-chat-info-connected.ui";
import type { EncryptedChatInfoScreen } from "~/features/encrypted-chat-info/encrypted-chat-info.types";
import { StreamNotificationLevelSwitch } from "~/features/mute-chat/stream-notification-level-switch.ui";
import { TopicSummarySettingsDialog } from "~/features/topic-summary-settings/topic-summary-settings-dialog.ui";
import { WorkspaceAvatar } from "~/features/workspace-avatar/workspace-avatar.ui";
import { t } from "~/i18n/i18n";
import { resolveAvatarBackgroundColor } from "~/shared/lib/avatar-color.lib";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import {
  buildUserPickerOptions,
  toggleUserPickerSelection,
  type UserPickerOption,
} from "~/shared/lib/user-picker";
import {
  AppDialogShell,
  APP_DIALOG_CONTENT_BASE_CLASS,
  DialogCancelButton,
  DialogPrimaryButton,
} from "~/shared/ui/app-dialog";
import { Avatar } from "~/shared/ui/avatar";
import { Icon } from "~/shared/ui/icon";
import { ScrollArea } from "~/shared/ui/scroll-area";
import { UserPickerList } from "~/shared/ui/user-picker-list";
import { WorkspaceMemberCard } from "~/shared/ui/workspace-member-card";
import { RightPanelTopicList } from "./right-panel-topic-list.ui";
import { RightPanelTopicSummary } from "./right-panel-topic-summary.ui";
import { RightPanelUserProfile } from "./right-panel-user-profile.ui";
import type { WorkspaceRightPanelInfoView } from "./right-panel.types";

export interface RightPanelWorkspaceInfoProps {
  chatScreen?: EncryptedChatInfoScreen;
  selectedLocalKeyUuid?: string;
  onChatScreenChange?: (screen: EncryptedChatInfoScreen, keyUuid?: string) => void;
  info: WorkspaceRightPanelInfoView;
  onClose?: () => void;
}

type WorkspaceRightPanelChannelInfoView = Extract<WorkspaceRightPanelInfoView, { kind: "channel" }>;
type WorkspaceRightPanelDirectPrivateInfoView = Extract<
  WorkspaceRightPanelInfoView,
  { kind: "directPrivate" | "userProfile" }
>;

interface NotificationActionState {
  streamUuid: string | null;
  pending: boolean;
  error: string | null;
}

interface WorkspaceMemberActionState {
  streamUuid: string | null;
  addDialogOpen: boolean;
  query: string;
  selectedUserUuids: MessengerUuid[];
  adding: boolean;
  addError: string | null;
  removingUserUuids: MessengerUuid[];
  removeError: string | null;
}

const ADD_STREAM_MEMBERS_INPUT_CLASS =
  "w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted transition-colors focus:border-accent focus-visible:outline-none focus-visible:ring-0";

const ADD_MEMBERS_CONTENT_CLASS = `${APP_DIALOG_CONTENT_BASE_CLASS} top-1/2 flex max-h-[70vh] max-w-md -translate-y-1/2 flex-col p-0`;

const removeMemberActionClassName =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-muted opacity-100 transition-colors hover:bg-bg hover:text-notice-base disabled:opacity-40 sm:opacity-0 sm:group-hover/member:opacity-100";

const EMPTY_WORKSPACE_USER_OPTIONS: UserPickerOption<MessengerUuid>[] = [];

function createNotificationActionState(streamUuid: string | null): NotificationActionState {
  return {
    streamUuid,
    pending: false,
    error: null,
  };
}

function createWorkspaceMemberActionState(streamUuid: string | null): WorkspaceMemberActionState {
  return {
    streamUuid,
    addDialogOpen: false,
    query: "",
    selectedUserUuids: [],
    adding: false,
    addError: null,
    removingUserUuids: [],
    removeError: null,
  };
}

function resolveWorkspaceStatusLabel(status: User["status"] | null): string | null {
  if (status == null) return null;
  if (status === "active") return t("presence.online");
  if (status === "idle") return t("presence.away");
  if (status === "offline") return t("presence.offline");
  return t("presence.doNotDisturb");
}

function resolveWorkspaceRoleLabel(
  role: WorkspaceRightPanelChannelInfoView["members"][number]["role"],
) {
  if (role === "administrator") return t("roles.admin");
  return t(`roles.${role}`);
}

function buildWorkspaceUserOptions(
  usersById: UsersById,
  existingMemberUuids: ReadonlySet<MessengerUuid>,
  selectedUserUuids: readonly MessengerUuid[],
): UserPickerOption<MessengerUuid>[] {
  return buildUserPickerOptions({
    candidates: Object.values(usersById)
      .filter(isSelectableWorkspaceUser)
      .map((user) => ({
        userId: user.uuid,
        fullName: selectUserDisplayName(user, user.uuid),
        username: user.username,
        email: user.email ?? "",
        presence: resolveUserPresenceVisual(user.status) ?? "offline",
        statusLabel: resolveWorkspaceStatusLabel(user.status),
      })),
    selectedUserIds: selectedUserUuids,
    excludedUserIds: Array.from(existingMemberUuids),
  });
}

interface WorkspaceAddStreamMembersDialogProps {
  open: boolean;
  streamName: string;
  query: string;
  options: readonly UserPickerOption<MessengerUuid>[];
  selectedUserUuids: ReadonlySet<MessengerUuid>;
  submitting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onQueryChange: (query: string) => void;
  onToggle: (userUuid: MessengerUuid) => void;
  onSubmit: () => void;
}

const WorkspaceAddStreamMembersDialog: React.FC<WorkspaceAddStreamMembersDialogProps> = ({
  open,
  streamName,
  query,
  options,
  selectedUserUuids,
  submitting,
  error,
  onOpenChange,
  onQueryChange,
  onToggle,
  onSubmit,
}) => {
  return (
    <AppDialogShell
      open={open}
      onOpenChange={onOpenChange}
      contentClassName={ADD_MEMBERS_CONTENT_CLASS}
    >
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <div className="min-w-0">
          <Dialog.Title className="truncate text-sm font-semibold text-text-primary">
            {t("channel.addMembers")}
          </Dialog.Title>
          <Dialog.Description className="truncate text-xs text-text-secondary">
            {streamName}
          </Dialog.Description>
        </div>
        <Dialog.Close asChild>
          <button
            type="button"
            className="hover:bg-bg/50 rounded p-1 text-text-muted"
            aria-label={t("common.close")}
          >
            <Icon name="close" size={18} />
          </button>
        </Dialog.Close>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden p-4">
        <UserPickerList
          options={options}
          selectedUserIds={selectedUserUuids}
          query={query}
          onQueryChange={onQueryChange}
          onToggle={onToggle}
          inputClassName={ADD_STREAM_MEMBERS_INPUT_CLASS}
        />

        {error && <p className="text-xs text-notice-base">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <DialogCancelButton disabled={submitting} className="rounded-lg px-3 py-1.5">
            {t("common.cancel")}
          </DialogCancelButton>
          <DialogPrimaryButton
            onClick={onSubmit}
            disabled={submitting || selectedUserUuids.size === 0}
            className="rounded-lg px-3 py-1.5"
          >
            {t("common.add")}
          </DialogPrimaryButton>
        </div>
      </div>
    </AppDialogShell>
  );
};

interface WorkspaceTopicSummarySettingsControlProps {
  readonly summary: NonNullable<WorkspaceRightPanelChannelInfoView["topicSummary"]>;
  readonly runtimeContext: WorkspaceRuntimeContext | null;
  readonly topic: MessengerTopic | null;
  readonly channelName?: string | null;
  readonly permissions: MessengerTopicSummaryPermissionResolution;
}

const WorkspaceTopicSummarySettingsControl = React.memo(
  function WorkspaceTopicSummarySettingsControl({
    summary,
    runtimeContext,
    topic,
    channelName,
    permissions,
  }: WorkspaceTopicSummarySettingsControlProps) {
    const [open, setOpen] = useState(false);
    const canOpen = runtimeContext != null && topic != null && permissions.isGearVisible;
    const handleOpen = useCallback(() => setOpen(true), []);

    return (
      <>
        <div className="px-2">
          <RightPanelTopicSummary
            summary={summary}
            onOpenSettings={canOpen ? handleOpen : undefined}
          />
        </div>
        {topic != null ? (
          <TopicSummarySettingsDialog
            open={open && canOpen}
            onOpenChange={setOpen}
            runtimeContext={runtimeContext}
            topic={topic}
            channelName={channelName}
            topicPermission={permissions.topic}
            gatesPermission={permissions.gates}
            endpointsPermission={permissions.endpoints}
          />
        ) : null}
      </>
    );
  },
);

const RightPanelWorkspaceDirectPrivateInfo: React.FC<{
  info: WorkspaceRightPanelDirectPrivateInfoView;
}> = ({ info }) => {
  return <RightPanelUserProfile info={info} />;
};

interface WorkspaceChannelMemberActions {
  onAddMember?: () => void;
  onRemoveMember?: (memberId: string) => void;
  removableMemberIds: readonly string[];
  removingMemberIds: readonly string[];
  removeMemberError: string | null;
}

function isCurrentWorkspaceStreamOwner(
  streamUuid: string | null,
  runtimeContext: WorkspaceRuntimeContext | null,
): boolean {
  if (streamUuid == null || runtimeContext == null) return false;
  const currentRuntime = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
  const state = useMessengerStore.getState();
  const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
  return (
    currentRuntime != null &&
    workspaceRuntimeOwnerKey(currentRuntime) === ownerKey &&
    currentRuntime.runtimeGeneration === runtimeContext.runtimeGeneration &&
    state.ownerKey === ownerKey &&
    state.streamsById[streamUuid]?.ownerUuid === runtimeContext.userUuid
  );
}

const RightPanelWorkspaceChannelInfo: React.FC<{
  info: WorkspaceRightPanelChannelInfoView;
  renderContent?: (actions: WorkspaceChannelMemberActions) => React.ReactNode;
}> = ({ info, renderContent }) => {
  const navigate = useNavigate();
  const [notificationActionState, setNotificationActionState] = useState<NotificationActionState>(
    () => createNotificationActionState(info.streamUuid),
  );
  const [memberActionState, setMemberActionState] = useState<WorkspaceMemberActionState>(() =>
    createWorkspaceMemberActionState(info.streamUuid),
  );
  const notificationPending =
    notificationActionState.streamUuid === info.streamUuid && notificationActionState.pending;
  const notificationError =
    notificationActionState.streamUuid === info.streamUuid ? notificationActionState.error : null;
  const memberActionCurrent =
    memberActionState.streamUuid === info.streamUuid
      ? memberActionState
      : createWorkspaceMemberActionState(info.streamUuid);
  const storeNotificationMode = useMessengerStore((state) =>
    info.streamUuid == null ? null : (state.streamsById[info.streamUuid]?.notificationMode ?? null),
  );
  const summaryStream = useMessengerStore((state) =>
    info.streamUuid == null ? null : (state.streamsById[info.streamUuid] ?? null),
  );
  const summaryTopic = useMessengerStore((state) =>
    info.topicSummary == null ? null : (state.topicsById[info.topicSummary.topicUuid] ?? null),
  );
  const workspaceUsersById = useUsersStore((state) => state.usersById);
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const runtimeContext = useMemo(
    () => selectCurrentWorkspaceRuntimeContext({ sessions, currentAccountId }),
    [currentAccountId, sessions],
  );
  const summaryOwnerKey = runtimeContext == null ? null : workspaceRuntimeOwnerKey(runtimeContext);
  const canAddMembers = useMessengerStore(
    (state) =>
      runtimeContext != null &&
      info.streamUuid != null &&
      state.ownerKey === summaryOwnerKey &&
      state.streamsById[info.streamUuid]?.ownerUuid === runtimeContext.userUuid,
  );
  const summaryCapabilities = useWorkspaceIamCapabilitiesStore((state) =>
    selectWorkspaceIamPermissionsForOwner(state, summaryOwnerKey),
  );
  const summaryPermissions = useMemo(
    () =>
      resolveMessengerTopicSummaryPermissions({
        currentUserUuid: runtimeContext?.userUuid,
        stream: summaryStream,
        capabilities: summaryCapabilities,
      }),
    [runtimeContext?.userUuid, summaryCapabilities, summaryStream],
  );
  const summaryRuntimeKey =
    runtimeContext == null ? null : `${summaryOwnerKey}:${runtimeContext.runtimeGeneration}`;
  const notificationMode = storeNotificationMode ?? info.notificationMode;
  const notificationLevel = useMemo<WorkspaceStreamNotificationLevel | null>(
    () =>
      notificationMode == null ? null : mapWorkspaceStreamNotificationModeToLevel(notificationMode),
    [notificationMode],
  );
  const existingMemberUuids = useMemo(
    () => new Set(info.members.map((member) => member.userUuid)),
    [info.members],
  );
  const selectedUserUuidSet = useMemo(
    () => new Set(memberActionCurrent.selectedUserUuids),
    [memberActionCurrent.selectedUserUuids],
  );
  const addMemberOptions = useMemo(
    () =>
      // Build candidates only for the open dialog: the user list can be large,
      // and the panel does not need this data outside the add flow.
      canAddMembers && memberActionCurrent.addDialogOpen
        ? buildWorkspaceUserOptions(
            workspaceUsersById,
            existingMemberUuids,
            memberActionCurrent.selectedUserUuids,
          )
        : EMPTY_WORKSPACE_USER_OPTIONS,
    [
      canAddMembers,
      existingMemberUuids,
      memberActionCurrent.addDialogOpen,
      memberActionCurrent.selectedUserUuids,
      workspaceUsersById,
    ],
  );
  const handleOpenTopic = useCallback(
    (route: string) => {
      void navigate(route);
    },
    [navigate],
  );
  const handleSetNotificationLevel = useCallback(
    async (level: WorkspaceStreamNotificationLevel): Promise<void> => {
      if (info.streamUuid == null || notificationPending) return;

      const streamUuid = info.streamUuid;
      const nextNotificationMode = mapNotificationLevelToWorkspaceStreamMode(level);
      if (notificationMode === nextNotificationMode) return;

      setNotificationActionState({
        streamUuid,
        pending: true,
        error: null,
      });
      try {
        await runWorkspaceStreamNotificationUpdate({
          streamUuid,
          notificationMode: nextNotificationMode,
        });
      } catch (error) {
        reportUnexpectedError("workspace-right-panel", error, {
          action: "stream-notifications",
        });
        setNotificationActionState((prev) =>
          prev.streamUuid === streamUuid
            ? {
                streamUuid,
                pending: false,
                error: t("app.error"),
              }
            : prev,
        );
      } finally {
        setNotificationActionState((prev) =>
          prev.streamUuid === streamUuid
            ? {
                streamUuid,
                pending: false,
                error: prev.error,
              }
            : prev,
        );
      }
    },
    [info.streamUuid, notificationMode, notificationPending],
  );

  const handleOpenAddMembers = useCallback(() => {
    if (!isCurrentWorkspaceStreamOwner(info.streamUuid, runtimeContext)) return;
    setMemberActionState({
      ...createWorkspaceMemberActionState(info.streamUuid),
      streamUuid: info.streamUuid,
      addDialogOpen: true,
    });
  }, [info.streamUuid, runtimeContext]);

  const handleAddDialogOpenChange = useCallback((open: boolean) => {
    setMemberActionState((prev) => ({
      ...prev,
      addDialogOpen: open,
      query: open ? prev.query : "",
      selectedUserUuids: open ? prev.selectedUserUuids : [],
      addError: open ? prev.addError : null,
    }));
  }, []);

  const handleSetAddMemberQuery = useCallback((query: string) => {
    setMemberActionState((prev) => ({ ...prev, query }));
  }, []);

  const handleToggleSelectedMember = useCallback((userUuid: MessengerUuid) => {
    setMemberActionState((prev) => ({
      ...prev,
      selectedUserUuids: toggleUserPickerSelection(prev.selectedUserUuids, userUuid),
    }));
  }, []);

  const handleSubmitAddMembers = useCallback(async () => {
    if (
      info.streamUuid == null ||
      runtimeContext == null ||
      !isCurrentWorkspaceStreamOwner(info.streamUuid, runtimeContext) ||
      memberActionCurrent.adding ||
      memberActionCurrent.selectedUserUuids.length === 0
    ) {
      return;
    }

    const streamUuid = info.streamUuid;
    const userUuids = memberActionCurrent.selectedUserUuids.filter(
      (userUuid) => !existingMemberUuids.has(userUuid),
    );
    // The dialog can keep selected users slightly longer than the members list
    // refresh takes. Filter existing members again before submit, so parallel
    // binding updates do not send duplicates to the backend.
    if (userUuids.length === 0) {
      setMemberActionState((prev) => ({
        ...prev,
        addDialogOpen: false,
        selectedUserUuids: [],
        addError: null,
      }));
      return;
    }

    setMemberActionState((prev) => ({ ...prev, adding: true, addError: null }));
    try {
      await addWorkspaceStreamMembers({
        runtimeContext,
        getRuntimeContext: useWorkspaceAuthStore.getState().getCurrentRuntimeContext,
        streamUuid,
        userUuids,
      });
      setMemberActionState((prev) =>
        prev.streamUuid === streamUuid
          ? {
              ...prev,
              addDialogOpen: false,
              query: "",
              selectedUserUuids: [],
              adding: false,
              addError: null,
            }
          : prev,
      );
    } catch (error) {
      reportUnexpectedError("workspace-right-panel", error, {
        action: "add-stream-members",
      });
      setMemberActionState((prev) =>
        prev.streamUuid === streamUuid
          ? {
              ...prev,
              adding: false,
              addError: t("app.error"),
            }
          : prev,
      );
    }
  }, [
    existingMemberUuids,
    info.streamUuid,
    memberActionCurrent.adding,
    memberActionCurrent.selectedUserUuids,
    runtimeContext,
  ]);

  const handleRemoveMember = useCallback(
    async (member: WorkspaceRightPanelChannelInfoView["members"][number]) => {
      // UI trusts the selector-provided `canRemove`: any member can remove
      // themselves, and only the stream owner sees the button for other members.
      if (
        info.streamUuid == null ||
        runtimeContext == null ||
        !member.canRemove ||
        memberActionCurrent.removingUserUuids.includes(member.userUuid)
      ) {
        return;
      }

      const streamUuid = info.streamUuid;
      setMemberActionState((prev) => ({
        ...prev,
        removeError: null,
        removingUserUuids: [...prev.removingUserUuids, member.userUuid],
      }));
      try {
        await removeWorkspaceStreamMember({
          runtimeContext,
          getRuntimeContext: useWorkspaceAuthStore.getState().getCurrentRuntimeContext,
          streamUuid,
          bindingUuid: member.bindingUuid,
          userUuid: member.userUuid,
        });
        setMemberActionState((prev) =>
          prev.streamUuid === streamUuid
            ? {
                ...prev,
                removingUserUuids: prev.removingUserUuids.filter(
                  (userUuid) => userUuid !== member.userUuid,
                ),
                removeError: null,
              }
            : prev,
        );
      } catch (error) {
        reportUnexpectedError("workspace-right-panel", error, {
          action: "remove-stream-member",
        });
        setMemberActionState((prev) =>
          prev.streamUuid === streamUuid
            ? {
                ...prev,
                removingUserUuids: prev.removingUserUuids.filter(
                  (userUuid) => userUuid !== member.userUuid,
                ),
                removeError: t("app.error"),
              }
            : prev,
        );
      }
    },
    [info.streamUuid, memberActionCurrent.removingUserUuids, runtimeContext],
  );

  const addMembersDialog = (
    <WorkspaceAddStreamMembersDialog
      open={canAddMembers && memberActionCurrent.addDialogOpen}
      streamName={info.title}
      query={memberActionCurrent.query}
      options={addMemberOptions}
      selectedUserUuids={selectedUserUuidSet}
      submitting={memberActionCurrent.adding}
      error={memberActionCurrent.addError}
      onOpenChange={handleAddDialogOpenChange}
      onQueryChange={handleSetAddMemberQuery}
      onToggle={handleToggleSelectedMember}
      onSubmit={() => {
        void handleSubmitAddMembers();
      }}
    />
  );

  if (renderContent != null)
    return (
      <>
        {renderContent({
          onAddMember: canAddMembers ? handleOpenAddMembers : undefined,
          onRemoveMember:
            runtimeContext == null
              ? undefined
              : (memberId) => {
                  const member = info.members.find((item) => item.bindingUuid === memberId);
                  if (member != null) void handleRemoveMember(member);
                },
          removableMemberIds:
            runtimeContext == null
              ? []
              : info.members
                  .filter((member) => member.canRemove)
                  .map((member) => member.bindingUuid),
          removingMemberIds: info.members
            .filter((member) => memberActionCurrent.removingUserUuids.includes(member.userUuid))
            .map((member) => member.bindingUuid),
          removeMemberError: memberActionCurrent.removeError,
        })}
        {addMembersDialog}
      </>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden text-text-primary">
      {/* Drawer already has px-2 (8px); header adds another 8px to match Figma title/avatar inset. */}
      <header className="flex-shrink-0 border-b border-border-subtle px-2 pb-3 pt-1">
        <div className="flex items-center gap-4">
          <Avatar size="lg" style={{ backgroundColor: resolveAvatarBackgroundColor(info.color) }}>
            {info.title.slice(0, 1)}
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text-primary">{info.title}</p>
            <p className="text-[11px] text-text-secondary">
              {t("channel.participants", { count: info.participantsCount })},{" "}
              {t("channel.online", { count: info.onlineCount })}
            </p>
          </div>
        </div>
      </header>

      {/* No extra horizontal pad — aside px-2 is the Figma 8px inset; sections gap 20. */}
      <ScrollArea className="flex-1 space-y-5 py-2">
        <div>
          <h3 className="mb-3 px-2 text-sm font-medium normal-case text-text-primary">
            {t("channel.notifications")}
            <span className="font-medium normal-case text-text-muted">
              {" "}
              ({t("channel.notificationsForEntireChat")})
            </span>
          </h3>
          {info.streamUuid != null && notificationLevel != null ? (
            <>
              <StreamNotificationLevelSwitch
                value={notificationLevel}
                disabled={notificationPending}
                size="lg"
                onChange={(level) => {
                  void handleSetNotificationLevel(level);
                }}
              />
              {notificationError && (
                <p className="mt-1 px-2 text-xs text-notice-base">{notificationError}</p>
              )}
            </>
          ) : (
            <p className="rounded-lg bg-bg-elevated px-2 py-2 text-sm text-text-muted">
              {t("workspaceMessenger.actionUnsupported")}
            </p>
          )}
        </div>

        {info.topicSummary != null ? (
          <WorkspaceTopicSummarySettingsControl
            key={`${summaryRuntimeKey ?? "no-runtime"}:${info.streamUuid ?? "no-stream"}:${info.topicSummary.topicUuid}:${summaryPermissions.isGearVisible ? "visible" : "hidden"}`}
            summary={info.topicSummary}
            runtimeContext={runtimeContext}
            topic={summaryTopic}
            channelName={summaryStream?.name}
            permissions={summaryPermissions}
          />
        ) : null}

        {info.description && (
          <div>
            <h3 className="mb-3 px-2 text-sm font-medium normal-case text-text-primary">
              {t("chatInfo.description")}
            </h3>
            <p className="rounded-lg bg-bg-elevated px-3 py-2 text-sm text-text-primary">
              {info.description}
            </p>
          </div>
        )}

        <RightPanelTopicList
          topics={info.topics}
          streamTitle={info.title}
          streamNotificationMode={notificationMode}
          onOpenTopic={handleOpenTopic}
        />

        <div>
          {/* Members block: title + person_add only (no leading profile icon). Hit area 32×32. */}
          <h3 className="mb-3 flex h-8 items-center justify-between px-2 text-sm font-medium normal-case text-text-primary">
            {t("channel.members")}
            {canAddMembers && (
              <button
                type="button"
                aria-label={t("channel.addMembers")}
                onClick={handleOpenAddMembers}
                className="flex h-8 w-8 items-center justify-center rounded text-text-secondary transition-colors hover:bg-card-bg-active hover:text-text-primary"
              >
                <Icon name="person_add" size={24} className="text-current" />
              </button>
            )}
          </h3>
          {info.members.length === 0 ? (
            <p className="px-2 py-3 text-center text-sm text-text-muted">
              {t("channel.noMembers")}
            </p>
          ) : (
            <ul className="space-y-1">
              {info.members.map((member) => (
                <li key={member.bindingUuid} className="group/member">
                  {/* The member row is intentionally not a button: Workspace profile
                      flow is not wired here yet, so this surface creates no false action. */}
                  <WorkspaceMemberCard
                    name={member.name}
                    roleLabel={resolveWorkspaceRoleLabel(member.role)}
                    secondaryText={resolveWorkspaceStatusLabel(member.status) ?? member.email}
                    avatar={
                      <WorkspaceAvatar
                        size="sm"
                        avatarUrn={member.avatarUrl}
                        className="bg-bg-elevated text-text-primary"
                        presence={resolveUserPresenceVisual(member.status)}
                      >
                        {member.name.slice(0, 1)}
                      </WorkspaceAvatar>
                    }
                    action={
                      member.canRemove && runtimeContext != null ? (
                        <button
                          type="button"
                          aria-label={t("a11y.removeMemberFromChannel", { name: member.name })}
                          disabled={memberActionCurrent.removingUserUuids.includes(member.userUuid)}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void handleRemoveMember(member);
                          }}
                          className={removeMemberActionClassName}
                        >
                          <Icon name="close" size={14} className="text-current" />
                        </button>
                      ) : null
                    }
                  />
                </li>
              ))}
            </ul>
          )}
          {memberActionCurrent.removeError && (
            <p className="mt-2 px-2 text-xs text-notice-base">{memberActionCurrent.removeError}</p>
          )}
        </div>
      </ScrollArea>
      {addMembersDialog}
    </div>
  );
};

export const RightPanelWorkspaceInfo: React.FC<RightPanelWorkspaceInfoProps> = ({
  info,
  onClose,
  chatScreen,
  selectedLocalKeyUuid,
  onChatScreenChange,
}) => {
  const streamUuid =
    info.kind === "channel" || info.kind === "directPrivate" ? info.streamUuid : null;
  const encrypted = useMessengerStore(
    (state) => streamUuid != null && state.streamsById[streamUuid]?.encryption === true,
  );
  const ownerKey = useWorkspaceAuthStore((state) => {
    const runtime = selectCurrentWorkspaceRuntimeContext(state);
    return runtime == null ? null : workspaceRuntimeOwnerKey(runtime);
  });
  const runtimeGeneration = useWorkspaceAuthStore(
    (state) => selectCurrentWorkspaceRuntimeContext(state)?.runtimeGeneration,
  );
  const onCall = useChatDmCallBridgeStore((state) => {
    const call = state.activeChatCall;
    if (call == null) return undefined;
    return call.ownerKey === ownerKey &&
      call.runtimeGeneration === runtimeGeneration &&
      call.streamUuid === streamUuid
      ? call.invoke
      : undefined;
  });
  if (encrypted && streamUuid != null) {
    const renderEncryptedInfo = (actions?: WorkspaceChannelMemberActions) => (
      <EncryptedChatInfoConnected
        streamUuid={streamUuid}
        screen={chatScreen}
        selectedLocalKeyUuid={selectedLocalKeyUuid}
        onOpenLocalKey={
          onChatScreenChange == null
            ? undefined
            : (keyUuid) => onChatScreenChange("local-key", keyUuid)
        }
        onScreenChange={onChatScreenChange}
        onClose={onClose}
        onCall={onCall}
        onAddMember={actions?.onAddMember}
        onRemoveMember={actions?.onRemoveMember}
        removableMemberIds={actions?.removableMemberIds}
        removingMemberIds={actions?.removingMemberIds}
        removeMemberError={actions?.removeMemberError}
        renderAvatar={(person) => (
          <WorkspaceAvatar
            size="sm"
            avatarUrn={person.avatarUrl}
            className="bg-bg-elevated text-text-primary"
            presence={person.presence}
          >
            {person.name.slice(0, 1)}
          </WorkspaceAvatar>
        )}
      />
    );
    return info.kind === "channel" ? (
      <RightPanelWorkspaceChannelInfo info={info} renderContent={renderEncryptedInfo} />
    ) : (
      renderEncryptedInfo()
    );
  }
  if (info.kind === "directPrivate" || info.kind === "userProfile") {
    return <RightPanelWorkspaceDirectPrivateInfo info={info} />;
  }

  return <RightPanelWorkspaceChannelInfo info={info} />;
};
