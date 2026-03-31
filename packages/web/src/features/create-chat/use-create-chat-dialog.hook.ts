import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useUsersStore } from "~/entities/user/user.model";
import { formatUserStatusLabel } from "~/entities/user/user-status.lib";
import { getPresenceState } from "~/shared/lib/format";
import { createChannel } from "./create-chat.api";
import {
  buildDmSlug,
  getCreateChatTabs,
  resolveNextTabFromKey,
  type CreateChatTab,
} from "./create-chat-dialog.lib";

export interface UseCreateChatDialogResult {
  tab: CreateChatTab;
  setTab: (tab: CreateChatTab) => void;

  tabIds: Record<CreateChatTab, string>;
  panelIds: Record<CreateChatTab, string>;
  tabRefs: React.MutableRefObject<Record<CreateChatTab, HTMLButtonElement | null>>;
  onTabKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>, currentTab: CreateChatTab) => void;

  userSearch: string;
  setUserSearch: (v: string) => void;
  filteredUsers: Array<{
    user_id: number;
    full_name: string;
    email?: string | undefined;
  }>;

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
  creating: boolean;
  createChannel: () => void;

  resolvePresenceState: (userId: number) => ReturnType<typeof getPresenceState> | null;
  resolveStatusLabel: (userId: number) => string | null;

  buildDmSlug: (userId: number, fullName: string) => string;
}

export function useCreateChatDialog(options: {
  open: boolean;
  onNavigateDm: (slug: string) => void;
  onChannelCreated: () => void;
}): UseCreateChatDialogResult {
  const { open, onNavigateDm, onChannelCreated } = options;

  const [tab, setTab] = useState<CreateChatTab>("dm");
  const tabBaseId = useId();
  const tabRefs = useRef<Record<CreateChatTab, HTMLButtonElement | null>>({
    dm: null,
    group: null,
    channel: null,
  });

  const tabs = getCreateChatTabs();
  const tabIds: Record<CreateChatTab, string> = useMemo(
    () => ({
      dm: `${tabBaseId}-tab-dm`,
      group: `${tabBaseId}-tab-group`,
      channel: `${tabBaseId}-tab-channel`,
    }),
    [tabBaseId],
  );
  const panelIds: Record<CreateChatTab, string> = useMemo(
    () => ({
      dm: `${tabBaseId}-panel-dm`,
      group: `${tabBaseId}-panel-group`,
      channel: `${tabBaseId}-panel-channel`,
    }),
    [tabBaseId],
  );

  const [userSearch, setUserSearch] = useState("");
  const [groupSelectedUserIds, setGroupSelectedUserIds] = useState<Set<number>>(new Set());
  const [channelSelectedUserIds, setChannelSelectedUserIds] = useState<Set<number>>(new Set());
  const [channelName, setChannelName] = useState("");
  const [channelDesc, setChannelDesc] = useState("");
  const [channelInviteOnly, setChannelInviteOnly] = useState(false);
  const [channelAnnounce, setChannelAnnounce] = useState(false);
  const [creating, setCreating] = useState(false);

  const allUsers = useUsersStore((s) => s.users);
  const currentUserId = useChatListStore((s) => s.currentUserId ?? null);

  const filteredUsers = useMemo(() => {
    const list = Array.from(allUsers.values()).filter((u) => u.user_id !== currentUserId);
    const q = userSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (u) => u.full_name.toLowerCase().includes(q) || (u.email?.toLowerCase().includes(q) ?? false),
    );
  }, [allUsers, userSearch, currentUserId]);

  const resolvePresenceState = useCallback(
    (userId: number) => {
      const presence = allUsers.get(userId)?.presence;
      return presence != null ? getPresenceState(presence.timestamp, presence.status) : null;
    },
    [allUsers],
  );

  const resolveStatusLabel = useCallback(
    (userId: number) => formatUserStatusLabel(allUsers.get(userId)?.status),
    [allUsers],
  );

  const groupUsers = useMemo(() => {
    return [
      ...filteredUsers.filter((u) => groupSelectedUserIds.has(u.user_id)),
      ...filteredUsers.filter((u) => !groupSelectedUserIds.has(u.user_id)),
    ];
  }, [filteredUsers, groupSelectedUserIds]);

  const channelUsers = useMemo(() => {
    return [
      ...filteredUsers.filter((u) => channelSelectedUserIds.has(u.user_id)),
      ...filteredUsers.filter((u) => !channelSelectedUserIds.has(u.user_id)),
    ];
  }, [filteredUsers, channelSelectedUserIds]);

  useEffect(() => {
    if (open) return;
    void Promise.resolve().then(() => {
      setTab("dm");
      setUserSearch("");
      setGroupSelectedUserIds(new Set());
      setChannelSelectedUserIds(new Set());
      setChannelName("");
      setChannelDesc("");
      setChannelInviteOnly(false);
      setChannelAnnounce(false);
      setCreating(false);
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
    setCreating(true);
    createChannel({
      name: channelName.trim(),
      description: channelDesc.trim(),
      subscribers: Array.from(channelSelectedUserIds).sort((a, b) => a - b),
      inviteOnly: channelInviteOnly,
      announce: channelAnnounce,
    })
      .then((result) => {
        if (!result) return;
        setChannelName("");
        setChannelDesc("");
        setChannelSelectedUserIds(new Set());
        setChannelInviteOnly(false);
        setChannelAnnounce(false);
        onChannelCreated();
      })
      .catch(() => {})
      .finally(() => setCreating(false));
  }, [
    channelName,
    channelDesc,
    channelSelectedUserIds,
    channelInviteOnly,
    channelAnnounce,
    creating,
    onChannelCreated,
  ]);

  const buildDmSlugFn = useCallback((userId: number, fullName: string) => {
    return buildDmSlug(userId, fullName);
  }, []);

  // Ensure we don't capture stale tab value if we later use tabs
  void tabs;

  return {
    tab,
    setTab,
    tabIds,
    panelIds,
    tabRefs,
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
    creating,
    createChannel: createChannelAction,
    resolvePresenceState,
    resolveStatusLabel,
    buildDmSlug: buildDmSlugFn,
  };
}

