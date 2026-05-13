import * as Dialog from "@radix-ui/react-dialog";
import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { Avatar } from "~/shared/ui/avatar";
import { Icon } from "~/shared/ui/icon";
import { PresenceIndicator } from "~/shared/ui/presence-indicator";
import { useCreateChatDialog } from "./create-chat-dialog.hook";
import type { CreateChatDialogProps } from "./create-chat-dialog.types";

// Единый стиль полей в диалоге: убираем глобальный focus-outline и подсвечиваем рамку аккуратно.
const CREATE_CHAT_TEXT_INPUT_CLASS =
  "w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted transition-colors focus:border-accent focus-visible:outline-none focus-visible:ring-0";

// Прокручиваемый список строк: общая рамка обёртки; без подложки и без линий между строками.
const CREATE_CHAT_LIST_SCROLL_BASE_CLASS = "overflow-y-auto rounded-lg border border-border-subtle";

// Интерактивная строка списка: тот же токен, что и строки сайдбара (`sidebarRowClass`).
// Важно: фон модалки — bg-elevated; hover:bg-bg-elevated совпадал с подложкой и почти не был виден.
const CREATE_CHAT_LIST_ROW_CLASS =
  "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-sidebar-hover";

// Составная строка (архив и т.п.): подсветка всей полосы, не только левой кнопки.
const CREATE_CHAT_LIST_COMPOSITE_ROW_CLASS =
  "flex w-full items-stretch gap-2 transition-colors hover:bg-sidebar-hover";

// Нижняя панель: вне скролла, одна линия действий на всех вкладках.
const CREATE_CHAT_FOOTER_CLASS =
  "border-border-subtle bg-bg-elevated flex shrink-0 justify-end gap-2 border-t px-4 py-3";

export const CreateChatDialog: React.FC<CreateChatDialogProps> = ({
  open,
  onOpenChange,
  onNavigateDm,
  onNavigateStream,
  onChannelCreated,
}) => {
  const vm = useCreateChatDialog({ open, onNavigateDm, onChannelCreated });
  // Что делает: в разделе создания канала рендерим три независимых чекбокса:
  // `inviteOnly` (приватность), `channelAnnounce` (только анонс ботом),
  // `channelAnnouncementOnly` (реальное ограничение прав публикации).

  const handleOpenArchivedChannel = useCallback(
    (streamId: number, streamName: string) => {
      onNavigateStream(streamId, streamName);
    },
    [onNavigateStream],
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-overlay bg-black/50" />
        <Dialog.Content
          className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed left-1/2 top-1/2 z-modal flex max-h-[85vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border-subtle bg-bg-elevated shadow-xl"
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
              className={`flex-1 whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors ${
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
              className={`flex-1 whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors ${
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
              className={`flex-1 whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors ${
                vm.tab === "channel"
                  ? "border-b-2 border-accent text-accent"
                  : "text-text-muted hover:text-text-primary"
              }`}
              onClick={() => vm.setTab("channel")}
              onKeyDown={(event) => vm.onTabKeyDown(event, "channel")}
            >
              {t("channel.createChannel")}
            </button>
            <button
              type="button"
              ref={(node) => vm.setTabRef("archived", node)}
              role="tab"
              id={vm.tabIds.archived}
              aria-selected={vm.tab === "archived"}
              aria-controls={vm.panelIds.archived}
              tabIndex={vm.tab === "archived" ? 0 : -1}
              className={`flex-1 whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors ${
                vm.tab === "archived"
                  ? "border-b-2 border-accent text-accent"
                  : "text-text-muted hover:text-text-primary"
              }`}
              onClick={() => vm.setTab("archived")}
              onKeyDown={(event) => vm.onTabKeyDown(event, "archived")}
            >
              {t("channel.archivedChannels")}
            </button>
          </div>

          {/* Скролл только у середины; нижняя полоса с действиями закреплена под всеми вкладками */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2 pt-4">
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
                  <div className={`max-h-60 ${CREATE_CHAT_LIST_SCROLL_BASE_CLASS}`}>
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
                            className={CREATE_CHAT_LIST_ROW_CLASS}
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
                  className="flex flex-col gap-3"
                >
                  <input
                    type="text"
                    value={vm.userSearch}
                    onChange={(e) => vm.setUserSearch(e.target.value)}
                    className={CREATE_CHAT_TEXT_INPUT_CLASS}
                    placeholder={t("message.searchUsers")}
                  />
                  <div className={`max-h-60 ${CREATE_CHAT_LIST_SCROLL_BASE_CLASS}`}>
                    {vm.groupUsers.length === 0 ? (
                      <p className="px-3 py-4 text-center text-sm text-text-muted">
                        {t("search.noResults")}
                      </p>
                    ) : (
                      vm.groupUsers.map((u) => {
                        return (
                          <label key={u.userId} className={CREATE_CHAT_LIST_ROW_CLASS}>
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
                    <div className={`max-h-40 min-w-80 ${CREATE_CHAT_LIST_SCROLL_BASE_CLASS}`}>
                      {vm.channelUsers.length === 0 ? (
                        <p className="px-3 py-4 text-center text-sm text-text-muted">
                          {t("search.noResults")}
                        </p>
                      ) : (
                        vm.channelUsers.map((u) => {
                          return (
                            <label key={u.userId} className={CREATE_CHAT_LIST_ROW_CLASS}>
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
                  <div className={`max-h-60 ${CREATE_CHAT_LIST_SCROLL_BASE_CLASS}`}>
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
                          isUnarchivePending={vm.unarchivePendingStreamIds.includes(
                            channel.streamId,
                          )}
                          onOpenChannel={handleOpenArchivedChannel}
                          onUnarchive={vm.onUnarchiveArchivedChannel}
                        />
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className={CREATE_CHAT_FOOTER_CLASS}>
              {vm.tab === "group" && (
                <>
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
                </>
              )}
              {vm.tab === "channel" && (
                <>
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
                </>
              )}
              {(vm.tab === "dm" || vm.tab === "archived") && (
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="hover:bg-bg/50 rounded-lg px-3 py-1.5 text-sm text-text-muted"
                  >
                    {t("common.cancel")}
                  </button>
                </Dialog.Close>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

interface ArchivedChannelRowProps {
  streamId: number;
  name: string;
  lastMessage: string;
  time: string;
  isUnarchivePending: boolean;
  onOpenChannel: (streamId: number, streamName: string) => void;
  onUnarchive: (streamId: number) => Promise<void>;
}

/** Строка архивированного канала: клик по области открывает чат, отдельная кнопка — только разархивирование. */
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
      // Что делает: не даём клику «всплыть» до кнопки-строки, иначе уйдём в канал и стартанём unarchive одновременно.
      event.stopPropagation();
      void onUnarchive(streamId);
    },
    [onUnarchive, streamId],
  );

  const previewLine =
    `${lastMessage || t("channel.archivedChannels")}${time ? ` · ${time}` : ""}`.trim();

  return (
    <div className={CREATE_CHAT_LIST_COMPOSITE_ROW_CLASS}>
      <button
        type="button"
        onClick={handleRowClick}
        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm text-text-primary"
      >
        <Avatar size="sm">#</Avatar>
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
