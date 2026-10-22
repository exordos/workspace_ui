import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { MessengerChannelCreationError } from "~/entities/messenger/chat-initial-key-bootstrap.lib";
import {
  runWorkspaceChannelCreate,
  runWorkspaceDirectStreamCreate,
} from "~/entities/messenger/messenger-create-chat-actions.lib";
import type { EncryptedChannelCreationAttempt } from "~/entities/messenger/messenger-create-chat-actions.lib";
import {
  runWorkspaceCreateTopicRequest,
  runWorkspaceStreamUnarchive,
} from "~/entities/messenger/messenger-sidebar-actions.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerStream } from "~/entities/messenger/messenger.types";
import {
  selectSelectableWorkspaceUsers,
  selectUserDisplayName,
} from "~/entities/user/user-selectors.lib";
import { useUsersStore } from "~/entities/user/user.model";
import type { User } from "~/entities/user/user.types";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestContextCurrent,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeRequestContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { createLogger } from "~/shared/lib/logger";
import {
  matchesUserPickerQuery,
  toggleUserPickerSelection,
  type UserPickerOption,
} from "~/shared/lib/user-picker";
import {
  CREATE_CHAT_TABS,
  resolveNextTabFromKey,
  type CreateChatTab,
} from "./create-chat-dialog.lib";

const log = createLogger("create-chat:dialog");

const EMPTY_BROWSE_CHANNELS: [] = [];

export type BrowseChannelSubscriptionFilter = "unsubscribed" | "subscribed" | "all";

function resolveWorkspacePickerPresence(status: User["status"]): UserPickerOption["presence"] {
  if (status === "active" || status === "idle") {
    return status;
  }
  return "offline";
}

export interface ArchivedChatOption {
  streamUuid: string;
  name: string;
  isDirect: boolean;
}

export interface CreateChatUserOption extends UserPickerOption<string> {
  userKey: string;
  workspaceUserUuid: string | null;
}

export interface CreateChatWorkspaceStreamOption {
  streamUuid: string;
  name: string;
}

