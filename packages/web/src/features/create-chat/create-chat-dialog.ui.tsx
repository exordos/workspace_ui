import * as Dialog from "@radix-ui/react-dialog";
import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { AppDialogShell, APP_DIALOG_CONTENT_BASE_CLASS } from "~/shared/ui/app-dialog.ui";
import { Icon } from "~/shared/ui/icon";
import { PresenceIndicator } from "~/shared/ui/presence-indicator";
import { Spinner } from "~/shared/ui/spinner.ui";
import {
  useCreateChatDialog,
  type BrowseChannelSubscriptionFilter,
  type CreateChatUserOption,
  type UseCreateChatDialogResult,
} from "./create-chat-dialog.hook";
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

// Footer pinned below scroll area — shared actions across tabs.
const CREATE_CHAT_FOOTER_CLASS =
  "border-border-subtle bg-bg-elevated flex shrink-0 justify-end gap-2 border-t px-4 py-3";

const createChatTabLabelKey: Record<CreateChatTab, string> = {
  dm: "dm.startChat",
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

    return <EmptyCreateChatList label={t("channel.noChannels")} />;
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
  const showCreateChannel = vm.tab === "channel";
  const showCreateTopic = vm.tab === "topic";
  const showCancelOnly = vm.tab === "dm" || vm.tab === "archived" || vm.tab === "channels";

  return (
    <div className={CREATE_CHAT_FOOTER_CLASS}>
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
  visibleTabs,
  onNavigateWorkspaceStream,
  onNavigateWorkspaceTopic,
  onChannelCreated,
}) => {
  const vm = useCreateChatDialog({
    open,
    visibleTabs,
    onNavigateWorkspaceStream,
    onNavigateWorkspaceTopic,
    onChannelCreated,
  });
  // The announcement-only checkbox is preserved as UI shell until Workspace policy support exists.

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
              <div className="rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-muted">
                {t("channel.workspaceBrowseChannelsUnsupported")}
              </div>
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
                <div className="flex h-full min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-border-subtle bg-bg px-4 text-center text-sm text-text-muted">
                  {t("channel.browseSelectChannel")}
                </div>
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
              <div className="rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-muted">
                {t("channel.workspaceArchivedChannelsUnsupported")}
              </div>
              <div className={CREATE_CHAT_USER_LIST_CLASS}>
                <p className="px-3 py-4 text-center text-sm text-text-muted">
                  {t("channel.noArchivedChannels")}
                </p>
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
