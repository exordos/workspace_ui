import * as Dialog from "@radix-ui/react-dialog";
import React, { useCallback, useMemo } from "react";
import { useUserGroupsStore } from "~/entities/user-group/user-group.model";
import { getLocale, t } from "~/i18n/i18n";
import { AppDialogShell, APP_DIALOG_CONTENT_BASE_CLASS } from "~/shared/ui/app-dialog.ui";
import { Icon } from "~/shared/ui/icon";
import { PresenceIndicator } from "~/shared/ui/presence-indicator";
import { Spinner } from "~/shared/ui/spinner.ui";
import {
  buildBrowseChannelDetailSections,
  createBrowseChannelDetailLabels,
} from "./create-chat-browse-channel-settings.lib";
import {
  useCreateChatDialog,
  type CreateChatUserOption,
  type UseCreateChatDialogResult,
} from "./create-chat-dialog.hook";
import type {
  BrowseChannelRow as BrowseChannelRowData,
  BrowseChannelSubscriptionFilter,
} from "./create-chat-browse-channels.lib";
import type { CreateChatTab } from "./create-chat-dialog.lib";
import type { CreateChatDialogProps } from "./create-chat-dialog.types";

// Dialog field styling: no global focus ring, accent border on focus.
const CREATE_CHAT_TEXT_INPUT_CLASS =
  "w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted transition-colors focus:border-accent focus-visible:outline-none focus-visible:ring-0";

// Scrollable list wrapper — bordered, no row dividers.
const CREATE_CHAT_LIST_SCROLL_BASE_CLASS = "overflow-y-auto rounded-lg border border-border-subtle";

// Fixed-height user lists — prevents dialog height jump when search narrows results.
const CREATE_CHAT_USER_LIST_CLASS = `min-h-60 max-h-60 ${CREATE_CHAT_LIST_SCROLL_BASE_CLASS}`;
const CREATE_CHAT_CHANNEL_MEMBER_LIST_CLASS = `min-h-40 max-h-40 min-w-80 ${CREATE_CHAT_LIST_SCROLL_BASE_CLASS}`;

// Minimum body height below tabs (scrolls inside when content exceeds max-h on dialog).
const CREATE_CHAT_BODY_MIN_HEIGHT_CLASS = "min-h-[20rem]";

// Browse channels master-detail row — fixed height; both columns scroll internally.
const CREATE_CHAT_BROWSE_CHANNELS_ROW_CLASS =
  "flex h-[22rem] min-h-[22rem] max-h-[22rem] gap-3 overflow-hidden";
const CREATE_CHAT_LIST_ROW_CLASS =
  "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-sidebar-hover";

// Composite row (archive): highlight full strip, not just the left button.
const CREATE_CHAT_LIST_COMPOSITE_ROW_CLASS =
  "flex w-full items-stretch gap-2 transition-colors hover:bg-sidebar-hover";

// Footer pinned below scroll area — shared actions across tabs.
const CREATE_CHAT_FOOTER_CLASS =
  "border-border-subtle bg-bg-elevated flex shrink-0 justify-end gap-2 border-t px-4 py-3";

const createChatTabLabelKey: Record<CreateChatTab, string> = {
  dm: "dm.startChat",
  group: "dm.createGroup",
  channels: "channel.browseChannels",
  channel: "channel.createChannel",
  topic: "channel.createTopic",
  archived: "channel.archivedChannels",
};

interface CreateChatTabsProps {
  vm: UseCreateChatDialogResult;
}

const CreateChatTabs = React.memo<CreateChatTabsProps>(function CreateChatTabs({ vm }) {
  return (
    <div
      className="flex border-b border-border-subtle"
      role="tablist"
      aria-label={t("nav.newChat")}
    >
      {vm.visibleTabs.map((tab) => (
        <CreateChatTabButton key={tab} tab={tab} vm={vm} />
      ))}
    </div>
  );
});

interface CreateChatTabButtonProps {
  tab: CreateChatTab;
  vm: UseCreateChatDialogResult;
}

