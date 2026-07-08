import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  runWorkspaceChannelCreate,
  runWorkspaceDirectStreamCreate,
} from "~/entities/messenger/messenger-create-chat-actions.lib";
import { runWorkspaceCreateTopicRequest } from "~/entities/messenger/messenger-sidebar-actions.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerStream } from "~/entities/messenger/messenger.types";
import { selectUserDisplayName } from "~/entities/user/user-selectors.lib";
import { useUsersStore } from "~/entities/user/user.model";
import type { User } from "~/entities/user/user.types";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { createLogger } from "~/shared/lib/logger";
import type { UserPickerOption } from "~/shared/lib/user-picker";
import {
  CREATE_CHAT_TABS,
  resolveNextTabFromKey,
  type CreateChatTab,
} from "./create-chat-dialog.lib";

const log = createLogger("create-chat:dialog");

const SYSTEM_WORKSPACE_USER_UUID = "00000000-0000-0000-0000-000000000000";
const EMPTY_ARCHIVED_CHANNELS: ArchivedChannelOption[] = [];
const EMPTY_BROWSE_CHANNELS: [] = [];

export type BrowseChannelSubscriptionFilter = "unsubscribed" | "subscribed" | "all";

function resolveWorkspacePickerPresence(status: User["status"]): UserPickerOption["presence"] {
  if (status === "active" || status === "idle") {
    return status;
  }
  return "offline";
}

interface ArchivedChannelOption {
  streamId: number;
  name: string;
  lastMessage: string;
  time: string;
}

export interface CreateChatUserOption {
  userKey: string;
  workspaceUserUuid: string | null;
  fullName: string;
  email: string;
  presence: UserPickerOption["presence"];
  statusLabel: string | null;
}

export interface CreateChatWorkspaceStreamOption {
  streamUuid: string;
  name: string;
}

/** Archived tab is kept as a Workspace placeholder; no legacy API errors are produced. */
export type UnarchiveInlineErrorState =
  | { kind: "unsupported" }
  | { kind: "failed"; message: string };

export interface UseCreateChatDialogResult {
  tab: CreateChatTab;
  setTab: (tab: CreateChatTab) => void;
  visibleTabs: readonly CreateChatTab[];

  tabIds: Record<CreateChatTab, string>;
  panelIds: Record<CreateChatTab, string>;
  setTabRef: (tab: CreateChatTab, node: HTMLButtonElement | null) => void;
  onTabKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>, currentTab: CreateChatTab) => void;

  userSearch: string;
  setUserSearch: (v: string) => void;
  filteredUsers: CreateChatUserOption[];
  openDirectUser: (user: CreateChatUserOption) => void;

  channelSelectedUserKeys: Set<string>;
  toggleChannelUser: (userKey: string) => void;
  channelUsers: UseCreateChatDialogResult["filteredUsers"];

  channelName: string;
  setChannelName: (v: string) => void;
  channelDesc: string;
  setChannelDesc: (v: string) => void;
  channelInviteOnly: boolean;
  setChannelInviteOnly: (v: boolean) => void;
  channelAnnounce: boolean;
  setChannelAnnounce: (v: boolean) => void;
  channelAnnouncementOnly: boolean;
  setChannelAnnouncementOnly: (v: boolean) => void;
  channelAnnouncementOnlyBlocked: boolean;
  channelAnnouncementOnlyBlockedReasonKey: string | null;
  creating: boolean;
  channelCreateBlocked: boolean;
  channelCreateBlockedReasonKey: string | null;
  createChannel: () => void;
  workspaceTopicStreams: CreateChatWorkspaceStreamOption[];
  workspaceTopicStreamUuid: string;
  setWorkspaceTopicStreamUuid: (streamUuid: string) => void;
  workspaceTopicName: string;
  setWorkspaceTopicName: (name: string) => void;
  workspaceTopicCreateBlocked: boolean;
  createWorkspaceTopic: () => void;

  archivedSearch: string;
  setArchivedSearch: (v: string) => void;
  archivedChannels: ArchivedChannelOption[];
  onUnarchiveArchivedChannel: (streamId: number) => Promise<void>;
  unarchivePendingStreamIds: readonly number[];
  unarchiveInlineError: UnarchiveInlineErrorState | null;

  channelsSearch: string;
  setChannelsSearch: (v: string) => void;
  channelsSubscriptionFilter: BrowseChannelSubscriptionFilter;
  setChannelsSubscriptionFilter: (filter: BrowseChannelSubscriptionFilter) => void;
  browseChannels: [];
  selectedBrowseChannelId: number | null;
  setSelectedBrowseChannelId: (streamId: number) => void;
  selectedBrowseChannel: null;
  channelsLoading: boolean;
  channelsError: boolean;
  onSubscribeToChannel: (streamId: number, streamName: string) => Promise<void>;
  onUnsubscribeFromChannel: (streamId: number, streamName: string) => Promise<void>;
  subscribePendingStreamIds: readonly number[];
  subscribeInlineError: string | null;
}

