import * as Dialog from "@radix-ui/react-dialog";
import React from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { PresenceIndicator } from "~/shared/ui/presence-indicator";
import { useCreateChatDialog } from "./create-chat-dialog.hook";
import type { CreateChatDialogProps } from "./create-chat-dialog.types";

// Единый стиль полей в диалоге: убираем глобальный focus-outline и подсвечиваем рамку аккуратно.
const CREATE_CHAT_TEXT_INPUT_CLASS =
  "w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted transition-colors focus:border-accent focus-visible:outline-none focus-visible:ring-0";

export const CreateChatDialog: React.FC<CreateChatDialogProps> = ({
  open,
  onOpenChange,
  onNavigateDm,
  onChannelCreated,
}) => {
  const vm = useCreateChatDialog({ open, onNavigateDm, onChannelCreated });
  // Что делает: в разделе создания канала рендерим три независимых чекбокса:
  // `inviteOnly` (приватность), `channelAnnounce` (только анонс ботом),
  // `channelAnnouncementOnly` (реальное ограничение прав публикации).

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-overlay bg-black/50" />
        <Dialog.Content
          className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed left-1/2 top-1/2 z-modal flex max-h-[70vh] w-full max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border-subtle bg-bg-elevated shadow-xl"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
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

          <div
            className="flex border-b border-border-subtle"
            role="tablist"
            aria-label={t("nav.newChat")}
          >
            <button
              type="button"
              ref={(node) => vm.setTabRef("dm", node)}
              role="tab"
              id={vm.tabIds.dm}
              aria-selected={vm.tab === "dm"}
              aria-controls={vm.panelIds.dm}
              tabIndex={vm.tab === "dm" ? 0 : -1}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                vm.tab === "dm"
                  ? "border-b-2 border-accent text-accent"
                  : "text-text-muted hover:text-text-primary"
              }`}
              onClick={() => vm.setTab("dm")}
              onKeyDown={(event) => vm.onTabKeyDown(event, "dm")}
            >
              {t("dm.startChat")}
            </button>
            <button
              type="button"
              ref={(node) => vm.setTabRef("group", node)}
              role="tab"
              id={vm.tabIds.group}
              aria-selected={vm.tab === "group"}
              aria-controls={vm.panelIds.group}
              tabIndex={vm.tab === "group" ? 0 : -1}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                vm.tab === "group"
                  ? "border-b-2 border-accent text-accent"
                  : "text-text-muted hover:text-text-primary"
              }`}
              onClick={() => vm.setTab("group")}
              onKeyDown={(event) => vm.onTabKeyDown(event, "group")}
            >
              {t("dm.createGroup")}
            </button>
            <button
              type="button"
              ref={(node) => vm.setTabRef("channel", node)}
              role="tab"
              id={vm.tabIds.channel}
              aria-selected={vm.tab === "channel"}
              aria-controls={vm.panelIds.channel}
              tabIndex={vm.tab === "channel" ? 0 : -1}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                vm.tab === "channel"
                  ? "border-b-2 border-accent text-accent"
                  : "text-text-muted hover:text-text-primary"
              }`}
              onClick={() => vm.setTab("channel")}
              onKeyDown={(event) => vm.onTabKeyDown(event, "channel")}
            >
              {t("channel.createChannel")}
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-3 overflow-hidden p-4">
            {vm.tab === "dm" && (
              <div
                role="tabpanel"
                id={vm.panelIds.dm}
                aria-labelledby={vm.tabIds.dm}
                className="flex flex-1 flex-col gap-3 overflow-hidden"
              >
                <input
                  type="text"
                  value={vm.userSearch}
                  onChange={(e) => vm.setUserSearch(e.target.value)}
                  className={CREATE_CHAT_TEXT_INPUT_CLASS}
                  placeholder={t("message.searchUsers")}
                />
                <div className="max-h-60 overflow-y-auto rounded-lg border border-border-subtle">
                  {vm.filteredUsers.length === 0 ? (
                    <p className="px-3 py-4 text-center text-sm text-text-muted">
                      {t("search.noResults")}
                    </p>
                  ) : (
                    vm.filteredUsers.map((u) => {
                      return (
                        <button
                          type="button"
                          key={u.userId}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-elevated"
                          onClick={() => onNavigateDm(vm.buildDmSlug(u.userId, u.fullName))}
                        >
                          <PresenceIndicator status={u.presence} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{u.fullName}</span>
                            {(u.statusLabel ?? u.email) && (
                              <span className="block truncate text-[11px] text-text-secondary">
                                {u.statusLabel ?? u.email}
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {vm.tab === "group" && (
              <div
                role="tabpanel"
                id={vm.panelIds.group}
                aria-labelledby={vm.tabIds.group}
                className="flex flex-1 flex-col gap-3 overflow-hidden"
              >
                <input
                  type="text"
                  value={vm.userSearch}
                  onChange={(e) => vm.setUserSearch(e.target.value)}
                  className={CREATE_CHAT_TEXT_INPUT_CLASS}
                  placeholder={t("message.searchUsers")}
                />
                <div className="max-h-60 overflow-y-auto rounded-lg border border-border-subtle">
                  {vm.groupUsers.length === 0 ? (
                    <p className="px-3 py-4 text-center text-sm text-text-muted">
                      {t("search.noResults")}
                    </p>
                  ) : (
                    vm.groupUsers.map((u) => {
                      return (
                        <label
                          key={u.userId}
                          className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-text-primary transition-colors hover:bg-bg-elevated"
                        >
                          <input
                            type="checkbox"
                            checked={vm.groupSelectedUserIds.has(u.userId)}
                            onChange={() => vm.toggleGroupUser(u.userId)}
                            className="h-4 w-4 rounded border-border-subtle"
                          />
                          <PresenceIndicator status={u.presence} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{u.fullName}</span>
                            {(u.statusLabel ?? u.email) && (
                              <span className="block truncate text-[11px] text-text-secondary">
                                {u.statusLabel ?? u.email}
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="hover:bg-bg/50 rounded-lg px-3 py-1.5 text-sm text-text-muted"
                    >
                      {t("common.cancel")}
                    </button>
                  </Dialog.Close>
                  <button
                    type="button"
                    disabled={vm.groupSelectedUserIds.size === 0}
                    onClick={vm.createGroup}
                    className="rounded-lg bg-accent px-3 py-1.5 text-sm text-bg hover:opacity-90 disabled:opacity-50"
                  >
                    {t("common.create")}
                  </button>
                </div>
              </div>
            )}

            {vm.tab === "channel" && (
              <div
                role="tabpanel"
                id={vm.panelIds.channel}
                aria-labelledby={vm.tabIds.channel}
                className="flex flex-1 flex-col gap-3 overflow-hidden"
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
                  <div className="max-h-40 min-w-80 overflow-y-auto rounded-lg border border-border-subtle">
                    {vm.channelUsers.length === 0 ? (
                      <p className="px-3 py-4 text-center text-sm text-text-muted">
                        {t("search.noResults")}
                      </p>
                    ) : (
                      vm.channelUsers.map((u) => {
                        return (
                          <label
                            key={u.userId}
                            className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-text-primary transition-colors hover:bg-bg-elevated"
                          >
                            <input
                              type="checkbox"
                              checked={vm.channelSelectedUserIds.has(u.userId)}
                              onChange={() => vm.toggleChannelUser(u.userId)}
                              className="h-4 w-4 rounded border-border-subtle"
                            />
                            <PresenceIndicator status={u.presence} size="sm" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">{u.fullName}</span>
                              {(u.statusLabel ?? u.email) && (
                                <span className="block truncate text-[11px] text-text-secondary">
                                  {u.statusLabel ?? u.email}
                                </span>
                              )}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
                {vm.channelCreateBlockedReasonKey != null && (
                  <p className="text-xs text-text-muted">{t(vm.channelCreateBlockedReasonKey)}</p>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="hover:bg-bg/50 rounded-lg px-3 py-1.5 text-sm text-text-muted"
                    >
                      {t("common.cancel")}
                    </button>
                  </Dialog.Close>
                  <button
                    type="button"
                    disabled={!vm.channelName.trim() || vm.creating || vm.channelCreateBlocked}
                    onClick={vm.createChannel}
                    className="rounded-lg bg-accent px-3 py-1.5 text-sm text-bg hover:opacity-90 disabled:opacity-50"
                  >
                    {t("common.create")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