const CreateChatTabButton = React.memo<CreateChatTabButtonProps>(function CreateChatTabButton({
  tab,
  vm,
}) {
  const selected = vm.tab === tab;

  return (
    <button
      type="button"
      ref={(node) => vm.setTabRef(tab, node)}
      role="tab"
      id={vm.tabIds[tab]}
      aria-selected={selected}
      aria-controls={vm.panelIds[tab]}
      tabIndex={selected ? 0 : -1}
      className={`flex-1 whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors ${
        selected
          ? "border-b-2 border-accent text-accent"
          : "text-text-muted hover:text-text-primary"
      }`}
      onClick={() => vm.setTab(tab)}
      onKeyDown={(event) => vm.onTabKeyDown(event, tab)}
    >
      {t(createChatTabLabelKey[tab])}
    </button>
  );
});

interface EmptyCreateChatListProps {
  label: string;
}

const EmptyCreateChatList = React.memo<EmptyCreateChatListProps>(function EmptyCreateChatList({
  label,
}) {
  return <p className="px-3 py-4 text-center text-sm text-text-muted">{label}</p>;
});

interface DirectUserRowProps {
  user: CreateChatUserOption;
  onOpen: (user: CreateChatUserOption) => void;
}

const DirectUserRow = React.memo<DirectUserRowProps>(function DirectUserRow({ user, onOpen }) {
  const handleClick = useCallback(() => {
    onOpen(user);
  }, [onOpen, user]);

  return (
    <button
      type="button"
      key={user.userKey}
      className={CREATE_CHAT_LIST_ROW_CLASS}
      onClick={handleClick}
    >
      <CreateChatUserRowBody user={user} />
    </button>
  );
});

interface SelectableUserRowProps {
  user: CreateChatUserOption;
  checked: boolean;
  onToggle: (userKey: string) => void;
}

const SelectableUserRow = React.memo<SelectableUserRowProps>(function SelectableUserRow({
  user,
  checked,
  onToggle,
}) {
  const handleChange = useCallback(() => {
    onToggle(user.userKey);
  }, [onToggle, user.userKey]);

  return (
    <label key={user.userKey} className={CREATE_CHAT_LIST_ROW_CLASS}>
      <input
        type="checkbox"
        checked={checked}
        onChange={handleChange}
        className="h-4 w-4 rounded border-border-subtle"
      />
      <CreateChatUserRowBody user={user} />
    </label>
  );
});

const CreateChatUserRowBody = React.memo<{ user: CreateChatUserOption }>(
  function CreateChatUserRowBody({ user }) {
    const secondaryText = user.statusLabel ?? user.email;

    return (
      <>
        <PresenceIndicator status={user.presence} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{user.fullName}</span>
          {secondaryText && (
            <span className="block truncate text-[11px] text-text-secondary">{secondaryText}</span>
          )}
        </span>
      </>
    );
  },
);

interface BrowseChannelsListContentProps {
  vm: UseCreateChatDialogResult;
}

const BrowseChannelsListContent = React.memo<BrowseChannelsListContentProps>(
  function BrowseChannelsListContent({ vm }) {
    if (vm.channelsLoading) {
      return (
        <div className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-text-muted">
          <Spinner size="sm" />
          {t("app.loading")}
        </div>
      );
    }

    if (vm.browseChannels.length === 0) {
      return <EmptyCreateChatList label={t("channel.noChannels")} />;
    }

    return (
      <>
        {vm.browseChannels.map((channel) => (
          <BrowseChannelListItem
            key={channel.streamId}
            channel={channel}
            isSelected={vm.selectedBrowseChannelId === channel.streamId}
            onSelect={vm.setSelectedBrowseChannelId}
          />
        ))}
      </>
    );
  },
);

interface CreateChatFooterProps {
  vm: UseCreateChatDialogResult;
}

const DialogCancelButton = React.memo(function DialogCancelButton() {
  return (
    <Dialog.Close asChild>
      <button
        type="button"
        className="hover:bg-bg/50 rounded-lg px-3 py-1.5 text-sm text-text-muted"
      >
        {t("common.cancel")}
      </button>
    </Dialog.Close>
  );
});

