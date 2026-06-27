import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { formatUserStatusLabel } from "~/entities/user/user-status.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { useUserGroupsStore } from "~/entities/user-group/user-group.model";
import { fetchStreams, fetchSubscriptions } from "~/shared/api/messenger-streams";
import { fetchUsers } from "~/shared/api/messenger-users";
import type { MockStream, MessengerSubscription } from "~/shared/api/messenger.types";
import { createLogger } from "~/shared/lib/logger";
import { buildAnnouncementOnlyCanSendGroup } from "~/shared/lib/user-group-policy";
import type { UserId } from "~/shared/lib/user-id.lib";
import { compareUserIds, isUserIdentityReady, userIdsEqual } from "~/shared/lib/user-id.lib";
import {
  buildUserPickerOptions,
  resolveUserPickerEmptyLabelKey,
  type UserPickerOption,
} from "~/shared/lib/user-picker";
import {
  buildBrowseChannelRows,
  resolveBrowseChannelSelection,
  type BrowseChannelRow,
  type BrowseChannelSubscriptionFilter,
} from "./create-chat-browse-channels.lib";
import { resolveNextTabFromKey, type CreateChatTab } from "./create-chat-dialog.lib";
import {
  createChannel,
  startDirectMessage,
  subscribeCurrentUserToStream,
  unarchiveChannel,
  unsubscribeChannel,
} from "./create-chat.api";

const log = createLogger("create-chat:dialog");

interface ArchivedChannelOption {
  streamUuid: string;
  name: string;
  lastMessage: string;
  time: string;
}

/** Inline unarchive error state on the Archived tab. */
export interface UnarchiveInlineErrorState {
  kind: "failed";
  message: string;
}

export interface UseCreateChatDialogResult {
  tab: CreateChatTab;
  setTab: (tab: CreateChatTab) => void;

  tabIds: Record<CreateChatTab, string>;
  panelIds: Record<CreateChatTab, string>;
  setTabRef: (tab: CreateChatTab, node: HTMLButtonElement | null) => void;
  onTabKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>, currentTab: CreateChatTab) => void;

  userSearch: string;
  setUserSearch: (v: string) => void;
  filteredUsers: UserPickerOption[];
  userPickerEmptyLabelKey: string;

  channelSelectedUserIds: Set<UserId>;
  toggleChannelUser: (userId: UserId) => void;
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

  archivedSearch: string;
  setArchivedSearch: (v: string) => void;
  archivedChannels: ArchivedChannelOption[];
  /** Async unarchive; on success the channel drops from the list after store refresh. */
  onUnarchiveArchivedChannel: (streamUuid: string) => Promise<void>;
  /** Stream ids with in-flight unarchive (button shows loading). */
  unarchivePendingStreamUuids: readonly string[];
  unarchiveInlineError: UnarchiveInlineErrorState | null;

  channelsSearch: string;
  setChannelsSearch: (v: string) => void;
  channelsSubscriptionFilter: BrowseChannelSubscriptionFilter;
  setChannelsSubscriptionFilter: (filter: BrowseChannelSubscriptionFilter) => void;
  browseChannels: BrowseChannelRow[];
  selectedBrowseChannelUuid: string | null;
  setSelectedBrowseChannelUuid: (streamUuid: string) => void;
  selectedBrowseChannel: BrowseChannelRow | null;
  channelsLoading: boolean;
  channelsError: boolean;
  onSubscribeToChannel: (streamUuid: string, streamName: string) => Promise<void>;
  onUnsubscribeFromChannel: (streamUuid: string, streamName: string) => Promise<void>;
  subscribePendingStreamUuids: readonly string[];
  subscribeInlineError: string | null;

  startingDmUserId: UserId | null;
  onStartDirectMessage: (userId: UserId, fullName: string) => Promise<void>;
}