export function useCreateChatDialog(options: {
  open: boolean;
  visibleTabs?: readonly CreateChatTab[];
  onNavigateWorkspaceStream?: (streamUuid: string) => void;
  onNavigateWorkspaceTopic?: (streamUuid: string, topicUuid: string) => void;
  onChannelCreated: () => void;
}): UseCreateChatDialogResult {
  const {
    open,
    visibleTabs: requestedVisibleTabs = CREATE_CHAT_TABS,
    onNavigateWorkspaceStream,
    onNavigateWorkspaceTopic,
    onChannelCreated,
  } = options;
  const visibleTabs = useMemo(() => {
    const uniqueTabs = requestedVisibleTabs.filter(
      (candidate, index, tabs) => tabs.indexOf(candidate) === index,
    );
    return uniqueTabs.length > 0 ? uniqueTabs : CREATE_CHAT_TABS;
  }, [requestedVisibleTabs]);

  const [tab, setTabState] = useState<CreateChatTab>("dm");
  const setTab = useCallback(
    (nextTab: CreateChatTab) => {
      if (!visibleTabs.includes(nextTab)) return;
      setTabState(nextTab);
    },
    [visibleTabs],
  );
  const tabBaseId = useId();
  const tabRefs = useRef<Record<CreateChatTab, HTMLButtonElement | null>>({
    dm: null,
    channels: null,
    channel: null,
    topic: null,
    archived: null,
  });

  const tabIds: Record<CreateChatTab, string> = useMemo(
    () => ({
      dm: `${tabBaseId}-tab-dm`,
      channels: `${tabBaseId}-tab-channels`,
      channel: `${tabBaseId}-tab-channel`,
      topic: `${tabBaseId}-tab-topic`,
      archived: `${tabBaseId}-tab-archived`,
    }),
    [tabBaseId],
  );
  const panelIds: Record<CreateChatTab, string> = useMemo(
    () => ({
      dm: `${tabBaseId}-panel-dm`,
      channels: `${tabBaseId}-panel-channels`,
      channel: `${tabBaseId}-panel-channel`,
      topic: `${tabBaseId}-panel-topic`,
      archived: `${tabBaseId}-panel-archived`,
    }),
    [tabBaseId],
  );

  const [userSearch, setUserSearch] = useState("");
  const [archivedSearch, setArchivedSearch] = useState("");
  const [channelSelectedUserKeys, setChannelSelectedUserKeys] = useState<Set<string>>(new Set());
  const [channelName, setChannelName] = useState("");
  const [channelDesc, setChannelDesc] = useState("");
  const [channelInviteOnly, setChannelInviteOnly] = useState(false);
  const [channelAnnounce, setChannelAnnounce] = useState(false);
  const [channelAnnouncementOnly, setChannelAnnouncementOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const [channelsSearch, setChannelsSearch] = useState("");
  const [channelsSubscriptionFilter, setChannelsSubscriptionFilter] =
    useState<BrowseChannelSubscriptionFilter>("unsubscribed");
  const [selectedBrowseChannelId, setSelectedBrowseChannelIdState] = useState<number | null>(null);
  const [workspaceTopicStreamUuid, setWorkspaceTopicStreamUuid] = useState("");
  const [workspaceTopicName, setWorkspaceTopicName] = useState("");

  const usersById = useUsersStore((s) => s.usersById);
  const userIds = useUsersStore((s) => s.userIds);
  const workspaceSessions = useWorkspaceAuthStore((state) => state.sessions);
  const workspaceCurrentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const workspaceRuntimeContext = useMemo(
    () =>
      selectCurrentWorkspaceRuntimeContext({
        sessions: workspaceSessions,
        currentAccountId: workspaceCurrentAccountId,
      }),
    [workspaceCurrentAccountId, workspaceSessions],
  );
  const workspaceStreamIds = useMessengerStore((state) => state.streamIds);
  const workspaceStreamsById = useMessengerStore((state) => state.streamsById);
  const workspaceStreams = useMemo(
    () =>
      workspaceStreamIds
        .map((streamId) => workspaceStreamsById[streamId])
        .filter((stream): stream is MessengerStream => stream != null),
    [workspaceStreamIds, workspaceStreamsById],
  );

  const channelCreateBlocked = workspaceRuntimeContext == null;
  const channelCreateBlockedReasonKey = channelCreateBlocked
    ? "channel.creatorProfileLoading"
    : null;
  const channelAnnouncementOnlyBlocked = true;
  const channelAnnouncementOnlyBlockedReasonKey = "channel.workspaceAnnouncementOnlyUnsupported";

  const workspaceUserOptions = useMemo<CreateChatUserOption[]>(() => {
    const normalizedQuery = userSearch.trim().toLowerCase();
    const currentUserUuid = workspaceRuntimeContext?.userUuid ?? null;
    return userIds
      .map((userId) => usersById[userId])
      .filter((user): user is User => user != null)
      .filter((user) => user.uuid !== currentUserUuid)
      .filter((user) => user.uuid !== SYSTEM_WORKSPACE_USER_UUID)
      .map((user) => ({
        userKey: user.uuid,
        workspaceUserUuid: user.uuid,
        fullName: selectUserDisplayName(user, user.uuid),
        email: user.email ?? "",
        presence: resolveWorkspacePickerPresence(user.status),
        statusLabel: user.statusText,
      }))
      .filter((user) => {
        if (user.fullName.trim().length === 0) return false;
        if (normalizedQuery.length === 0) return true;
        return (
          user.fullName.toLowerCase().includes(normalizedQuery) ||
          user.email.toLowerCase().includes(normalizedQuery)
        );
      })
      .sort((left, right) => left.fullName.localeCompare(right.fullName));
  }, [userIds, userSearch, usersById, workspaceRuntimeContext?.userUuid]);

  const filteredUsers = workspaceUserOptions;
  const channelUsers = useMemo(() => {
    return [...workspaceUserOptions].sort((left, right) => {
      const leftSelected = channelSelectedUserKeys.has(left.userKey) ? 0 : 1;
      const rightSelected = channelSelectedUserKeys.has(right.userKey) ? 0 : 1;
      if (leftSelected !== rightSelected) return leftSelected - rightSelected;
      return left.fullName.localeCompare(right.fullName);
    });
  }, [channelSelectedUserKeys, workspaceUserOptions]);

  const workspaceTopicStreams = useMemo<CreateChatWorkspaceStreamOption[]>(
    () =>
      workspaceStreams
        .filter((stream) => !stream.isArchived)
        .map((stream) => ({
          streamUuid: stream.uuid,
          name: stream.name,
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    [workspaceStreams],
  );
  const selectedWorkspaceTopicStreamUuid = workspaceTopicStreams.some(
    (stream) => stream.streamUuid === workspaceTopicStreamUuid,
  )
    ? workspaceTopicStreamUuid
    : (workspaceTopicStreams[0]?.streamUuid ?? "");

  const workspaceTopicCreateBlocked =
    selectedWorkspaceTopicStreamUuid.trim().length === 0 || !workspaceTopicName.trim();

  useEffect(() => {
    if (open) return;
    void Promise.resolve().then(() => {
      setTabState(visibleTabs[0] ?? "dm");
      setUserSearch("");
      setArchivedSearch("");
      setChannelSelectedUserKeys(new Set());
      setChannelName("");
      setChannelDesc("");
      setChannelInviteOnly(false);
      setChannelAnnounce(false);
      setChannelAnnouncementOnly(false);
      setCreating(false);
      setChannelsSearch("");
      setChannelsSubscriptionFilter("unsubscribed");
      setSelectedBrowseChannelIdState(null);
      setWorkspaceTopicStreamUuid("");
      setWorkspaceTopicName("");
    });
  }, [open, visibleTabs]);

  useEffect(() => {
    if (visibleTabs.includes(tab)) return;
    setTabState(visibleTabs[0] ?? "dm");
  }, [tab, visibleTabs]);

  const toggleChannelUser = useCallback((userKey: string) => {
    setChannelSelectedUserKeys((prev) => {
      const next = new Set(prev);
      if (next.has(userKey)) next.delete(userKey);
      else next.add(userKey);
      return next;
    });
  }, []);

  const openDirectUser = useCallback(
    (user: CreateChatUserOption) => {
      if (user.workspaceUserUuid == null || creating) return;
      setCreating(true);
      void runWorkspaceDirectStreamCreate({ directUserUuid: user.workspaceUserUuid })
        .then((result) => {
          if (result.status !== "applied") return;
          onNavigateWorkspaceStream?.(result.stream.uuid);
          onChannelCreated();
        })
        .catch((err) => {
          log.error("workspace direct stream create failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        })
        .finally(() => {
          setCreating(false);
        });
    },
    [creating, onChannelCreated, onNavigateWorkspaceStream],
  );

  const focusTab = useCallback((nextTab: CreateChatTab) => {
    tabRefs.current[nextTab]?.focus();
  }, []);

  const setTabRef = useCallback((tab: CreateChatTab, node: HTMLButtonElement | null) => {
    tabRefs.current[tab] = node;
  }, []);

  const onTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, currentTab: CreateChatTab) => {
      const nextTab = resolveNextTabFromKey({ key: event.key, currentTab, tabs: visibleTabs });
      if (nextTab == null) return;
      event.preventDefault();
      setTabState(nextTab);
      focusTab(nextTab);
    },
    [focusTab, visibleTabs],
  );

  const createChannelAction = useCallback(() => {
    if (!channelName.trim() || creating || workspaceRuntimeContext == null) return;
    const memberUserUuids = channelUsers
      .filter((user) => channelSelectedUserKeys.has(user.userKey))
      .map((user) => user.workspaceUserUuid)
      .filter((userUuid): userUuid is string => userUuid != null);

    setCreating(true);
    void runWorkspaceChannelCreate({
      name: channelName.trim(),
      description: channelDesc.trim(),
      memberUserUuids,
      inviteOnly: channelInviteOnly,
      announce: channelAnnounce,
    })
      .then((result) => {
        if (result.status !== "applied") return;
        setChannelName("");
        setChannelDesc("");
        setChannelSelectedUserKeys(new Set());
        setChannelInviteOnly(false);
        setChannelAnnounce(false);
        setChannelAnnouncementOnly(false);
        onNavigateWorkspaceStream?.(result.stream.uuid);
        onChannelCreated();
      })
      .catch((err) => {
        log.error("workspace channel create failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => {
        setCreating(false);
      });
  }, [
    channelAnnounce,
    channelDesc,
    channelInviteOnly,
    channelName,
    channelSelectedUserKeys,
    channelUsers,
    creating,
    onChannelCreated,
    onNavigateWorkspaceStream,
    workspaceRuntimeContext,
  ]);

  const createWorkspaceTopic = useCallback(() => {
    const streamUuid = selectedWorkspaceTopicStreamUuid.trim();
    const name = workspaceTopicName.trim();
    if (streamUuid.length === 0 || name.length === 0 || creating) return;
    setCreating(true);
    void runWorkspaceCreateTopicRequest({ streamUuid, name })
      .then((result) => {
        if (result.status !== "applied") return;
        setWorkspaceTopicName("");
        onNavigateWorkspaceTopic?.(result.topic.streamUuid, result.topic.uuid);
        onChannelCreated();
      })
      .catch((err) => {
        log.error("workspace topic create failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => {
        setCreating(false);
      });
  }, [
    creating,
    onChannelCreated,
    onNavigateWorkspaceTopic,
    selectedWorkspaceTopicStreamUuid,
    workspaceTopicName,
  ]);

  const onUnsupportedAsyncAction = useCallback(async () => {}, []);
  const onUnsupportedBrowseSelect = useCallback((streamId: number) => {
    setSelectedBrowseChannelIdState(streamId);
  }, []);

  return {
    tab,
    setTab,
    visibleTabs,
    tabIds,
    panelIds,
    setTabRef,
    onTabKeyDown,
    userSearch,
    setUserSearch,
    filteredUsers,
    openDirectUser,
    channelSelectedUserKeys,
    toggleChannelUser,
    channelUsers,
    channelName,
    setChannelName,
    channelDesc,
    setChannelDesc,
    channelInviteOnly,
    setChannelInviteOnly,
    channelAnnounce,
    setChannelAnnounce,
    channelAnnouncementOnly: channelAnnouncementOnly && !channelAnnouncementOnlyBlocked,
    setChannelAnnouncementOnly,
    channelAnnouncementOnlyBlocked,
    channelAnnouncementOnlyBlockedReasonKey,
    creating,
    channelCreateBlocked,
    channelCreateBlockedReasonKey,
    createChannel: createChannelAction,
    workspaceTopicStreams,
    workspaceTopicStreamUuid: selectedWorkspaceTopicStreamUuid,
    setWorkspaceTopicStreamUuid,
    workspaceTopicName,
    setWorkspaceTopicName,
    workspaceTopicCreateBlocked,
    createWorkspaceTopic,
    archivedSearch,
    setArchivedSearch,
    archivedChannels: EMPTY_ARCHIVED_CHANNELS,
    onUnarchiveArchivedChannel: onUnsupportedAsyncAction,
    unarchivePendingStreamIds: [],
    unarchiveInlineError: null,
    channelsSearch,
    setChannelsSearch,
    channelsSubscriptionFilter,
    setChannelsSubscriptionFilter,
    browseChannels: EMPTY_BROWSE_CHANNELS,
    selectedBrowseChannelId,
    setSelectedBrowseChannelId: onUnsupportedBrowseSelect,
    selectedBrowseChannel: null,
    channelsLoading: false,
    channelsError: false,
    onSubscribeToChannel: onUnsupportedAsyncAction,
    onUnsubscribeFromChannel: onUnsupportedAsyncAction,
    subscribePendingStreamIds: [],
    subscribeInlineError: null,
  };
}
