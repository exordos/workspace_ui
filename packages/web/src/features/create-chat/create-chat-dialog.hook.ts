import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import {
  runWorkspaceChannelCreate,
  runWorkspaceDirectStreamCreate,
} from "~/entities/messenger/messenger-create-chat-actions.lib";
import { runWorkspaceCreateTopicRequest } from "~/entities/messenger/messenger-sidebar-actions.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerStream } from "~/entities/messenger/messenger.types";
import { formatUserStatusLabel } from "~/entities/user/user-status.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { useUserGroupsStore } from "~/entities/user-group/user-group.model";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { fetchStreams, fetchSubscriptions } from "~/shared/api/zulip-streams";
import type { MockStream, ZulipSubscription } from "~/shared/api/zulip.types";
import { createLogger } from "~/shared/lib/logger";
import { buildAnnouncementOnlyCanSendGroup } from "~/shared/lib/user-group-policy";
import { buildUserPickerOptions, type UserPickerOption } from "~/shared/lib/user-picker";
import {
  buildBrowseChannelRows,
  resolveBrowseChannelSelection,
  type BrowseChannelRow,
  type BrowseChannelSubscriptionFilter,
} from "./create-chat-browse-channels.lib";
import {
  buildDmSlug,
  LEGACY_CREATE_CHAT_TABS,
  resolveNextTabFromKey,
  type CreateChatTab,
  WORKSPACE_CREATE_CHAT_TABS,
} from "./create-chat-dialog.lib";
import {
  createChannel,
  subscribeCurrentUserToStream,
  unarchiveChannel,
  unsubscribeChannel,
} from "./create-chat.api";

const log = createLogger("create-chat:dialog");

interface ArchivedChannelOption {
  streamId: number;
  name: string;
  lastMessage: string;
  time: string;
}

export interface CreateChatUserOption {
  userKey: string;
  legacyUserId: number | null;
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

/** Inline unarchive error state on the Archived tab. */
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

  groupSelectedUserKeys: Set<string>;
  toggleGroupUser: (userKey: string) => void;
  groupUsers: UseCreateChatDialogResult["filteredUsers"];
  createGroup: () => void;

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
  /** Async unarchive; on success the channel drops from the list after store refresh. */
  onUnarchiveArchivedChannel: (streamId: number) => Promise<void>;
  /** Stream ids with in-flight unarchive (button shows loading). */
  unarchivePendingStreamIds: readonly number[];
  unarchiveInlineError: UnarchiveInlineErrorState | null;

  channelsSearch: string;
  setChannelsSearch: (v: string) => void;
  channelsSubscriptionFilter: BrowseChannelSubscriptionFilter;
  setChannelsSubscriptionFilter: (filter: BrowseChannelSubscriptionFilter) => void;
  browseChannels: BrowseChannelRow[];
  selectedBrowseChannelId: number | null;
  setSelectedBrowseChannelId: (streamId: number) => void;
  selectedBrowseChannel: BrowseChannelRow | null;
  channelsLoading: boolean;
  channelsError: boolean;
  onSubscribeToChannel: (streamId: number, streamName: string) => Promise<void>;
  onUnsubscribeFromChannel: (streamId: number, streamName: string) => Promise<void>;
  subscribePendingStreamIds: readonly number[];
  subscribeInlineError: string | null;

  buildDmSlug: (userId: number, fullName: string) => string;
}