export interface UnarchiveInlineErrorState {
  streamUuid: string;
}

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
  channelEncryption: boolean;
  setChannelEncryption: (v: boolean) => void;
  channelCreateErrorKey: string | null;
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
  archivedChats: ArchivedChatOption[];
  archivedLoading: boolean;
  archivedError: boolean;
  openArchivedChat: (streamUuid: string) => void;
  onUnarchiveArchivedChat: (streamUuid: string) => Promise<void>;
  unarchivePendingStreamUuids: readonly string[];
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
  onNavigateWorkspaceStream?: (streamUuid: string, encryption?: boolean) => void;
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
  const [channelEncryption, setChannelEncryptionState] = useState(false);
  const [channelCreateErrorKey, setChannelCreateErrorKey] = useState<string | null>(null);
  const setChannelEncryption = useCallback((encrypted: boolean) => {
    setChannelEncryptionState(encrypted);
    setChannelCreateErrorKey(null);
    if (encrypted) {
      setChannelInviteOnly(false);
      setChannelAnnounce(false);
      setChannelAnnouncementOnly(false);
    }
  }, []);
  const [otherCreating, setCreating] = useState(false);
  // One context object identifies the operation; state is its render snapshot.
  const channelCreationRef = useRef<WorkspaceRuntimeRequestContext | null>(null);
  const [channelCreation, setChannelCreation] = useState<WorkspaceRuntimeRequestContext | null>(
    null,
  );
  const encryptedCreationAttempts = useRef(
    new Map<
      string,
      {
        attempt: EncryptedChannelCreationAttempt;
        name: string;
        description: string;
        selectedUserKeys: Set<string>;
      }
    >(),
  );
  const [channelsSearch, setChannelsSearch] = useState("");
  const [channelsSubscriptionFilter, setChannelsSubscriptionFilter] =
    useState<BrowseChannelSubscriptionFilter>("unsubscribed");
  const [selectedBrowseChannelId, setSelectedBrowseChannelIdState] = useState<number | null>(null);
  const [workspaceTopicStreamUuid, setWorkspaceTopicStreamUuid] = useState("");
  const [workspaceTopicName, setWorkspaceTopicName] = useState("");

  const [unarchivePending, setUnarchivePending] = useState<readonly string[]>([]);
  const [unarchiveInlineError, setUnarchiveInlineError] =
    useState<UnarchiveInlineErrorState | null>(null);
  const archiveScopeRef = useRef<object | null>(null);
  const unarchiveRequestsRef = useRef(new Map<string, object>());

  const usersOwnerKey = useUsersStore((s) => s.ownerKey);
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
  const channelOwnerKey = workspaceRuntimeContext
    ? workspaceRuntimeOwnerKey(workspaceRuntimeContext)
    : null;
  // An old runtime's request does not block creation in the current runtime.
  const creating =
    otherCreating ||
    (channelCreation != null &&
      isWorkspaceRuntimeRequestContextCurrent(channelCreation, () => workspaceRuntimeContext));
  const messengerOwnerKey = useMessengerStore((state) => state.ownerKey);
  const messengerLoading = useMessengerStore((state) => state.isLoading);
  const messengerError = useMessengerStore((state) => state.error);
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
    const currentUserUuid = workspaceRuntimeContext?.userUuid ?? null;
    return selectSelectableWorkspaceUsers(usersById, userIds)
      .filter((user) => user.uuid !== currentUserUuid)
      .map((user) => ({
        userId: user.uuid,
        userKey: user.uuid,
        username: user.username,
        isDisabled: false,
        workspaceUserUuid: user.uuid,
        fullName: selectUserDisplayName(user, user.uuid),
        email: user.email ?? "",
        presence: resolveWorkspacePickerPresence(user.status),
        statusLabel: user.statusText,
      }))
      .sort((left, right) => left.fullName.localeCompare(right.fullName));
  }, [userIds, usersById, workspaceRuntimeContext?.userUuid]);

  const filteredUsers = useMemo(
    () => workspaceUserOptions.filter((user) => matchesUserPickerQuery(user, userSearch)),
    [workspaceUserOptions, userSearch],
  );
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
  const archivedChats = useMemo<ArchivedChatOption[]>(() => {
    if (workspaceRuntimeContext == null || messengerOwnerKey !== channelOwnerKey) return [];
    const query = archivedSearch.trim().toLocaleLowerCase();
    return workspaceStreams
      .filter(
        (stream) =>
          stream.isArchived &&
          stream.projectId === workspaceRuntimeContext.projectId &&
          stream.userUuid === workspaceRuntimeContext.userUuid,
      )
      .map((stream) => {
        const directUser =
          usersOwnerKey === channelOwnerKey && stream.directUserUuid != null
            ? usersById[stream.directUserUuid]
            : undefined;
        return {
          streamUuid: stream.uuid,
          name: directUser ? selectUserDisplayName(directUser, stream.name) : stream.name,
          isDirect: stream.directUserUuid != null,
        };
      })
      .filter((chat) => chat.name.toLocaleLowerCase().includes(query))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [
    archivedSearch,
    channelOwnerKey,
    messengerOwnerKey,
    usersById,
    usersOwnerKey,
    workspaceRuntimeContext,
    workspaceStreams,
  ]);
  const archivedLoading =
    workspaceRuntimeContext != null && (messengerOwnerKey !== channelOwnerKey || messengerLoading);
  const archivedError = messengerOwnerKey === channelOwnerKey && messengerError != null;

  useEffect(() => {
    const scope = {};
    archiveScopeRef.current = open ? scope : null;
    unarchiveRequestsRef.current.clear();
    void Promise.resolve().then(() => {
      if (archiveScopeRef.current !== scope) return;
      setUnarchivePending([...unarchiveRequestsRef.current.keys()]);
      if (unarchiveRequestsRef.current.size === 0) setUnarchiveInlineError(null);
    });
    return () => {
      if (archiveScopeRef.current === scope) archiveScopeRef.current = null;
    };
  }, [open, channelOwnerKey, workspaceRuntimeContext?.runtimeGeneration]);

  const openArchivedChat = useCallback(
    (streamUuid: string) => {
      if (!open || !archivedChats.some((chat) => chat.streamUuid === streamUuid)) return;
      const requestContext = captureWorkspaceRuntimeRequestContext(() => workspaceRuntimeContext);
      if (
        requestContext == null ||
        !isWorkspaceRuntimeRequestContextCurrent(requestContext, () =>
          useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
        )
      )
        return;
      onNavigateWorkspaceStream?.(streamUuid);
    },
    [archivedChats, onNavigateWorkspaceStream, open, workspaceRuntimeContext],
  );

  const onUnarchiveArchivedChat = useCallback(
    async (streamUuid: string) => {
      const scope = archiveScopeRef.current;
      if (
        !open ||
        scope == null ||
        unarchiveRequestsRef.current.has(streamUuid) ||
        !archivedChats.some((chat) => chat.streamUuid === streamUuid)
      )
        return;
      const requestContext = captureWorkspaceRuntimeRequestContext(() => workspaceRuntimeContext);
      if (
        requestContext == null ||
        !isWorkspaceRuntimeRequestContextCurrent(requestContext, () =>
          useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
        )
      )
        return;
      const isCurrent = () =>
        archiveScopeRef.current === scope &&
        unarchiveRequestsRef.current.get(streamUuid) === scope &&
        isWorkspaceRuntimeRequestContextCurrent(requestContext, () =>
          useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
        );
      unarchiveRequestsRef.current.set(streamUuid, scope);
      setUnarchivePending([...unarchiveRequestsRef.current.keys()]);
      setUnarchiveInlineError(null);
      try {
        const result = await runWorkspaceStreamUnarchive({ streamUuid });
        if (result.status !== "applied" && isCurrent()) {
          setUnarchiveInlineError({ streamUuid });
        }
      } catch {
        if (isCurrent()) setUnarchiveInlineError({ streamUuid });
      } finally {
        if (isCurrent()) {
          unarchiveRequestsRef.current.delete(streamUuid);
          setUnarchivePending((pending) => pending.filter((uuid) => uuid !== streamUuid));
        }
      }
    },
    [archivedChats, open, workspaceRuntimeContext],
  );

  const selectedWorkspaceTopicStreamUuid = workspaceTopicStreams.some(
    (stream) => stream.streamUuid === workspaceTopicStreamUuid,
  )
    ? workspaceTopicStreamUuid
    : (workspaceTopicStreams[0]?.streamUuid ?? "");

  const workspaceTopicCreateBlocked =
    selectedWorkspaceTopicStreamUuid.trim().length === 0 || !workspaceTopicName.trim();

  useEffect(() => {
    const unresolved = channelOwnerKey
      ? encryptedCreationAttempts.current.get(channelOwnerKey)
      : undefined;
    if (unresolved) {
      let active = true;
      if (open) {
        void Promise.resolve().then(() => {
          if (!active) return;
          setChannelName(unresolved.name);
          setChannelDesc(unresolved.description);
          setChannelSelectedUserKeys(new Set(unresolved.selectedUserKeys));
          setChannelEncryptionState(true);
        });
      }
      return () => {
        active = false;
      };
    }
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
      setChannelEncryptionState(false);
      setCreating(false);
      setChannelsSearch("");
      setChannelsSubscriptionFilter("unsubscribed");
      setSelectedBrowseChannelIdState(null);
      setWorkspaceTopicStreamUuid("");
      setWorkspaceTopicName("");
    });
  }, [channelOwnerKey, open, visibleTabs]);

  useEffect(() => {
    if (visibleTabs.includes(tab)) return;
    setTabState(visibleTabs[0] ?? "dm");
  }, [tab, visibleTabs]);

  const toggleChannelUser = useCallback((userKey: string) => {
    setChannelSelectedUserKeys(
      (prev) => new Set(toggleUserPickerSelection(Array.from(prev), userKey)),
    );
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
    if (
      !channelName.trim() ||
      creating ||
      (channelCreationRef.current &&
        isWorkspaceRuntimeRequestContextCurrent(channelCreationRef.current, () =>
          useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
        )) ||
      workspaceRuntimeContext == null
    )
      return;
    const requestContext = captureWorkspaceRuntimeRequestContext(() => workspaceRuntimeContext);
    if (
      requestContext == null ||
      !isWorkspaceRuntimeRequestContextCurrent(requestContext, () =>
        useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
      )
    )
      return;
    const ownerKey = workspaceRuntimeOwnerKey(workspaceRuntimeContext);
    let encryptedIntent = encryptedCreationAttempts.current.get(ownerKey);
    if (!channelEncryption && encryptedIntent) {
      if (
        encryptedIntent.attempt.state.phase === "dispatched" ||
        encryptedIntent.attempt.state.phase === "resolved" ||
        encryptedIntent.attempt.pending
      ) {
        setChannelCreateErrorKey("channel.creationUncertain");
        return;
      }
      encryptedCreationAttempts.current.delete(ownerKey);
      encryptedIntent = undefined;
    }
    const memberUserUuids = workspaceUserOptions
      .filter((user) => channelSelectedUserKeys.has(user.userKey))
      .map((user) => user.workspaceUserUuid)
      .filter((userUuid): userUuid is string => userUuid != null);

    if (channelEncryption && !encryptedIntent) {
      encryptedIntent = {
        attempt: { ownerKey: null, state: { phase: "idle" }, pending: false },
        name: channelName,
        description: channelDesc,
        selectedUserKeys: new Set(channelSelectedUserKeys),
      };
      encryptedCreationAttempts.current.set(ownerKey, encryptedIntent);
    }
    if (
      encryptedIntent &&
      (encryptedIntent.attempt.state.phase === "idle" ||
        encryptedIntent.attempt.state.phase === "prepared")
    ) {
      encryptedIntent.name = channelName;
      encryptedIntent.description = channelDesc;
      encryptedIntent.selectedUserKeys = new Set(channelSelectedUserKeys);
    }
    channelCreationRef.current = requestContext;
    setChannelCreateErrorKey(null);
    setChannelCreation(requestContext);
    void runWorkspaceChannelCreate({
      name: channelName.trim(),
      description: channelDesc.trim(),
      memberUserUuids,
      inviteOnly: channelEncryption ? false : channelInviteOnly,
      announce: channelEncryption ? false : channelAnnounce,
      ...(channelEncryption ? { encryption: true, creationAttempt: encryptedIntent?.attempt } : {}),
    })
      .then((result) => {
        if (
          channelCreationRef.current !== requestContext ||
          !isWorkspaceRuntimeRequestContextCurrent(requestContext, () =>
            useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
          )
        )
          return;
        if (result.status !== "applied") return;
        encryptedCreationAttempts.current.delete(ownerKey);
        setChannelName("");
        setChannelDesc("");
        setChannelSelectedUserKeys(new Set());
        setChannelInviteOnly(false);
        setChannelAnnounce(false);
        setChannelAnnouncementOnly(false);
        setChannelEncryptionState(false);
        if (channelEncryption) onNavigateWorkspaceStream?.(result.stream.uuid, true);
        else onNavigateWorkspaceStream?.(result.stream.uuid);
        onChannelCreated();
      })
      .catch((err) => {
        if (
          channelCreationRef.current !== requestContext ||
          !isWorkspaceRuntimeRequestContextCurrent(requestContext, () =>
            useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
          )
        )
          return;
        const encryptionErrorKey =
          err instanceof MessengerChannelCreationError
            ? {
                "encryption-unavailable": "channel.encryptionUnavailable",
                "encryption-mismatch": "channel.encryptionMismatch",
                "creation-uncertain": "channel.creationUncertain",
              }[err.reason]
            : null;
        setChannelCreateErrorKey(encryptionErrorKey ?? "channel.createFailed");
        log.error("workspace channel create failed", {
          reason: err instanceof MessengerChannelCreationError ? err.reason : "request-failed",
        });
      })
      .finally(() => {
        if (channelCreationRef.current !== requestContext) return;
        channelCreationRef.current = null;
        setChannelCreation(null);
      });
  }, [
    channelEncryption,
    channelAnnounce,
    channelDesc,
    channelInviteOnly,
    channelName,
    channelSelectedUserKeys,
    workspaceUserOptions,
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
    channelEncryption,
    setChannelEncryption,
    channelCreateErrorKey,
    channelInviteOnly,
    setChannelInviteOnly: (value) => setChannelInviteOnly(value && !channelEncryption),
    channelAnnounce,
    setChannelAnnounce: (value) => setChannelAnnounce(value && !channelEncryption),
    channelAnnouncementOnly: channelAnnouncementOnly && !channelAnnouncementOnlyBlocked,
    setChannelAnnouncementOnly: (value) => setChannelAnnouncementOnly(value && !channelEncryption),
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
    archivedChats,
    archivedLoading,
    archivedError,
    openArchivedChat,
    onUnarchiveArchivedChat,
    unarchivePendingStreamUuids: unarchivePending,
    unarchiveInlineError,
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