export function useCreateChatDialog(options: {
  open: boolean;
  onNavigateStream: (streamUuid: string, streamName: string) => void;
  onChannelCreated: () => void;
}): UseCreateChatDialogResult {
  const { open, onChannelCreated, onNavigateStream } = options;

  const [tab, setTab] = useState<CreateChatTab>("dm");
  const tabBaseId = useId();
  const tabRefs = useRef<Record<CreateChatTab, HTMLButtonElement | null>>({
    dm: null,
    channels: null,
    channel: null,
    archived: null,
  });

  const tabIds: Record<CreateChatTab, string> = useMemo(
    () => ({
      dm: `${tabBaseId}-tab-dm`,
      channels: `${tabBaseId}-tab-channels`,
      channel: `${tabBaseId}-tab-channel`,
      archived: `${tabBaseId}-tab-archived`,
    }),
    [tabBaseId],
  );
  const panelIds: Record<CreateChatTab, string> = useMemo(
    () => ({
      dm: `${tabBaseId}-panel-dm`,
      channels: `${tabBaseId}-panel-channels`,
      channel: `${tabBaseId}-panel-channel`,
      archived: `${tabBaseId}-panel-archived`,
    }),
    [tabBaseId],
  );

  const [userSearch, setUserSearch] = useState("");
  const [archivedSearch, setArchivedSearch] = useState("");
  const [channelSelectedUserIds, setChannelSelectedUserIds] = useState<Set<UserId>>(new Set());
  const [channelName, setChannelName] = useState("");
  const [channelDesc, setChannelDesc] = useState("");
  const [channelInviteOnly, setChannelInviteOnly] = useState(false);
  const [channelAnnounce, setChannelAnnounce] = useState(false);
  const [channelAnnouncementOnly, setChannelAnnouncementOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const [startingDmUserId, setStartingDmUserId] = useState<UserId | null>(null);
  const [unarchiveInlineError, setUnarchiveInlineError] =
    useState<UnarchiveInlineErrorState | null>(null);
  const [unarchivePendingStreamUuids, setUnarchivePendingStreamUuids] = useState<string[]>([]);
  const [channelsSearch, setChannelsSearch] = useState("");
  const [channelsSubscriptionFilter, setChannelsSubscriptionFilter] =
    useState<BrowseChannelSubscriptionFilter>("unsubscribed");
  const [browseStreams, setBrowseStreams] = useState<MockStream[]>([]);
  const [browseSubscriptions, setBrowseSubscriptions] = useState<MessengerSubscription[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channelsError, setChannelsError] = useState(false);
  const [subscribePendingStreamUuids, setSubscribePendingStreamUuids] = useState<string[]>([]);
  const [subscribeInlineError, setSubscribeInlineError] = useState<string | null>(null);
  const [selectedBrowseChannelUuid, setSelectedBrowseChannelUuidState] = useState<string | null>(
    null,
  );
  const channelsFetchedRef = useRef(false);

  const allUsers = useUsersStore((s) => s.users);
  const userGroups = useUserGroupsStore((s) => s.groups);
  const currentUserId = useChatListStore((s) => s.currentUserId ?? null);
  const streamsMap = useChatListStore((s) => s.streamsMap);
  const channelCreateBlocked = false;
  const channelCreateBlockedReasonKey = null;
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

  const excludedUserIds = useMemo(
    () => (currentUserId != null ? [currentUserId] : []),
    [currentUserId],
  );

  const filteredUsers = useMemo(
    () =>
      buildUserPickerOptions({
        candidates: pickerCandidates,
        selectedUserIds: [],
        excludedUserIds,
        query: userSearch,
      }),
    [pickerCandidates, excludedUserIds, userSearch],
  );

  const userPickerEmptyLabelKey = useMemo(
    () =>
      resolveUserPickerEmptyLabelKey({
        candidateCount: pickerCandidates.length,
        visibleCount: filteredUsers.length,
        query: userSearch,
        excludesCurrentUser: excludedUserIds.length > 0,
      }),
    [pickerCandidates.length, filteredUsers.length, userSearch, excludedUserIds.length],
  );

  const channelUsers = useMemo(
    () =>
      buildUserPickerOptions({
        candidates: pickerCandidates,
        selectedUserIds: Array.from(channelSelectedUserIds),
        excludedUserIds,
        query: userSearch,
      }),
    [pickerCandidates, channelSelectedUserIds, excludedUserIds, userSearch],
  );

  const archivedChannels = useMemo<ArchivedChannelOption[]>(() => {
    const normalizedQuery = archivedSearch.trim().toLowerCase();
    const archived = Array.from(streamsMap.values())
      .filter((stream) => stream.isArchived === true)
      .map((stream) => ({
        streamUuid: stream.streamUuid,
        name: stream.name,
        lastMessage: stream.lastMessage,
        time: stream.time,
        ts: stream.ts,
      }))
      .sort((left, right) => right.ts - left.ts)
      .filter((stream) => stream.name.toLowerCase().includes(normalizedQuery))
      .map((stream) => ({
        streamUuid: stream.streamUuid,
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
    () =>
      browseChannels.find((channel) => channel.streamUuid === selectedBrowseChannelUuid) ?? null,
    [browseChannels, selectedBrowseChannelUuid],
  );

  const setSelectedBrowseChannelUuid = useCallback((streamUuid: string) => {
    setSelectedBrowseChannelUuidState(streamUuid);
  }, []);

  useEffect(() => {
    setSelectedBrowseChannelUuidState((currentUuid) =>
      resolveBrowseChannelSelection(browseChannels, currentUuid),
    );
  }, [browseChannels]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const members = await fetchUsers();
        if (cancelled || members.length === 0) {
          return;
        }
        useUsersStore.getState().mergeUsers(members);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn("create-chat: user directory refresh failed", { error: message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

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
      setChannelSelectedUserIds(new Set());
      setChannelName("");
      setChannelDesc("");
      setChannelInviteOnly(false);
      setChannelAnnounce(false);
      setChannelAnnouncementOnly(false);
      setCreating(false);
      setUnarchiveInlineError(null);
      setUnarchivePendingStreamUuids([]);
      setChannelsSearch("");
      setBrowseStreams([]);
      setBrowseSubscriptions([]);
      channelsFetchedRef.current = false;
      setChannelsLoading(false);
      setChannelsError(false);
      setSubscribePendingStreamUuids([]);
      setSubscribeInlineError(null);
      setSelectedBrowseChannelUuidState(null);
    });
  }, [open]);

  const toggleChannelUser = useCallback((userId: UserId) => {
    setChannelSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const focusTab = useCallback((nextTab: CreateChatTab) => {
    tabRefs.current[nextTab]?.focus();
  }, []);

  // Encapsulate tab ref mutation inside the hook.
  const setTabRef = useCallback((tab: CreateChatTab, node: HTMLButtonElement | null) => {
    tabRefs.current[tab] = node;
  }, []);

  const onTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, currentTab: CreateChatTab) => {
      const nextTab = resolveNextTabFromKey({ key: event.key, currentTab });
      if (nextTab == null) return;
      event.preventDefault();
      setTab(nextTab);
      focusTab(nextTab);
    },
    [focusTab],
  );

  const createChannelAction = useCallback(() => {
    if (!channelName.trim() || creating) return;
    const subscribers = Array.from(channelSelectedUserIds)
      .filter((userId) => currentUserId == null || !userIdsEqual(userId, currentUserId))
      .sort(compareUserIds);
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
        setChannelSelectedUserIds(new Set());
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
    channelSelectedUserIds,
    channelInviteOnly,
    channelAnnounce,
    effectiveChannelAnnouncementOnly,
    announcementOnlyCanSendMessageGroup,
    creating,
    currentUserId,
    onChannelCreated,
  ]);

  const onStartDirectMessage = useCallback(
    async (userId: UserId, fullName: string) => {
      if (startingDmUserId != null) {
        return;
      }
      setStartingDmUserId(userId);
      try {
        const result = await startDirectMessage(userId, fullName);
        if (result == null) {
          log.warn("create-chat: direct message start failed");
          return;
        }
        useChatListStore.getState().upsertStreamMetadataRows([
          {
            streamUuid: result.streamUuid,
            private: true,
            name: result.name,
          },
        ]);
        onNavigateStream(result.streamUuid, result.name);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error("create-chat: direct message start threw", { error: message });
      } finally {
        setStartingDmUserId(null);
      }
    },
    [onNavigateStream, startingDmUserId],
  );

  const onUnarchiveArchivedChannel = useCallback(async (streamUuid: string) => {
    setUnarchiveInlineError(null);
    setUnarchivePendingStreamUuids((prev) =>
      prev.includes(streamUuid) ? prev : [...prev, streamUuid],
    );
    try {
      const result = await unarchiveChannel(streamUuid);
      if (result.ok) {
        return;
      }
      setUnarchiveInlineError({ kind: "failed", message: result.message });
      log.warn("unarchive channel rejected", {
        streamUuid,
        kind: result.kind,
        status: result.status,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setUnarchiveInlineError({ kind: "failed", message });
      log.error("unarchive channel threw", { streamUuid, error: message });
    } finally {
      setUnarchivePendingStreamUuids((prev) => prev.filter((id) => id !== streamUuid));
    }
  }, []);

  const onSubscribeToChannel = useCallback(
    async (streamUuid: string, streamName: string) => {
      if (currentUserId == null || !isUserIdentityReady(currentUserId)) {
        return;
      }
      setSubscribeInlineError(null);
      setSubscribePendingStreamUuids((prev) =>
        prev.includes(streamUuid) ? prev : [...prev, streamUuid],
      );
      try {
        const result = await subscribeCurrentUserToStream(streamName, currentUserId);
        if (!result.ok) {
          setSubscribeInlineError(result.errorCode ?? "unknown_error");
          log.warn("subscribe to channel rejected", { streamUuid, errorCode: result.errorCode });
          return;
        }
        useChatListStore.getState().upsertStreamMetadataRows([{ streamUuid, name: streamName }]);
        setBrowseSubscriptions((prev) => {
          if (prev.some((subscription) => subscription.stream_uuid === streamUuid)) {
            return prev;
          }
          return [
            ...prev,
            {
              stream_uuid: streamUuid,
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
        log.error("subscribe to channel threw", { streamUuid, error: message });
      } finally {
        setSubscribePendingStreamUuids((prev) => prev.filter((id) => id !== streamUuid));
      }
    },
    [currentUserId],
  );

  const onUnsubscribeFromChannel = useCallback(async (streamUuid: string, streamName: string) => {
    setSubscribeInlineError(null);
    setSubscribePendingStreamUuids((prev) =>
      prev.includes(streamUuid) ? prev : [...prev, streamUuid],
    );
    try {
      const ok = await unsubscribeChannel(streamName);
      if (!ok) {
        setSubscribeInlineError("unsubscribe_failed");
        log.warn("unsubscribe from channel rejected", { streamUuid });
        return;
      }
      useChatListStore.getState().removeStream(streamUuid);
      setBrowseSubscriptions((prev) =>
        prev.filter((subscription) => subscription.stream_uuid !== streamUuid),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSubscribeInlineError(message);
      log.error("unsubscribe from channel threw", { streamUuid, error: message });
    } finally {
      setSubscribePendingStreamUuids((prev) => prev.filter((id) => id !== streamUuid));
    }
  }, []);

  return {
    tab,
    setTab,
    tabIds,
    panelIds,
    setTabRef,
    onTabKeyDown,
    userSearch,
    setUserSearch,
    filteredUsers,
    userPickerEmptyLabelKey,
    channelSelectedUserIds,
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
    archivedSearch,
    setArchivedSearch,
    archivedChannels,
    onUnarchiveArchivedChannel,
    unarchivePendingStreamUuids,
    unarchiveInlineError,
    channelsSearch,
    setChannelsSearch,
    channelsSubscriptionFilter,
    setChannelsSubscriptionFilter,
    browseChannels,
    selectedBrowseChannelUuid,
    setSelectedBrowseChannelUuid,
    selectedBrowseChannel,
    channelsLoading,
    channelsError,
    onSubscribeToChannel,
    onUnsubscribeFromChannel,
    subscribePendingStreamUuids,
    subscribeInlineError,
    startingDmUserId,
    onStartDirectMessage,
  };
}
