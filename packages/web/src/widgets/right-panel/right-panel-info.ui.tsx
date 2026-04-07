import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import { ensureUserStatusLoaded } from "~/entities/user/api/user.api";
import { useUsersStore } from "~/entities/user/user.model";
import { formatUserStatusLabel } from "~/entities/user/user-status.lib";
import { useChatInfoStore } from "~/features/chat-info/chat-info.model";
import { muteStream, unmuteStream } from "~/features/mute-chat/mute-chat.api";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { t } from "~/i18n/i18n";
import { deleteStream, updateStream } from "~/shared/api/zulip-streams";
import { useRightDrawer } from "~/shared/contexts/right-drawer";
import { createLogger } from "~/shared/lib/logger";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { hasPermission, parseRole } from "~/shared/lib/roles";
import { Avatar } from "~/shared/ui/avatar";
import { Icon } from "~/shared/ui/icon";
import { PresenceIndicator } from "~/shared/ui/presence-indicator";
import { ScrollArea } from "~/shared/ui/scroll-area";

import { RightPanelDmGroup } from "./right-panel-dm-group.ui";
import { buildStreamSlug, resolveAvatarSrc } from "./right-panel.lib";
import type { RightPanelInfoProps } from "./right-panel.types";
import { RightPanelUser } from "./right-panel-user.ui";

const log = createLogger("right-panel");

