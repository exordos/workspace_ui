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
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerUuid } from "~/entities/messenger/messenger.types";
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
import { StreamNotificationLevelSwitch } from "~/features/mute-chat/stream-notification-level-switch.ui";
import { WorkspaceAvatar } from "~/features/workspace-avatar/workspace-avatar.ui";
import { t } from "~/i18n/i18n";
import { resolveTopicDisplayInfo } from "~/shared/lib/topic-display.lib";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";
import {
  AppDialogShell,
  APP_DIALOG_CONTENT_BASE_CLASS,
  DialogCancelButton,
  DialogPrimaryButton,
} from "~/shared/ui/app-dialog.ui";
import { Avatar } from "~/shared/ui/avatar";
import { Copyable } from "~/shared/ui/copyable";
import { Icon, type IconName } from "~/shared/ui/icon";
import { PresenceIndicator, type PresenceVisual } from "~/shared/ui/presence-indicator";
import { ScrollArea } from "~/shared/ui/scroll-area";
import { SectionLabel } from "~/shared/ui/section-label.ui";
import type { WorkspaceRightPanelInfoView } from "./right-panel.types";

export interface RightPanelWorkspaceInfoProps {
  info: WorkspaceRightPanelInfoView;
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

interface WorkspaceUserPickerOption {
  userUuid: MessengerUuid;
  fullName: string;
  email: string;
  presence: PresenceVisual;
  statusLabel: string | null;
}

const ADD_STREAM_MEMBERS_INPUT_CLASS =
  "w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted transition-colors focus:border-accent focus-visible:outline-none focus-visible:ring-0";

const ADD_MEMBERS_CONTENT_CLASS = `${APP_DIALOG_CONTENT_BASE_CLASS} top-1/2 flex max-h-[70vh] max-w-md -translate-y-1/2 flex-col p-0`;

const removeMemberActionClassName =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-muted opacity-100 transition-colors hover:bg-bg hover:text-notice-base disabled:opacity-40 sm:opacity-0 sm:group-hover/member:opacity-100";

const EMPTY_WORKSPACE_USER_OPTIONS: WorkspaceUserPickerOption[] = [];

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

function resolveWorkspaceUserDisplayName(user: User): string {
  return selectUserDisplayName(user, user.uuid);
}

function resolveWorkspacePresence(status: User["status"] | null): PresenceVisual {
  return resolveUserPresenceVisual(status) ?? "offline";
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

function normalizeWorkspaceMemberQuery(query: string): string {
  return query.trim().toLowerCase();
}

function filterWorkspaceUserOptions(
  usersById: UsersById,
  existingMemberUuids: ReadonlySet<MessengerUuid>,
  selectedUserUuids: readonly MessengerUuid[],
  query: string,
): WorkspaceUserPickerOption[] {
  // The old picker depends on numeric Zulip userId, so Workspace keeps the same
  // visual list but builds it from UUID users in user store.
  const normalizedQuery = normalizeWorkspaceMemberQuery(query);
  const selected = new Set(selectedUserUuids);
  const options: WorkspaceUserPickerOption[] = [];

  for (const user of Object.values(usersById)) {
    if (!isSelectableWorkspaceUser(user)) continue;
    if (existingMemberUuids.has(user.uuid)) continue;

    const fullName = resolveWorkspaceUserDisplayName(user);
    const email = user.email?.trim() ?? "";
    const searchValue = `${fullName} ${email}`.trim().toLowerCase();
    if (normalizedQuery.length > 0 && !searchValue.includes(normalizedQuery)) continue;

    options.push({
      userUuid: user.uuid,
      fullName,
      email,
      presence: resolveWorkspacePresence(user.status),
      statusLabel: resolveWorkspaceStatusLabel(user.status),
    });
  }

  options.sort((left, right) => {
    const leftSelected = selected.has(left.userUuid) ? 0 : 1;
    const rightSelected = selected.has(right.userUuid) ? 0 : 1;
    if (leftSelected !== rightSelected) return leftSelected - rightSelected;
    return left.fullName.localeCompare(right.fullName);
  });

  return options;
}

function toggleWorkspaceUserUuidSelection(
  selectedUserUuids: readonly MessengerUuid[],
  userUuid: MessengerUuid,
): MessengerUuid[] {
  const next = new Set(selectedUserUuids);
  if (next.has(userUuid)) {
    next.delete(userUuid);
  } else {
    next.add(userUuid);
  }
  return Array.from(next).sort((left, right) => left.localeCompare(right));
}

interface WorkspaceUserPickerListProps {
  options: readonly WorkspaceUserPickerOption[];
  selectedUserUuids: ReadonlySet<MessengerUuid>;
  query: string;
  onQueryChange: (query: string) => void;
  onToggle: (userUuid: MessengerUuid) => void;
}

const WorkspaceUserPickerList: React.FC<WorkspaceUserPickerListProps> = ({
  options,
  selectedUserUuids,
  query,
  onQueryChange,
  onToggle,
}) => {
  return (
    <div className="flex flex-1 flex-col gap-3 overflow-hidden">
      <input
        type="text"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        className={ADD_STREAM_MEMBERS_INPUT_CLASS}
        placeholder={t("message.searchUsers")}
      />
      <div className="h-96 overflow-y-auto rounded-lg border border-border-subtle">
        {options.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-text-muted">{t("search.noResults")}</p>
        ) : (
          options.map((option) => (
            <label
              key={option.userUuid}
              className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-text-primary transition-colors hover:bg-bg"
            >
              <input
                type="checkbox"
                checked={selectedUserUuids.has(option.userUuid)}
                onChange={() => onToggle(option.userUuid)}
                className="h-4 w-4 rounded border-border-subtle"
              />
              <PresenceIndicator status={option.presence} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{option.fullName}</span>
                {(option.statusLabel ?? option.email) && (
                  <span className="block truncate text-[11px] text-text-secondary">
                    {option.statusLabel ?? option.email}
                  </span>
                )}
              </span>
            </label>
          ))
        )}
      </div>
    </div>
  );
};

interface WorkspaceAddStreamMembersDialogProps {
  open: boolean;
  streamName: string;
  query: string;
  options: readonly WorkspaceUserPickerOption[];
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
        <WorkspaceUserPickerList
          options={options}
          selectedUserUuids={selectedUserUuids}
          query={query}
          onQueryChange={onQueryChange}
          onToggle={onToggle}
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

const WORKSPACE_DIRECT_PRIVATE_DETAIL_CONFIG: Record<
  WorkspaceRightPanelDirectPrivateInfoView["details"][number]["id"],
  {
    label: () => string;
    icon: IconName;
  }
> = {
  email: {
    label: () => t("common.email"),
    icon: "mail",
  },
  username: {
    label: () => t("info.username"),
    icon: "profile",
  },
  phone: {
    label: () => t("info.phone"),
    icon: "phone",
  },
  jobTitle: {
    label: () => t("info.jobTitle"),
    icon: "businessCenter",
  },
  manager: {
    label: () => t("info.manager"),
    icon: "handshake",
  },
  timezone: {
    label: () => t("info.timezone"),
    icon: "calendar",
  },
  birthday: {
    label: () => t("info.birthday"),
    icon: "calendar",
  },
};

const RightPanelWorkspaceDirectPrivateInfo: React.FC<{
  info: WorkspaceRightPanelDirectPrivateInfoView;
}> = ({ info }) => {
  const statusLabel = resolveWorkspaceStatusLabel(info.status);
  const presence = resolveWorkspacePresence(info.status);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden text-text-primary">
      <ScrollArea className="flex-1 px-4 py-3">
        <header className="border-b border-border-subtle pb-3">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <WorkspaceAvatar
                size="lg"
                avatarUrn={info.avatarUrl}
                className="bg-bg-elevated text-text-secondary"
              >
                {info.title.slice(0, 1)}
              </WorkspaceAvatar>
              {info.status != null && (
                <span className="absolute -bottom-0.5 -right-0.5">
                  <PresenceIndicator status={presence} size="sm" />
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <Copyable value={info.title} className="w-full">
                <p className="truncate text-sm font-medium text-text-primary">{info.title}</p>
              </Copyable>
              {statusLabel != null && (
                <p className="truncate text-[11px] text-text-secondary">{statusLabel}</p>
              )}
            </div>
          </div>
        </header>

        <div className="space-y-4 pt-3">
          <ul className="space-y-2">
            {info.details.map((detail) => {
              const config = WORKSPACE_DIRECT_PRIVATE_DETAIL_CONFIG[detail.id];
              const valueNode = (
                <span
                  className={`block truncate whitespace-nowrap ${
                    detail.isTemporarilyUnavailable ? "italic text-text-muted" : "text-text-primary"
                  }`}
                >
                  {detail.value}
                </span>
              );

              return (
                <li
                  key={detail.id}
                  className="flex items-start gap-3 rounded-lg px-1 py-1.5 text-sm"
                >
                  <Icon name={config.icon} size={20} className="mt-0.5 shrink-0 text-icon-base" />
                  <div className="min-w-0 flex-1">
                    <SectionLabel className="mb-0.5">{config.label()}</SectionLabel>
                    {detail.isTemporarilyUnavailable ? (
                      valueNode
                    ) : (
                      <Copyable value={detail.value} className="max-w-full">
                        {valueNode}
                      </Copyable>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <div>
            <SectionLabel className="mb-2">{t("info.commonGroups")}</SectionLabel>
            <p className="rounded-lg bg-bg-elevated px-2 py-2 text-sm italic text-text-muted">
              {t("workspaceMessenger.temporarilyNotConnected")}
            </p>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};

const RightPanelWorkspaceChannelInfo: React.FC<{
  info: WorkspaceRightPanelChannelInfoView;
}> = ({ info }) => {
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
  const workspaceUsersById = useUsersStore((state) => state.usersById);
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const runtimeContext = useMemo(
    () => selectCurrentWorkspaceRuntimeContext({ sessions, currentAccountId }),
    [currentAccountId, sessions],
  );
  const notificationMode = storeNotificationMode ?? info.notificationMode;
  const channelAvatarStyle = useMemo(
    () =>
      info.color == null
        ? undefined
        : { backgroundColor: `#${info.color.toString(16).padStart(6, "0")}` },
    [info.color],
  );
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
      memberActionCurrent.addDialogOpen
        ? filterWorkspaceUserOptions(
            workspaceUsersById,
            existingMemberUuids,
            memberActionCurrent.selectedUserUuids,
            memberActionCurrent.query,
          )
        : EMPTY_WORKSPACE_USER_OPTIONS,
    [
      existingMemberUuids,
      memberActionCurrent.addDialogOpen,
      memberActionCurrent.query,
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
    setMemberActionState({
      ...createWorkspaceMemberActionState(info.streamUuid),
      streamUuid: info.streamUuid,
      addDialogOpen: true,
    });
  }, [info.streamUuid]);

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
      selectedUserUuids: toggleWorkspaceUserUuidSelection(prev.selectedUserUuids, userUuid),
    }));
  }, []);

  const handleSubmitAddMembers = useCallback(async () => {
    if (
      info.streamUuid == null ||
      runtimeContext == null ||
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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden text-text-primary">
      <header className="flex-shrink-0 border-b border-border-subtle px-4 pb-3 pt-1">
        <div className="flex items-center gap-3">
          <Avatar
            size="lg"
            className="bg-bg-elevated text-text-secondary"
            style={channelAvatarStyle}
          >
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

      <ScrollArea className="flex-1 space-y-4 px-4 py-3">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
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
                onChange={(level) => {
                  void handleSetNotificationLevel(level);
                }}
                className="mx-2"
              />
              {notificationError && (
                <p className="mx-2 mt-1 text-xs text-notice-base">{notificationError}</p>
              )}
            </>
          ) : (
            <p className="mx-2 rounded-lg bg-bg-elevated px-2 py-2 text-sm text-text-muted">
              {t("workspaceMessenger.actionUnsupported")}
            </p>
          )}
        </div>

        {info.description && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              {t("chatInfo.description")}
            </h3>
            <p className="rounded-lg bg-bg-elevated px-2 py-2 text-sm text-text-primary">
              {info.description}
            </p>
          </div>
        )}

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {t("channel.topics")}
          </h3>
          {info.topics.length === 0 ? (
            <p className="px-2 py-2 text-sm text-text-muted">{t("channel.noTopics")}</p>
          ) : (
            <ul className="space-y-1.5">
              {info.topics.map((topic) => {
                const topicDisplay = resolveTopicDisplayInfo(topic.name);
                return (
                  <li key={topic.id}>
                    <button
                      type="button"
                      className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-text-primary transition-colors hover:bg-card-bg-active"
                      onClick={() => handleOpenTopic(topic.route)}
                    >
                      <span className={`truncate ${topicDisplay.isSystem ? "italic" : ""}`}>
                        {topicDisplay.label}
                      </span>
                      {topic.unreadCount > 0 && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-medium text-on-accent">
                          {topic.unreadCount}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          {/* Заголовок как на макете: только текст «Участники», без иконки слева.
              Кнопка person_add — 24×24, совпадает с hit-area h-6 w-6. */}
          <h3 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {t("channel.members")}
            {info.streamUuid != null && runtimeContext != null && (
              <button
                type="button"
                aria-label={t("channel.addMembers")}
                onClick={handleOpenAddMembers}
                className="flex h-6 w-6 items-center justify-center rounded text-text-secondary transition-colors hover:bg-card-bg-active hover:text-text-primary"
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
            <ul className="space-y-2">
              {info.members.map((member) => (
                <li key={member.bindingUuid} className="group/member">
                  {/* The member row is intentionally not a button: Workspace profile
                      flow is not wired here yet, so this surface creates no false action. */}
                  <div className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-card-bg-active">
                    <div className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <div className="relative shrink-0">
                        <WorkspaceAvatar
                          size="sm"
                          avatarUrn={member.avatarUrl}
                          className="bg-bg-elevated text-text-primary"
                        >
                          {member.name.slice(0, 1)}
                        </WorkspaceAvatar>
                        <span className="absolute -bottom-0.5 -right-0.5">
                          <PresenceIndicator
                            status={member.isOnline ? "active" : "offline"}
                            size="sm"
                          />
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm text-text-primary">
                          {member.name}
                          <span className="text-[10px] font-normal text-text-secondary">
                            {resolveWorkspaceRoleLabel(member.role)}
                          </span>
                        </p>
                        {(member.status != null || member.email != null) && (
                          <p className="truncate text-[11px] text-text-secondary">
                            {resolveWorkspaceStatusLabel(member.status) ?? member.email}
                          </p>
                        )}
                      </div>
                    </div>
                    {member.canRemove && runtimeContext != null && (
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
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {memberActionCurrent.removeError && (
            <p className="mt-2 px-2 text-xs text-notice-base">{memberActionCurrent.removeError}</p>
          )}
        </div>
      </ScrollArea>
      <WorkspaceAddStreamMembersDialog
        open={memberActionCurrent.addDialogOpen}
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
    </div>
  );
};

export const RightPanelWorkspaceInfo: React.FC<RightPanelWorkspaceInfoProps> = ({ info }) => {
  if (info.kind === "directPrivate" || info.kind === "userProfile") {
    return <RightPanelWorkspaceDirectPrivateInfo info={info} />;
  }

  return <RightPanelWorkspaceChannelInfo info={info} />;
};