const CreateChatFooter = React.memo<CreateChatFooterProps>(function CreateChatFooter({ vm }) {
  const showCreateGroup = vm.tab === "group";
  const showCreateChannel = vm.tab === "channel";
  const showCreateTopic = vm.tab === "topic";
  const showCancelOnly = vm.tab === "dm" || vm.tab === "archived" || vm.tab === "channels";

  return (
    <div className={CREATE_CHAT_FOOTER_CLASS}>
      {showCreateGroup && (
        <>
          <DialogCancelButton />
          <button
            type="button"
            disabled={vm.groupSelectedUserKeys.size === 0 || vm.creating}
            onClick={vm.createGroup}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm text-bg hover:opacity-90 disabled:opacity-50"
          >
            {t("common.create")}
          </button>
        </>
      )}
      {showCreateChannel && (
        <>
          <DialogCancelButton />
          <button
            type="button"
            disabled={!vm.channelName.trim() || vm.creating || vm.channelCreateBlocked}
            onClick={vm.createChannel}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm text-bg hover:opacity-90 disabled:opacity-50"
          >
            {t("common.create")}
          </button>
        </>
      )}
      {showCreateTopic && (
        <>
          <DialogCancelButton />
          <button
            type="button"
            disabled={vm.workspaceTopicCreateBlocked || vm.creating}
            onClick={vm.createWorkspaceTopic}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm text-bg hover:opacity-90 disabled:opacity-50"
          >
            {t("common.create")}
          </button>
        </>
      )}
      {showCancelOnly && <DialogCancelButton />}
    </div>
  );
});