export function useCreateChatDialog(options: {
  open: boolean;
  mode?: "legacy" | "workspace";
  onNavigateDm: (slug: string) => void;
  onNavigateStream: (streamId: number, streamName: string) => void;
  onNavigateWorkspaceStream?: (streamUuid: string) => void;
  onNavigateWorkspaceTopic?: (streamUuid: string, topicUuid: string) => void;
  onChannelCreated: () => void;
}): UseCreateChatDialogResult {
  const {
    open,
    mode = "legacy",
    onNavigateDm,
    onNavigateWorkspaceStream,
    onNavigateWorkspaceTopic,
    onChannelCreated,
  } = options;
  const workspaceMode = mode === "workspace";
  const visibleTabs = workspaceMode ? WORKSPACE_CREATE_CHAT_TABS : LEGACY_CREATE_CHAT_TABS;

  const [tab, setTab] = useState<CreateChatTab>("dm");
  const tabBaseId = useId();
  const tabRefs = useRef<Record<CreateChatTab, HTMLButtonElement | null>>({
    dm: null,
    group: null,
    channels: null,
    channel: null,
    topic: null,
    archived: null,
  });

  const tabIds: Record<CreateChatTab, string> = useMemo(
    () => ({
      dm: `${tabBaseId}-tab-dm`,
      group: `${tabBaseId}-tab-group`,
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
      group: `${tabBaseId}-panel-group`,
      channels: `${tabBaseId}-panel-channels`,
      channel: `${tabBaseId}-panel-channel`,
      topic: `${tabBaseId}-panel-topic`,
      archived: `${tabBaseId}-panel-archived`,
    }),
    [tabBaseId],
  );

  const [userSearch, setUserSearch] = useState("");
  const [archivedSearch, setArchivedSearch] = useState("");
  const [groupSelectedUserKeys, setGroupSelectedUserKeys] = useState<Set<string>>(new Set());
  const [channelSelectedUserKeys, setChannelSelectedUserKeys] = useState<Set<string>>(new Set());
  const [channelName, setChannelName] = useState("");
  const [channelDesc, setChannelDesc] = useState("");
  const [channelInviteOnly, setChannelInviteOnly] = useState(false);
  const [channelAnnounce, setChannelAnnounce] = useState(false);
  const [channelAnnouncementOnly, setChannelAnnouncementOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const [unarchiveInlineError, setUnarchiveInlineError] =
    useState<UnarchiveInlineErrorState | null>(null);
  const [unarchivePendingStreamIds, setUnarchivePendingStreamIds] = useState<number[]>([]);
  const [channelsSearch, setChannelsSearch] = useState("");
  const [channelsSubscriptionFilter, setChannelsSubscriptionFilter] =
    useState<BrowseChannelSubscriptionFilter>("unsubscribed");
  const [browseStreams, setBrowseStreams] = useState<MockStream[]>([]);
  const [browseSubscriptions, setBrowseSubscriptions] = useState<ZulipSubscription[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channelsError, setChannelsError] = useState(false);
  const [subscribePendingStreamIds, setSubscribePendingStreamIds] = useState<number[]>([]);
  const [subscribeInlineError, setSubscribeInlineError] = useState<string | null>(null);
  const [selectedBrowseChannelId, setSelectedBrowseChannelIdState] = useState<number | null>(null);
  const [workspaceTopicStreamUuid, setWorkspaceTopicStreamUuid] = useState("");
  const [workspaceTopicName, setWorkspaceTopicName] = useState("");
  const channelsFetchedRef = useRef(false);

  const allUsers = useUsersStore((s) => s.users);
  const userGroups = useUserGroupsStore((s) => s.groups);
  const currentUserId = useChatListStore((s) => s.currentUserId ?? null);
  const streamsMap = useChatListStore((s) => s.streamsMap);
  const workspaceSessions = useWorkspaceAuthStore((state) => state.sessions);
  const workspaceCurrentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const workspaceRuntimeContext = useMemo(
    () =>
      workspaceMode
        ? selectCurrentWorkspaceRuntimeContext({
            sessions: workspaceSessions,
            currentAccountId: workspaceCurrentAccountId,
          })
        : null,
    [workspaceCurrentAccountId, workspaceMode, workspaceSessions],
  );
  const workspaceUsersById = useMessengerStore((state) => state.usersById);
  const workspaceStreamIds = useMessengerStore((state) => state.streamIds);
  const workspaceStreamsById = useMessengerStore((state) => state.streamsById);
  const workspaceStreams = useMemo(
    () =>
      workspaceStreamIds
        .map((streamId) => workspaceStreamsById[streamId])
        .filter((stream): stream is MessengerStream => stream != null),
    [workspaceStreamIds, workspaceStreamsById],
  );
  // Block channel create until author profile is loaded.
  const channelCreateBlocked = workspaceMode
    ? workspaceRuntimeContext == null
    : currentUserId == null || currentUserId <= 0;
  const channelCreateBlockedReasonKey = channelCreateBlocked
    ? "channel.creatorProfileLoading"
    : null;
  // Default posting policy for announcement-only channels.
  const announcementOnlyCanSendMessageGroup = useMemo(
    () => buildAnnouncementOnlyCanSendGroup({ userGroups, currentUserId }),
    [userGroups, currentUserId],
  );
  // Disable announcement-only toggle when no valid policy is available.
  const channelAnnouncementOnlyBlocked = announcementOnlyCanSendMessageGroup == null;
  const channelAnnouncementOnlyBlockedReasonKey = channelAnnouncementOnlyBlocked
    ? "channel.announcementOnlyUnsupported"
    : null;
  const effectiveChannelAnnouncementOnly =
    channelAnnouncementOnly && !channelAnnouncementOnlyBlocked;

  const pickerCandidates = useMemo(
    () =>
      Array.from(allUsers.values()).map((user) => ({
        userId: user.user_id,
        fullName: user.full_name,
        email: user.email,
        presenceStatus: user.presence?.status,
        presenceTimestamp: user.presence?.timestamp,
        statusLabel: formatUserStatusLabel(user.status),
      })),
    [allUsers],
  );

  const workspaceUserOptions = useMemo<CreateChatUserOption[]>(() => {
    const normalizedQuery = userSearch.trim().toLowerCase();
    const currentUserUuid = workspaceRuntimeContext?.userUuid ?? null;
    return Object.values(workspaceUsersById)
      .filter((user) => user.uuid !== currentUserUuid)
      .map((user) => {
        const presence: CreateChatUserOption["presence"] =
          user.status === "active" || user.status === "idle" ? user.status : "offline";
        const fullName = [user.firstName, user.lastName]
          .filter((part): part is string => part != null && part.trim().length > 0)
          .join(" ")
          .trim();
        return {
          userKey: user.uuid,
          legacyUserId: null,
          workspaceUserUuid: user.uuid,
          fullName: fullName.length > 0 ? fullName : user.username,
          email: user.email ?? "",
          presence,
          statusLabel: null,
        };
      })
      .filter((user) => {
        if (user.fullName.trim().length === 0) return false;
        if (normalizedQuery.length === 0) return true;
        return (
          user.fullName.toLowerCase().includes(normalizedQuery) ||
          user.email.toLowerCase().includes(normalizedQuery)
        );
      })
      .sort((left, right) => left.fullName.localeCompare(right.fullName));
  }, [userSearch, workspaceRuntimeContext?.userUuid, workspaceUsersById]);

  const excludedUserIds = useMemo(
    () => (currentUserId != null ? [currentUserId] : []),
    [currentUserId],
  );

  const filteredUsers = useMemo<CreateChatUserOption[]>(() => {
    if (workspaceMode) return workspaceUserOptions;
    return buildUserPickerOptions({
      candidates: pickerCandidates,
      selectedUserIds: [],
      excludedUserIds,
      query: userSearch,
    }).map((user) => ({
      userKey: String(user.userId),
      legacyUserId: user.userId,
      workspaceUserUuid: null,
      fullName: user.fullName,
      email: user.email,
      presence: user.presence,
      statusLabel: user.statusLabel,
    }));
  }, [excludedUserIds, pickerCandidates, userSearch, workspaceMode, workspaceUserOptions]);

  const groupUsers = useMemo<CreateChatUserOption[]>(() => {
    if (workspaceMode) {
      const selected = groupSelectedUserKeys;
      return [...workspaceUserOptions].sort((left, right) => {
        const leftSelected = selected.has(left.userKey) ? 0 : 1;
        const rightSelected = selected.has(right.userKey) ? 0 : 1;
        if (leftSelected !== rightSelected) return leftSelected - rightSelected;
        return left.fullName.localeCompare(right.fullName);
      });
    }
    return buildUserPickerOptions({
      candidates: pickerCandidates,
      selectedUserIds: Array.from(groupSelectedUserKeys)
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value)),
      excludedUserIds,
      query: userSearch,
    }).map((user) => ({
      userKey: String(user.userId),
      legacyUserId: user.userId,
      workspaceUserUuid: null,
      fullName: user.fullName,
      email: user.email,
      presence: user.presence,
      statusLabel: user.statusLabel,
    }));
  }, [
    excludedUserIds,
    groupSelectedUserKeys,
    pickerCandidates,
    userSearch,
    workspaceMode,
    workspaceUserOptions,
  ]);

  const channelUsers = useMemo<CreateChatUserOption[]>(() => {
    if (workspaceMode) {
      const selected = channelSelectedUserKeys;
      return [...workspaceUserOptions].sort((left, right) => {
        const leftSelected = selected.has(left.userKey) ? 0 : 1;
        const rightSelected = selected.has(right.userKey) ? 0 : 1;
        if (leftSelected !== rightSelected) return leftSelected - rightSelected;
        return left.fullName.localeCompare(right.fullName);
      });
    }
    return buildUserPickerOptions({
      candidates: pickerCandidates,
      selectedUserIds: Array.from(channelSelectedUserKeys)
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value)),
      excludedUserIds,
      query: userSearch,
    }).map((user) => ({
      userKey: String(user.userId),
      legacyUserId: user.userId,
      workspaceUserUuid: null,
      fullName: user.fullName,
      email: user.email,
      presence: user.presence,
      statusLabel: user.statusLabel,
    }));
  }, [
    channelSelectedUserKeys,
    excludedUserIds,
    pickerCandidates,
    userSearch,
    workspaceMode,
    workspaceUserOptions,
  ]);

  const archivedChannels = useMemo<ArchivedChannelOption[]>(() => {
    const normalizedQuery = archivedSearch.trim().toLowerCase();
    const archived = Array.from(streamsMap.values())
      .filter((stream) => stream.isArchived === true)
      .map((stream) => ({
        streamId: stream.stream_id,
        name: stream.name,
        lastMessage: stream.lastMessage,
        time: stream.time,
        ts: stream.ts,
      }))
      .sort((left, right) => right.ts - left.ts)
      .filter((stream) => stream.name.toLowerCase().includes(normalizedQuery))
      .map((stream) => ({
        streamId: stream.streamId,
        name: stream.name,
        lastMessage: stream.lastMessage,
        time: stream.time,
      }));
    return archived;
  }, [archivedSearch, streamsMap]);

  const browseChannels = useMemo(
    () =>
      buildBrowseChannelRows({
        streams: browseStreams,
        subscriptions: browseSubscriptions,
        searchQuery: channelsSearch,
        subscriptionFilter: channelsSubscriptionFilter,
      }),
    [browseStreams, browseSubscriptions, channelsSearch, channelsSubscriptionFilter],
  );

  const selectedBrowseChannel = useMemo(
    () => browseChannels.find((channel) => channel.streamId === selectedBrowseChannelId) ?? null,
    [browseChannels, selectedBrowseChannelId],
  );

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
    !workspaceMode ||
    selectedWorkspaceTopicStreamUuid.trim().length === 0 ||
    !workspaceTopicName.trim();

  const setSelectedBrowseChannelId = useCallback((streamId: number) => {
    setSelectedBrowseChannelIdState(streamId);
  }, []);

  useEffect(() => {
    setSelectedBrowseChannelIdState((currentId) =>
      resolveBrowseChannelSelection(browseChannels, currentId),
    );
  }, [browseChannels]);

  useEffect(() => {
    if (!open || tab !== "channels") {
      return;
    }
    if (channelsFetchedRef.current) {
      return;
    }

    let cancelled = false;
    setChannelsLoading(true);
    setChannelsError(false);

    void (async () => {
      try {
        const [streams, subscriptions] = await Promise.all([fetchStreams(), fetchSubscriptions()]);
        if (cancelled) {
          return;
        }
        setBrowseStreams(streams);
        setBrowseSubscriptions(subscriptions);
        channelsFetchedRef.current = true;
      } catch (err) {
        if (!cancelled) {
          setChannelsError(true);
          log.error("browse channels fetch failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } finally {
        if (!cancelled) {
          setChannelsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, tab]);

  useEffect(() => {
    setSubscribeInlineError(null);
  }, [channelsSearch]);

  useEffect(() => {
    setUnarchiveInlineError(null);
  }, [archivedSearch]);

  useEffect(() => {
    if (open) return;
    void Promise.resolve().then(() => {
      setTab("dm");
      setUserSearch("");
      setArchivedSearch("");
      setGroupSelectedUserKeys(new Set());
      setChannelSelectedUserKeys(new Set());
      setChannelName("");
      setChannelDesc("");
      setChannelInviteOnly(false);
      setChannelAnnounce(false);
      setChannelAnnouncementOnly(false);
      setCreating(false);
      setUnarchiveInlineError(null);
      setUnarchivePendingStreamIds([]);
      setChannelsSearch("");
      setBrowseStreams([]);
      setBrowseSubscriptions([]);
      channelsFetchedRef.current = false;
      setChannelsLoading(false);
      setChannelsError(false);
      setSubscribePendingStreamIds([]);
      setSubscribeInlineError(null);
      setSelectedBrowseChannelIdState(null);
      setWorkspaceTopicStreamUuid("");
      setWorkspaceTopicName("");
    });
  }, [open]);

  const toggleGroupUser = useCallback((userKey: string) => {
    setGroupSelectedUserKeys((prev) => {
      const next = new Set(prev);
      if (next.has(userKey)) next.delete(userKey);
      else next.add(userKey);
      return next;
    });
  }, []);

  const toggleChannelUser = useCallback((userKey: string) => {
    setChannelSelectedUserKeys((prev) => {
      const next = new Set(prev);
      if (next.has(userKey)) next.delete(userKey);
      else next.add(userKey);
      return next;
    });
  }, []);

  const createGroup = useCallback(() => {
    if (workspaceMode) {
      if (groupSelectedUserKeys.size === 0) return;
      const selectedUsers = groupUsers.filter((user) => groupSelectedUserKeys.has(user.userKey));
      const memberUserUuids = selectedUsers
        .map((user) => user.workspaceUserUuid)
        .filter((userUuid): userUuid is string => userUuid != null);
      if (memberUserUuids.length === 0) return;
      const name = selectedUsers.map((user) => user.fullName).join(", ");
      setCreating(true);
      void runWorkspaceChannelCreate({
        name,
        description: "",
        inviteOnly: true,
        announce: false,
        memberUserUuids,
      })
        .then((result) => {
          if (result.status !== "applied") return;
          setGroupSelectedUserKeys(new Set());
          onNavigateWorkspaceStream?.(result.stream.uuid);
          onChannelCreated();
        })
        .catch((err) => {
          log.error("workspace group create failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        })
        .finally(() => {
          setCreating(false);
        });
      return;
    }
    if (groupSelectedUserKeys.size === 0 || currentUserId == null) return;
    const selectedLegacyIds = Array.from(groupSelectedUserKeys)
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value));
    const ids = [...selectedLegacyIds, currentUserId].sort((a, b) => a - b);
    onNavigateDm(ids.join(","));
    setGroupSelectedUserKeys(new Set());
  }, [
    currentUserId,
    groupSelectedUserKeys,
    groupUsers,
    onChannelCreated,
    onNavigateDm,
    onNavigateWorkspaceStream,
    workspaceMode,
  ]);

  const openDirectUser = useCallback(
    (user: CreateChatUserOption) => {
      if (workspaceMode) {
        if (user.workspaceUserUuid == null) return;
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
        return;
      }
      if (user.legacyUserId == null) return;
      onNavigateDm(buildDmSlug(user.legacyUserId, user.fullName));
    },
    [onChannelCreated, onNavigateDm, onNavigateWorkspaceStream, workspaceMode],
  );

  const focusTab = useCallback((nextTab: CreateChatTab) => {
    tabRefs.current[nextTab]?.focus();
  }, []);

  // Encapsulate tab ref mutation inside the hook.
  const setTabRef = useCallback((tab: CreateChatTab, node: HTMLButtonElement | null) => {
    tabRefs.current[tab] = node;
  }, []);

  const onTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, currentTab: CreateChatTab) => {
      const nextTab = resolveNextTabFromKey({ key: event.key, currentTab, tabs: visibleTabs });
      if (nextTab == null) return;
      event.preventDefault();
      setTab(nextTab);
      focusTab(nextTab);
    },
    [focusTab, visibleTabs],
  );

  const createChannelAction = useCallback(() => {
    if (!channelName.trim() || creating) return;
    if (workspaceMode) {
      if (workspaceRuntimeContext == null) return;
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
      return;
    }
    if (currentUserId == null || currentUserId <= 0) return;
    // Always include channel author in subscribers even if not manually selected.
    const selectedLegacyIds = Array.from(channelSelectedUserKeys)
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value));
    const subscribers = Array.from(new Set([...selectedLegacyIds, currentUserId])).sort(
      (a, b) => a - b,
    );
    setCreating(true);
    const runCreateChannel = async (): Promise<void> => {
      try {
        const result = await createChannel({
          name: channelName.trim(),
          description: channelDesc.trim(),
          subscribers,
          inviteOnly: channelInviteOnly,
          announce: channelAnnounce,
          // Send posting policy only when announcement-only is enabled with a valid group setting.
          ...(effectiveChannelAnnouncementOnly && announcementOnlyCanSendMessageGroup != null
            ? { canSendMessageGroup: announcementOnlyCanSendMessageGroup }
            : {}),
        });
        if (!result) return;
        setChannelName("");
        setChannelDesc("");
        setChannelSelectedUserKeys(new Set());
        setChannelInviteOnly(false);
        setChannelAnnounce(false);
        setChannelAnnouncementOnly(false);
        onChannelCreated();
      } catch {
        // API layer already logs errors — do not let the UI handler throw.
      } finally {
        setCreating(false);
      }
    };
    void runCreateChannel();
  }, [
    channelName,
    channelDesc,
    channelSelectedUserKeys,
    channelUsers,
    channelInviteOnly,
    channelAnnounce,
    effectiveChannelAnnouncementOnly,
    announcementOnlyCanSendMessageGroup,
    creating,
    currentUserId,
    onChannelCreated,
    onNavigateWorkspaceStream,
    workspaceMode,
    workspaceRuntimeContext,
  ]);

  const createWorkspaceTopic = useCallback(() => {
    const streamUuid = selectedWorkspaceTopicStreamUuid.trim();
    const name = workspaceTopicName.trim();
    if (!workspaceMode || streamUuid.length === 0 || name.length === 0 || creating) return;
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
    workspaceMode,
    workspaceTopicName,
  ]);

  const buildDmSlugFn = useCallback((userId: number, fullName: string) => {
    return buildDmSlug(userId, fullName);
  }, []);

  const onUnarchiveArchivedChannel = useCallback(async (streamId: number) => {
    setUnarchiveInlineError(null);
    setUnarchivePendingStreamIds((prev) => (prev.includes(streamId) ? prev : [...prev, streamId]));
    try {
      const result = await unarchiveChannel(streamId);
      if (result.ok) {
        return;
      }
      if (result.kind === "unsupported") {
        setUnarchiveInlineError({ kind: "unsupported" });
      } else {
        setUnarchiveInlineError({ kind: "failed", message: result.message });
      }
      log.warn("unarchive channel rejected", {
        streamId,
        kind: result.kind,
        status: result.status,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setUnarchiveInlineError({ kind: "failed", message });
      log.error("unarchive channel threw", { streamId, error: message });
    } finally {
      setUnarchivePendingStreamIds((prev) => prev.filter((id) => id !== streamId));
    }
  }, []);

  const onSubscribeToChannel = useCallback(
    async (streamId: number, streamName: string) => {
      if (currentUserId == null || currentUserId <= 0) {
        return;
      }
      setSubscribeInlineError(null);
      setSubscribePendingStreamIds((prev) =>
        prev.includes(streamId) ? prev : [...prev, streamId],
      );
      try {
        const result = await subscribeCurrentUserToStream(streamName, currentUserId);
        if (!result.ok) {
          setSubscribeInlineError(result.errorCode ?? "unknown_error");
          log.warn("subscribe to channel rejected", { streamId, errorCode: result.errorCode });
          return;
        }
        useChatListStore.getState().upsertStreamMetadataRows([{ streamId, name: streamName }]);
        setBrowseSubscriptions((prev) => {
          if (prev.some((subscription) => subscription.stream_id === streamId)) {
            return prev;
          }
          return [
            ...prev,
            {
              stream_id: streamId,
              name: streamName,
              is_muted: false,
              is_archived: false,
              invite_only: false,
            },
          ];
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setSubscribeInlineError(message);
        log.error("subscribe to channel threw", { streamId, error: message });
      } finally {
        setSubscribePendingStreamIds((prev) => prev.filter((id) => id !== streamId));
      }
    },
    [currentUserId],
  );

  const onUnsubscribeFromChannel = useCallback(async (streamId: number, streamName: string) => {
    setSubscribeInlineError(null);
    setSubscribePendingStreamIds((prev) => (prev.includes(streamId) ? prev : [...prev, streamId]));
    try {
      const ok = await unsubscribeChannel(streamName);
      if (!ok) {
        setSubscribeInlineError("unsubscribe_failed");
        log.warn("unsubscribe from channel rejected", { streamId });
        return;
      }
      useChatListStore.getState().removeStream(streamId);
      setBrowseSubscriptions((prev) =>
        prev.filter((subscription) => subscription.stream_id !== streamId),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSubscribeInlineError(message);
      log.error("unsubscribe from channel threw", { streamId, error: message });
    } finally {
      setSubscribePendingStreamIds((prev) => prev.filter((id) => id !== streamId));
    }
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
    groupSelectedUserKeys,
    toggleGroupUser,
    groupUsers,
    createGroup,
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
    channelAnnouncementOnly: effectiveChannelAnnouncementOnly,
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
    archivedChannels,
    onUnarchiveArchivedChannel,
    unarchivePendingStreamIds,
    unarchiveInlineError,
    channelsSearch,
    setChannelsSearch,
    channelsSubscriptionFilter,
    setChannelsSubscriptionFilter,
    browseChannels,
    selectedBrowseChannelId,
    setSelectedBrowseChannelId,
    selectedBrowseChannel,
    channelsLoading,
    channelsError,
    onSubscribeToChannel,
    onUnsubscribeFromChannel,
    subscribePendingStreamIds,
    subscribeInlineError,
    buildDmSlug: buildDmSlugFn,
  };
}