export const RightPanelInfo: React.FC<RightPanelInfoProps> = ({
  title,
  participantsCount = 0,
  onlineCount = 0,
  user,
  onSelectCommonGroup,
  onOpenDirectMessage,
}) => {
  const navigate = useNavigate();
  const rightDrawer = useRightDrawer();
  const chatInfoData = useChatInfoStore((s) => s.data);
  const currentUserId = useChatListStore((s) => s.currentUserId);
  const currentUserRoleCode = useUsersStore((s) =>
    currentUserId != null ? s.getUser(currentUserId)?.role : undefined,
  );
  const users = useUsersStore((s) => s.users);
  const context = useCurrentChatMessagesStore((s) => s.context);
  const streamId = context?.type === "stream" ? context.streamId : null;
  const currentUserRole = parseRole(currentUserRoleCode);
  const canEditChannel = streamId != null && hasPermission(currentUserRole, "channel:edit");
  const canDeleteChannel = streamId != null && hasPermission(currentUserRole, "channel:delete");
  const isStreamMuted = useMuteStore((s) => (streamId ? s.isStreamMuted(streamId) : false));
  const [mutePending, setMutePending] = useState(false);
  const [muteError, setMuteError] = useState<string | null>(null);
  const [channelActionPending, setChannelActionPending] = useState(false);
  const [channelActionError, setChannelActionError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const handleToggleMute = useCallback(async () => {
    if (streamId == null || mutePending) return;

    setMutePending(true);
    setMuteError(null);
    try {
      if (isStreamMuted) {
        log.info("Unmuting stream from right panel", { streamId });
        const ok = await unmuteStream(streamId);
        if (ok) {
          useMuteStore.getState().unmuteStream(streamId);
        } else {
          setMuteError(t("app.error"));
        }
      } else {
        log.info("Muting stream from right panel", { streamId });
        const ok = await muteStream(streamId);
        if (ok) {
          useMuteStore.getState().muteStream(streamId);
        } else {
          setMuteError(t("app.error"));
        }
      }
    } finally {
      setMutePending(false);
    }
  }, [streamId, isStreamMuted, mutePending]);

  const handleOpenDirectMessage = useCallback(
    (userId: number) => {
      if (onOpenDirectMessage) {
        onOpenDirectMessage(userId);
        return;
      }
      void navigate(withCurrentOrgRoute(`/dm/${userId}`));
    },
    [navigate, onOpenDirectMessage],
  );
  const handleOpenUserProfile = useCallback(
    (userId: number) => {
      rightDrawer?.openUserProfile?.(userId);
    },
    [rightDrawer],
  );
  const memberStatusIds = useMemo(() => {
    if (chatInfoData?.type !== "dm" && chatInfoData?.type !== "stream") {
      return [];
    }
    const ids = chatInfoData.members
      .map((member) => member.userId)
      .filter((userId) => Number.isFinite(userId) && userId > 0);
    return Array.from(new Set(ids));
  }, [chatInfoData]);

  useEffect(() => {
    for (const userId of memberStatusIds) {
      void ensureUserStatusLoaded(userId);
    }
  }, [memberStatusIds]);

  const streamInfoName = chatInfoData?.type === "stream" ? chatInfoData.name : undefined;
  const handleOpenTopic = useCallback(
    (topicName: string) => {
      if (streamId == null) {
        return;
      }
      const streamName = streamInfoName?.trim() || title;
      void navigate(
        withCurrentOrgRoute(
          `/stream/${buildStreamSlug(streamId, streamName)}/topic/${encodeURIComponent(topicName)}`,
        ),
      );
    },
    [navigate, streamId, streamInfoName, title],
  );

  if (user) {
    return (
      <RightPanelUser
        user={user}
        onSelectCommonGroup={onSelectCommonGroup}
        onOpenDirectMessage={handleOpenDirectMessage}
      />
    );
  }

  if (chatInfoData?.type === "dm") {
    return (
      <RightPanelDmGroup
        title={title}
        data={chatInfoData}
        onOpenUserProfile={handleOpenUserProfile}
      />
    );
  }

  const streamInfoData = chatInfoData?.type === "stream" ? chatInfoData : null;
  const hasRealMembers = streamInfoData != null && streamInfoData.members.length > 0;
  const members = hasRealMembers
    ? streamInfoData.members.map((m, i) => ({
        userId: m.userId,
        name: m.fullName || t("roles.member"),
        status:
          formatUserStatusLabel(users.get(m.userId)?.status) ??
          (m.isOnline ? t("presence.online") : t("presence.offline")),
        isOwner: i === 0,
        isOnline: m.isOnline,
        avatarUrl: m.avatarUrl,
      }))
    : [];
  const rawChannelDescription =
    streamInfoData != null ? streamInfoData.description?.trim() : undefined;
  const channelDescription =
    rawChannelDescription != null && rawChannelDescription.length > 0
      ? rawChannelDescription
      : null;
  const channelTopics = streamInfoData?.topics ?? [];
  const handleOpenEdit = () => {
    setChannelActionError(null);
    setEditName(title);
    setEditDescription(channelDescription ?? "");
    setEditOpen(true);
  };
  const handleSaveEdit = async () => {
    if (streamId == null || channelActionPending) return;
    const trimmedName = editName.trim();
    if (trimmedName.length === 0) {
      setChannelActionError(t("app.error"));
      return;
    }

    setChannelActionPending(true);
    setChannelActionError(null);
    const ok = await updateStream(streamId, {
      name: trimmedName,
      description: editDescription.trim(),
    });
    if (ok) {
      useChatListStore.getState().renameStream(streamId, trimmedName);
      const nextInfo = useChatInfoStore.getState().data;
      if (nextInfo?.type === "stream") {
        useChatInfoStore.getState().setData({
          ...nextInfo,
          name: trimmedName,
          description: editDescription.trim().length > 0 ? editDescription.trim() : null,
        });
      }
      void navigate(withCurrentOrgRoute(`/stream/${buildStreamSlug(streamId, trimmedName)}`), {
        replace: true,
      });
      setEditOpen(false);
    } else {
      setChannelActionError(t("app.error"));
    }
    setChannelActionPending(false);
  };
  const handleDeleteChannel = async () => {
    if (streamId == null || channelActionPending) return;
    if (!window.confirm(t("channel.deleteChannel"))) return;

    setChannelActionPending(true);
    setChannelActionError(null);
    const ok = await deleteStream(streamId);
    if (ok) {
      const chatList = useChatListStore.getState();
      chatList.removeStream(streamId);
      useChatInfoStore.getState().clear();
      useCurrentChatMessagesStore.getState().setContext(null);
      useCurrentChatMessagesStore.getState().setMessages([]);

      const nextStream = chatList.streams()[0];
      if (nextStream) {
        void navigate(
          withCurrentOrgRoute(`/stream/${buildStreamSlug(nextStream.stream_id, nextStream.name)}`),
          {
            replace: true,
          },
        );
      } else {
        void navigate("/", { replace: true });
      }
    } else {
      setChannelActionError(t("app.error"));
    }
    setChannelActionPending(false);
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
            <button
              type="button"
              onClick={handleToggleMute}
              disabled={mutePending}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
            >
              <Icon
                name="bell"
                size={20}
                className={`shrink-0 ${isStreamMuted ? "text-notice-base" : "text-current"}`}
              />
              <span>{isStreamMuted ? t("channel.unmuteChannel") : t("channel.muteChannel")}</span>
            </button>
            {muteError && (
              <div className="mt-1 flex items-center justify-between gap-2 px-2 text-xs text-notice-base">
                <span>{muteError}</span>
                <button
                  type="button"
                  onClick={handleToggleMute}
                  className="hover:bg-notice-base/20 rounded px-1.5 py-0.5 text-notice-base hover:text-notice-base"
                >
                  {t("common.retry")}
                </button>
              </div>
            )}
            {(canEditChannel || canDeleteChannel) && (
              <div className="mt-2 space-y-1.5">
                {canEditChannel && (
                  <button
                    type="button"
                    onClick={handleOpenEdit}
                    disabled={channelActionPending}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
                  >
                    <Icon name="pen" size={20} className="shrink-0 text-current" />
                    <span>{t("channel.editChannel")}</span>
                  </button>
                )}
                {canDeleteChannel && (
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
                      disabled={channelActionPending}
                    >
                      {t("common.cancel")}
                    </button>
                    <button
                      type="button"
                      className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-on-accent hover:opacity-90 disabled:opacity-60"
                      onClick={handleSaveEdit}
                      disabled={channelActionPending}
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
              {channelTopics.map((topic) => (
                <li key={topic.name}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-text-primary transition-colors hover:bg-bg-elevated"
                    onClick={() => handleOpenTopic(topic.name)}
                  >
                    <span className="truncate">{topic.name}</span>
                    {topic.unreadCount > 0 && (
                      <span className="flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-medium text-on-accent">
                        {topic.unreadCount}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-text-secondary">
            <span className="flex items-center gap-2">
              <Icon name="profile" size={14} className="shrink-0 text-current" />
              {t("channel.members")}
            </span>
          </h3>
          {members.length === 0 ? (
            <p className="px-2 py-3 text-center text-sm text-text-muted">
              {t("channel.noMembers")}
            </p>
          ) : (
            <ul className="space-y-2">
              {members.map((p) => (
                <li key={p.userId}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-bg-elevated"
                    onClick={() => handleOpenUserProfile(p.userId)}
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
                        {p.isOwner && (
                          <span className="text-[10px] font-normal text-text-secondary">
                            {t("roles.owner")}
                          </span>
                        )}
                      </p>
                      {p.status && (
                        <p className="truncate text-[11px] text-text-secondary">{p.status}</p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
