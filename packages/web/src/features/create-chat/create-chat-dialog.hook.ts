import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { formatUserStatusLabel } from "~/entities/user/user-status.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { useUserGroupsStore } from "~/entities/user-group/user-group.model";
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
import { buildDmSlug, resolveNextTabFromKey, type CreateChatTab } from "./create-chat-dialog.lib";
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

/** Inline unarchive error state on the Archived tab. */
export type UnarchiveInlineErrorState =
  | { kind: "unsupported" }
  | { kind: "failed"; message: string };

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

  groupSelectedUserIds: Set<number>;
  toggleGroupUser: (userId: number) => void;
  groupUsers: UseCreateChatDialogResult["filteredUsers"];
  createGroup: () => void;

  channelSelectedUserIds: Set<number>;
  toggleChannelUser: (userId: number) => void;
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
  onNavigateDm: (slug: string) => void;
  onNavigateStream: (streamId: number, streamName: string) => void;
  onChannelCreated: () => void;
}): UseCreateChatDialogResult {
  const { open, onNavigateDm, onChannelCreated } = options;

  const [tab, setTab] = useState<CreateChatTab>("dm");
  const tabBaseId = useId();
  const tabRefs = useRef<Record<CreateChatTab, HTMLButtonElement | null>>({
    dm: null,
    group: null,
    channels: null,
    channel: null,
    archived: null,
  });

  const tabIds: Record<CreateChatTab, string> = useMemo(
    () => ({
      dm: `${tabBaseId}-tab-dm`,
      group: `${tabBaseId}-tab-group`,
      channels: `${tabBaseId}-tab-channels`,
      channel: `${tabBaseId}-tab-channel`,
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
      archived: `${tabBaseId}-panel-archived`,
    }),
    [tabBaseId],
  );

  const [userSearch, setUserSearch] = useState("");
  const [archivedSearch, setArchivedSearch] = useState("");
  const [groupSelectedUserIds, setGroupSelectedUserIds] = useState<Set<number>>(new Set());
  const [channelSelectedUserIds, setChannelSelectedUserIds] = useState<Set<number>>(new Set());
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
  const channelsFetchedRef = useRef(false);

  const allUsers = useUsersStore((s) => s.users);
  const userGroups = useUserGroupsStore((s) => s.groups);
  const currentUserId = useChatListStore((s) => s.currentUserId ?? null);
  const streamsMap = useChatListStore((s) => s.streamsMap);
  // Block channel create until author profile is loaded.
  const channelCreateBlocked = currentUserId == null || currentUserId <= 0;
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

  const groupUsers = useMemo(
    () =>
      buildUserPickerOptions({
        candidates: pickerCandidates,
        selectedUserIds: Array.from(groupSelectedUserIds),
        excludedUserIds,
        query: userSearch,
      }),
    [pickerCandidates, groupSelectedUserIds, excludedUserIds, userSearch],
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
      setGroupSelectedUserIds(new Set());
      setChannelSelectedUserIds(new Set());
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
    });
  }, [open]);

  const toggleGroupUser = useCallback((userId: number) => {
    setGroupSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const toggleChannelUser = useCallback((userId: number) => {
    setChannelSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const createGroup = useCallback(() => {
    if (groupSelectedUserIds.size === 0 || currentUserId == null) return;
    const ids = [...groupSelectedUserIds, currentUserId].sort((a, b) => a - b);
    onNavigateDm(ids.join(","));
    setGroupSelectedUserIds(new Set());
  }, [groupSelectedUserIds, currentUserId, onNavigateDm]);

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
    if (!channelName.trim() || creating || currentUserId == null || currentUserId <= 0) return;
    // Always include channel author in subscribers even if not manually selected.
    const subscribers = Array.from(new Set([...channelSelectedUserIds, currentUserId])).sort(
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
    tabIds,
    panelIds,
    setTabRef,
    onTabKeyDown,
    userSearch,
    setUserSearch,
    filteredUsers,
    groupSelectedUserIds,
    toggleGroupUser,
    groupUsers,
    createGroup,
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
