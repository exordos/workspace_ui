import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { formatUserStatusLabel } from "~/entities/user/user-status.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { useUserGroupsStore } from "~/entities/user-group/user-group.model";
import { buildAnnouncementOnlyCanSendGroup } from "~/shared/lib/user-group-policy";
import { buildUserPickerOptions, type UserPickerOption } from "~/shared/lib/user-picker";
import { buildDmSlug, resolveNextTabFromKey, type CreateChatTab } from "./create-chat-dialog.lib";
import { createChannel } from "./create-chat.api";

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
  const [channelAnnouncementOnly, setChannelAnnouncementOnly] = useState(false);
  const [creating, setCreating] = useState(false);

  const allUsers = useUsersStore((s) => s.users);
  const userGroups = useUserGroupsStore((s) => s.groups);
  const currentUserId = useChatListStore((s) => s.currentUserId ?? null);
  // Инвариант: пока профиль автора не загружен, создание канала недоступно.
  const channelCreateBlocked = currentUserId == null || currentUserId <= 0;
  const channelCreateBlockedReasonKey = channelCreateBlocked
    ? "channel.creatorProfileLoading"
    : null;
  // Дефолтная policy для announcement-only канала.
  const announcementOnlyCanSendMessageGroup = useMemo(
    () => buildAnnouncementOnlyCanSendGroup({ userGroups, currentUserId }),
    [userGroups, currentUserId],
  );
  // Без валидной policy блокируем переключатель announcement-only.
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
      setChannelAnnouncementOnly(false);
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

  // Что делает: инкапсулирует мутацию ref внутри хука, чтобы UI не мутировал результат hook напрямую.
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
    // Что делает: всегда включаем автора канала в principals,
    // даже если он не выбран вручную в списке участников.
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
          // Передаем policy только при явном включении и валидном group-setting.
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
        // Ошибка уже логируется в API-слое; здесь не даем упасть UI-обработчику.
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
    buildDmSlug: buildDmSlugFn,
  };
}