export const CreateChatDialog: React.FC<CreateChatDialogProps> = ({
  open,
  onOpenChange,
  mode = "legacy",
  onNavigateDm,
  onNavigateStream,
  onNavigateWorkspaceStream,
  onNavigateWorkspaceTopic,
  onChannelCreated,
}) => {
  const vm = useCreateChatDialog({
    open,
    mode,
    onNavigateDm,
    onNavigateStream,
    onNavigateWorkspaceStream,
    onNavigateWorkspaceTopic,
    onChannelCreated,
  });
  // Three independent channel checkboxes: inviteOnly, channelAnnounce (bot notification), channelAnnouncementOnly (posting policy).

  const handleOpenArchivedChannel = useCallback(
    (streamId: number, streamName: string) => {
      onNavigateStream(streamId, streamName);
    },
    [onNavigateStream],
  );

  const contentClassName = `${APP_DIALOG_CONTENT_BASE_CLASS} top-1/2 flex min-h-[32rem] max-h-[85vh] max-w-4xl -translate-y-1/2 flex-col overflow-hidden p-0`;

  return (
    <AppDialogShell open={open} onOpenChange={onOpenChange} contentClassName={contentClassName}>
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <Dialog.Title className="text-sm font-semibold text-text-primary">
          {t("nav.newChat")}
        </Dialog.Title>
        <Dialog.Description className="sr-only">{t("nav.newChat")}</Dialog.Description>
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

      <CreateChatTabs vm={vm} />

      {/* Middle scrolls; action footer pinned below all tabs */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          className={`min-h-0 flex-1 overflow-y-auto px-4 pb-2 pt-4 ${CREATE_CHAT_BODY_MIN_HEIGHT_CLASS}`}
        >
          {vm.tab === "dm" && (
            <div
              role="tabpanel"
              id={vm.panelIds.dm}
              aria-labelledby={vm.tabIds.dm}
              className="flex flex-col gap-3"
            >
              <input
                type="text"
                value={vm.userSearch}
                onChange={(e) => vm.setUserSearch(e.target.value)}
                className={CREATE_CHAT_TEXT_INPUT_CLASS}
                placeholder={t("message.searchUsers")}
              />
              <div className={CREATE_CHAT_USER_LIST_CLASS}>
                {vm.filteredUsers.length === 0 ? (
                  <EmptyCreateChatList label={t("search.noResults")} />
                ) : (
                  vm.filteredUsers.map((user) => (
                    <DirectUserRow key={user.userKey} user={user} onOpen={vm.openDirectUser} />
                  ))
                )}
              </div>
            </div>
          )}

          {vm.tab === "group" && (
            <div
              role="tabpanel"
              id={vm.panelIds.group}
              aria-labelledby={vm.tabIds.group}
              className="flex flex-col gap-3"
            >
              <input
                type="text"
                value={vm.userSearch}
                onChange={(e) => vm.setUserSearch(e.target.value)}
                className={CREATE_CHAT_TEXT_INPUT_CLASS}
                placeholder={t("message.searchUsers")}
              />
              <div className={CREATE_CHAT_USER_LIST_CLASS}>
                {vm.groupUsers.length === 0 ? (
                  <EmptyCreateChatList label={t("search.noResults")} />
                ) : (
                  vm.groupUsers.map((user) => (
                    <SelectableUserRow
                      key={user.userKey}
                      user={user}
                      checked={vm.groupSelectedUserKeys.has(user.userKey)}
                      onToggle={vm.toggleGroupUser}
                    />
                  ))
                )}
              </div>
            </div>
          )}

          {vm.tab === "channels" && (
            <div
              role="tabpanel"
              id={vm.panelIds.channels}
              aria-labelledby={vm.tabIds.channels}
              className="flex min-h-0 flex-col gap-3 overflow-hidden"
            >
              {vm.subscribeInlineError != null && (
                <div
                  role="alert"
                  className="rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-notice-base"
                >
                  {vm.subscribeInlineError === "unsubscribe_failed"
                    ? t("channel.unsubscribeFailed")
                    : t("channel.subscribeFailed", { message: vm.subscribeInlineError })}
                </div>
              )}
              {vm.channelsError && <p className="text-sm text-notice-base">{t("app.error")}</p>}
              <div className={CREATE_CHAT_BROWSE_CHANNELS_ROW_CLASS}>
                <div className="flex h-full min-h-0 w-[38%] min-w-[9rem] flex-col gap-2">
                  <input
                    type="text"
                    value={vm.channelsSearch}
                    onChange={(e) => vm.setChannelsSearch(e.target.value)}
                    className={CREATE_CHAT_TEXT_INPUT_CLASS}
                    placeholder={t("channel.searchChannels")}
                  />
                  <BrowseChannelSubscriptionToggle
                    value={vm.channelsSubscriptionFilter}
                    onChange={vm.setChannelsSubscriptionFilter}
                  />
                  <div className={`min-h-0 flex-1 ${CREATE_CHAT_LIST_SCROLL_BASE_CLASS}`}>
                    <BrowseChannelsListContent vm={vm} />
                  </div>
                </div>
                <BrowseChannelDetailPanel
                  channel={vm.selectedBrowseChannel}
                  isActionPending={
                    vm.selectedBrowseChannel != null &&
                    vm.subscribePendingStreamIds.includes(vm.selectedBrowseChannel.streamId)
                  }
                  onSubscribe={vm.onSubscribeToChannel}
                  onUnsubscribe={vm.onUnsubscribeFromChannel}
                  onOpenChannel={handleOpenArchivedChannel}
                />
              </div>
            </div>
          )}

          {vm.tab === "channel" && (
            <div
              role="tabpanel"
              id={vm.panelIds.channel}
              aria-labelledby={vm.tabIds.channel}
              className="flex flex-col gap-3"
            >
              <label className="text-sm text-text-muted">{t("channel.channelName")}</label>
              <input
                type="text"
                value={vm.channelName}
                onChange={(e) => vm.setChannelName(e.target.value)}
                className={CREATE_CHAT_TEXT_INPUT_CLASS}
                placeholder={t("channel.channelName")}
              />
              <label className="text-sm text-text-muted">{t("channel.description")}</label>
              <input
                type="text"
                value={vm.channelDesc}
                onChange={(e) => vm.setChannelDesc(e.target.value)}
                className={CREATE_CHAT_TEXT_INPUT_CLASS}
                placeholder={t("channel.description")}
              />
              <div className="grid gap-2 rounded-lg border border-border-subtle bg-bg px-3 py-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
                  <input
                    type="checkbox"
                    checked={vm.channelInviteOnly}
                    onChange={(e) => vm.setChannelInviteOnly(e.target.checked)}
                    className="h-4 w-4 rounded border-border-subtle"
                  />
                  <span>{t("channel.inviteOnly")}</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
                  <input
                    type="checkbox"
                    checked={vm.channelAnnounce}
                    onChange={(e) => vm.setChannelAnnounce(e.target.checked)}
                    className="h-4 w-4 rounded border-border-subtle"
                  />
                  <span>{t("channel.announceChannel")}</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
                  <input
                    type="checkbox"
                    checked={vm.channelAnnouncementOnly}
                    onChange={(e) => vm.setChannelAnnouncementOnly(e.target.checked)}
                    disabled={vm.channelAnnouncementOnlyBlocked}
                    className="h-4 w-4 rounded border-border-subtle disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <span>{t("channel.announcementOnly")}</span>
                </label>
                {vm.channelAnnouncementOnlyBlockedReasonKey != null && (
                  <p className="text-xs text-text-muted">
                    {t(vm.channelAnnouncementOnlyBlockedReasonKey)}
                  </p>
                )}
              </div>
              <div className="flex min-h-0 flex-col gap-3 overflow-x-auto">
                <label className="text-sm text-text-muted">{t("channel.addMembers")}</label>
                <input
                  type="text"
                  value={vm.userSearch}
                  onChange={(e) => vm.setUserSearch(e.target.value)}
                  className={CREATE_CHAT_TEXT_INPUT_CLASS}
                  placeholder={t("message.searchUsers")}
                />
                <div className={CREATE_CHAT_CHANNEL_MEMBER_LIST_CLASS}>
                  {vm.channelUsers.length === 0 ? (
                    <EmptyCreateChatList label={t("search.noResults")} />
                  ) : (
                    vm.channelUsers.map((user) => (
                      <SelectableUserRow
                        key={user.userKey}
                        user={user}
                        checked={vm.channelSelectedUserKeys.has(user.userKey)}
                        onToggle={vm.toggleChannelUser}
                      />
                    ))
                  )}
                </div>
              </div>
              {vm.channelCreateBlockedReasonKey != null && (
                <p className="text-xs text-text-muted">{t(vm.channelCreateBlockedReasonKey)}</p>
              )}
            </div>
          )}

          {vm.tab === "topic" && (
            <div
              role="tabpanel"
              id={vm.panelIds.topic}
              aria-labelledby={vm.tabIds.topic}
              className="flex flex-col gap-3"
            >
              <label className="text-sm text-text-muted">{t("channel.selectChannel")}</label>
              <select
                value={vm.workspaceTopicStreamUuid}
                onChange={(event) => vm.setWorkspaceTopicStreamUuid(event.target.value)}
                className={CREATE_CHAT_TEXT_INPUT_CLASS}
              >
                {vm.workspaceTopicStreams.map((stream) => (
                  <option key={stream.streamUuid} value={stream.streamUuid}>
                    {stream.name}
                  </option>
                ))}
              </select>
              <label className="text-sm text-text-muted">{t("channel.topicName")}</label>
              <input
                type="text"
                value={vm.workspaceTopicName}
                onChange={(e) => vm.setWorkspaceTopicName(e.target.value)}
                className={CREATE_CHAT_TEXT_INPUT_CLASS}
                placeholder={t("channel.topicName")}
              />
              {vm.workspaceTopicStreams.length === 0 && (
                <p className="text-xs text-text-muted">{t("channel.noChannels")}</p>
              )}
            </div>
          )}

          {vm.tab === "archived" && (
            <div
              role="tabpanel"
              id={vm.panelIds.archived}
              aria-labelledby={vm.tabIds.archived}
              className="flex flex-col gap-3"
            >
              <input
                type="text"
                value={vm.archivedSearch}
                onChange={(e) => vm.setArchivedSearch(e.target.value)}
                className={CREATE_CHAT_TEXT_INPUT_CLASS}
                placeholder={t("channel.searchArchivedChannels")}
              />
              {vm.unarchiveInlineError != null && (
                <div
                  role="alert"
                  className="rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-notice-base"
                >
                  {vm.unarchiveInlineError.kind === "unsupported"
                    ? t("channel.unarchiveUnsupported")
                    : t("channel.unarchiveFailed", {
                        message: vm.unarchiveInlineError.message,
                      })}
                </div>
              )}
              <div className={CREATE_CHAT_USER_LIST_CLASS}>
                {vm.archivedChannels.length === 0 ? (
                  <p className="px-3 py-4 text-center text-sm text-text-muted">
                    {t("channel.noArchivedChannels")}
                  </p>
                ) : (
                  vm.archivedChannels.map((channel) => (
                    <ArchivedChannelRow
                      key={channel.streamId}
                      streamId={channel.streamId}
                      name={channel.name}
                      lastMessage={channel.lastMessage}
                      time={channel.time}
                      isUnarchivePending={vm.unarchivePendingStreamIds.includes(channel.streamId)}
                      onOpenChannel={handleOpenArchivedChannel}
                      onUnarchive={vm.onUnarchiveArchivedChannel}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <CreateChatFooter vm={vm} />
      </div>
    </AppDialogShell>
  );
};

const BROWSE_CHANNEL_SUBSCRIPTION_FILTERS: BrowseChannelSubscriptionFilter[] = [
  "unsubscribed",
  "subscribed",
  "all",
];

const browseChannelSubscriptionFilterLabelKey: Record<BrowseChannelSubscriptionFilter, string> = {
  unsubscribed: "channel.browseFilterUnsubscribed",
  subscribed: "channel.browseFilterSubscribed",
  all: "channel.browseFilterAll",
};

interface BrowseChannelSubscriptionToggleProps {
  value: BrowseChannelSubscriptionFilter;
  onChange: (filter: BrowseChannelSubscriptionFilter) => void;
}

const BrowseChannelSubscriptionToggle = React.memo<BrowseChannelSubscriptionToggleProps>(
  function BrowseChannelSubscriptionToggle({ value, onChange }) {
    return (
      <div
        role="group"
        aria-label={t("channel.browseFilterLabel")}
        className="flex rounded-lg border border-border-subtle bg-bg p-0.5"
      >
        {BROWSE_CHANNEL_SUBSCRIPTION_FILTERS.map((filter) => {
          const selected = value === filter;
          const handleClick = () => {
            onChange(filter);
          };
          return (
            <button
              key={filter}
              type="button"
              aria-pressed={selected}
              onClick={handleClick}
              className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                selected
                  ? "bg-sidebar-hover text-text-primary"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {t(browseChannelSubscriptionFilterLabelKey[filter])}
            </button>
          );
        })}
      </div>
    );
  },
);

interface BrowseChannelListItemProps {
  channel: BrowseChannelRowData;
  isSelected: boolean;
  onSelect: (streamId: number) => void;
}

const BrowseChannelListItem = React.memo<BrowseChannelListItemProps>(
  function BrowseChannelListItem({ channel, isSelected, onSelect }) {
    const handleClick = useCallback(() => {
      onSelect(channel.streamId);
    }, [channel.streamId, onSelect]);

    return (
      <button
        type="button"
        onClick={handleClick}
        aria-current={isSelected ? "true" : undefined}
        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
          isSelected
            ? "bg-sidebar-hover text-text-primary"
            : "text-text-primary hover:bg-sidebar-hover"
        }`}
      >
        <span className="min-w-0 flex-1 truncate font-medium">#{channel.name}</span>
        <BrowseChannelRowMetrics channel={channel} />
      </button>
    );
  },
);

const BrowseChannelRowMetrics = React.memo<{ channel: BrowseChannelRowData }>(
  function BrowseChannelRowMetrics({ channel }) {
    const showSubscribers = channel.subscriberCount != null;
    const showMessages = channel.weeklyMessageCount != null;

    if (!showSubscribers && !showMessages) {
      return null;
    }

    return (
      <div className="flex shrink-0 items-center gap-2.5 text-xs tabular-nums text-text-muted">
        {showSubscribers && (
          <span
            className="flex items-center gap-1"
            aria-label={t("channel.browseStatSubscribersAria", {
              count: channel.subscriberCount!,
            })}
          >
            <span>{channel.subscriberCount}</span>
            <Icon name="group" size={14} className="shrink-0" aria-hidden />
          </span>
        )}
        {showMessages && (
          <span
            className="flex items-center gap-1"
            aria-label={t("channel.browseStatWeeklyAria", {
              count: channel.weeklyMessageCount!,
            })}
          >
            <span>{channel.weeklyMessageCount}</span>
            <Icon name="chatBubble" size={14} className="shrink-0" aria-hidden />
          </span>
        )}
      </div>
    );
  },
);

interface BrowseChannelDetailPanelProps {
  channel: BrowseChannelRowData | null;
  isActionPending: boolean;
  onSubscribe: (streamId: number, streamName: string) => Promise<void>;
  onUnsubscribe: (streamId: number, streamName: string) => Promise<void>;
  onOpenChannel: (streamId: number, streamName: string) => void;
}

const BrowseChannelDetailPanel = React.memo<BrowseChannelDetailPanelProps>(
  function BrowseChannelDetailPanel({
    channel,
    isActionPending,
    onSubscribe,
    onUnsubscribe,
    onOpenChannel,
  }) {
    const groups = useUserGroupsStore((s) => s.groups);

    const detailSections = useMemo(() => {
      if (channel == null) {
        return [];
      }
      const labels = createBrowseChannelDetailLabels({
        t,
        locale: getLocale(),
        resolveUserName: () => undefined,
        resolveGroupName: (groupId) => groups.get(groupId)?.name,
      });
      return buildBrowseChannelDetailSections(channel, labels);
    }, [channel, groups]);

    const handleSubscribe = useCallback(() => {
      if (channel == null) return;
      void onSubscribe(channel.streamId, channel.name);
    }, [channel, onSubscribe]);

    const handleUnsubscribe = useCallback(() => {
      if (channel == null) return;
      void onUnsubscribe(channel.streamId, channel.name);
    }, [channel, onUnsubscribe]);

    const handleOpen = useCallback(() => {
      if (!channel?.isSubscribed) return;
      onOpenChannel(channel.streamId, channel.name);
    }, [channel, onOpenChannel]);

    if (channel == null) {
      return (
        <div className="flex h-full min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-border-subtle bg-bg px-4 text-center text-sm text-text-muted">
          {t("channel.browseSelectChannel")}
        </div>
      );
    }

    const description =
      channel.description.trim().length > 0
        ? channel.description.trim()
        : t("channel.noDescription");

    return (
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border-subtle bg-bg">
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <h3 className="truncate text-base font-semibold text-text-primary">#{channel.name}</h3>
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
              {t("channel.description")}
            </p>
            <p className="mt-1 text-sm text-text-primary">{description}</p>
          </div>
          {detailSections.map((section) => (
            <div key={section.titleKey} className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                {t(section.titleKey)}
              </p>
              <dl className="mt-2 space-y-2">
                {section.fields.map((field) => (
                  <div key={field.id} className="flex items-start justify-between gap-3 text-sm">
                    <dt className="text-text-muted">{t(field.labelKey)}</dt>
                    <dd className="text-right text-text-primary">{field.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 border-t border-border-subtle p-4">
          {channel.isSubscribed ? (
            <>
              <button
                type="button"
                onClick={handleOpen}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm text-bg transition-opacity hover:opacity-90"
              >
                {t("channel.openChannel")}
              </button>
              <button
                type="button"
                onClick={handleUnsubscribe}
                disabled={isActionPending}
                aria-busy={isActionPending}
                className="hover:bg-bg/50 rounded-lg border border-border-subtle px-3 py-1.5 text-sm text-text-primary transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isActionPending ? t("app.loading") : t("channel.unsubscribe")}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleSubscribe}
              disabled={isActionPending}
              aria-busy={isActionPending}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isActionPending ? t("app.loading") : t("channel.subscribe")}
            </button>
          )}
        </div>
      </div>
    );
  },
);

interface ArchivedChannelRowProps {
  streamId: number;
  name: string;
  lastMessage: string;
  time: string;
  isUnarchivePending: boolean;
  onOpenChannel: (streamId: number, streamName: string) => void;
  onUnarchive: (streamId: number) => Promise<void>;
}

/** Archived channel row: row click opens chat; unarchive button is separate. */
const ArchivedChannelRow = React.memo<ArchivedChannelRowProps>(function ArchivedChannelRow({
  streamId,
  name,
  lastMessage,
  time,
  isUnarchivePending,
  onOpenChannel,
  onUnarchive,
}) {
  const handleRowClick = useCallback(() => {
    onOpenChannel(streamId, name);
  }, [onOpenChannel, streamId, name]);

  const handleUnarchiveClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      // Stop propagation so row click and unarchive do not fire together.
      event.stopPropagation();
      void onUnarchive(streamId);
    },
    [onUnarchive, streamId],
  );

  const previewBase = lastMessage || t("channel.archivedChannels");
  const previewTime = time ? ` · ${time}` : "";
  const previewLine = `${previewBase}${previewTime}`.trim();

  return (
    <div className={CREATE_CHAT_LIST_COMPOSITE_ROW_CLASS}>
      <button
        type="button"
        onClick={handleRowClick}
        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm text-text-primary"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">#{name}</span>
          <span className="block truncate text-[11px] text-text-secondary">{previewLine}</span>
        </span>
      </button>
      <div className="flex shrink-0 items-center pr-2">
        <button
          type="button"
          onClick={handleUnarchiveClick}
          disabled={isUnarchivePending}
          aria-busy={isUnarchivePending}
          aria-label={
            isUnarchivePending
              ? `${t("channel.unarchiveInProgress")}: ${name}`
              : `${t("channel.unarchiveChannel")}: ${name}`
          }
          className="flex h-7 w-7 items-center justify-center rounded-md bg-indicator-green text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon
            name="logout"
            size={14}
            className={`text-bg ${isUnarchivePending ? "animate-spin" : ""}`}
          />
        </button>
      </div>
    </div>
  );
});
