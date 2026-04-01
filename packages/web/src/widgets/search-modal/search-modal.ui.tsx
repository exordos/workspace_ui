import * as Dialog from "@radix-ui/react-dialog";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUsersStore } from "~/entities/user/user.model";
import { formatUserStatusLabel } from "~/entities/user/user-status.lib";
import { t } from "~/i18n/i18n";
import { fetchMessages } from "~/shared/api/zulip-messages";
import type { MockMessage } from "~/shared/api/zulip.types";
import { getPresenceState } from "~/shared/lib/format";
import { stripHtml } from "~/shared/lib/html";
import { Icon } from "~/shared/ui/icon";
import { PresenceIndicator } from "~/shared/ui/presence-indicator";
import { ScrollArea } from "~/shared/ui/scroll-area";
import { useSearchModalStore } from "./search-modal.model";
import type { SearchModalProps } from "./search-modal.types";

const DEBOUNCE_MS = 300;
const MAX_USER_RESULTS = 20;

const SearchResultItem = React.memo(function SearchResultItem({
  msg,
  onSelect,
}: {
  msg: MockMessage;
  onSelect: () => void;
}) {
  const senderName = useUsersStore((s) => s.getDisplayName(msg.sender_id));
  const displayName = senderName !== "Unknown" ? senderName : msg.sender_full_name;
  return (
    <li>
      <div className="hover:bg-bg/60 group flex items-start gap-2 rounded-lg px-3 py-2 transition-colors">
        <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left text-sm">
          <div className="mb-0.5 flex items-center gap-2 text-[11px] text-text-muted">
            <span>{displayName}</span>
            <span>·</span>
            <span>
              #{msg.channel ?? "?"} › #{msg.subject}
            </span>
          </div>
          <p className="line-clamp-2 truncate text-text-primary">{stripHtml(msg.content)}</p>
        </button>
        <button
          type="button"
          onClick={onSelect}
          className="hover:bg-bg-elevated/70 mt-0.5 rounded p-1 text-text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-text-primary"
          aria-label={t("message.openInChat")}
          title={t("message.openInChat")}
        >
          <Icon name="newWindow" size={16} className="text-current" />
        </button>
      </div>
    </li>
  );
});

const UserResultItem = React.memo(function UserResultItem({
  userId,
  fullName,
  email,
  statusLabel,
  presenceState,
  onSelect,
}: {
  userId: number;
  fullName: string;
  email?: string;
  statusLabel?: string;
  presenceState: "active" | "idle" | "offline" | null;
  onSelect: () => void;
}) {
  const secondaryText = statusLabel ?? email ?? "";
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="hover:bg-bg/60 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors"
        aria-label={`${fullName} (${email ?? userId})`}
      >
        <PresenceIndicator status={presenceState} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-text-primary">{fullName}</span>
          {secondaryText.length > 0 && (
            <span className="block truncate text-[11px] text-text-secondary">{secondaryText}</span>
          )}
        </span>
        <span className="ml-2 shrink-0 text-[11px] text-text-muted">#{userId}</span>
      </button>
    </li>
  );
});

export const SearchModal: React.FC<SearchModalProps> = ({
  open,
  onOpenChange,
  onSelectMessage,
  onSelectUser,
}) => {
  const query = useSearchModalStore((s) => s.query);
  const setQuery = useSearchModalStore((s) => s.setQuery);
  const results = useSearchModalStore((s) => s.results);
  const setResults = useSearchModalStore((s) => s.setResults);
  const streamFilter = useSearchModalStore((s) => s.streamFilter);
  const setStreamFilter = useSearchModalStore((s) => s.setStreamFilter);
  const senderFilter = useSearchModalStore((s) => s.senderFilter);
  const setSenderFilter = useSearchModalStore((s) => s.setSenderFilter);
  const dateFilter = useSearchModalStore((s) => s.dateFilter);
  const setDateFilter = useSearchModalStore((s) => s.setDateFilter);
  const loading = useSearchModalStore((s) => s.loading);
  const setLoading = useSearchModalStore((s) => s.setLoading);
  const resetStore = useSearchModalStore((s) => s.reset);
  const inputRef = useRef<HTMLInputElement>(null);
  const users = useUsersStore((s) => s.users);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const list = await fetchMessages(undefined, undefined, q);
      for (const msg of list) {
        useUsersStore.getState().mergeUser({
          user_id: msg.sender_id,
          full_name: msg.sender_full_name ?? "",
        });
      }
      setResults(list);
    } finally {
      setLoading(false);
    }
  }, []);

  const userResults = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];
    return Array.from(users.values())
      .filter((user) => {
        if (user.full_name.toLowerCase().includes(normalizedQuery)) return true;
        return user.email?.toLowerCase().includes(normalizedQuery) ?? false;
      })
      .slice(0, MAX_USER_RESULTS)
      .map((user) => ({
        userId: user.user_id,
        fullName: user.full_name,
        email: user.email,
        statusLabel: formatUserStatusLabel(user.status) ?? undefined,
        presenceState:
          user.presence != null
            ? getPresenceState(user.presence.timestamp, user.presence.status)
            : null,
      }));
  }, [query, users]);

  const filteredMessageResults = useMemo(() => {
    const normalizedStreamFilter = streamFilter.trim().toLowerCase();
    const normalizedSenderFilter = senderFilter.trim().toLowerCase();
    const normalizedDateFilter = dateFilter.trim();
    return results.filter((msg) => {
      const channelName = (msg.channel ?? "").toLowerCase();
      const messageSender = (msg.sender_full_name ?? "").toLowerCase();
      const senderFromStore = (users.get(msg.sender_id)?.full_name ?? "").toLowerCase();
      const matchesStream =
        normalizedStreamFilter.length === 0 || channelName.includes(normalizedStreamFilter);
      const matchesSender =
        normalizedSenderFilter.length === 0 ||
        messageSender.includes(normalizedSenderFilter) ||
        senderFromStore.includes(normalizedSenderFilter);
      const messageDate = new Date(msg.timestamp * 1000).toISOString().slice(0, 10);
      const matchesDate = normalizedDateFilter.length === 0 || messageDate === normalizedDateFilter;
      return matchesStream && matchesSender && matchesDate;
    });
  }, [dateFilter, results, senderFilter, streamFilter, users]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      void runSearch(query);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, open, runSearch]);

  useEffect(() => {
    if (!open) {
      resetStore();
    }
  }, [open, resetStore]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [open]);

  const handleSelectMessage = useCallback(
    (msg: MockMessage) => {
      onSelectMessage(msg);
      onOpenChange(false);
    },
    [onOpenChange, onSelectMessage],
  );

  const handleSelectUser = useCallback(
    (userId: number) => {
      onSelectUser?.(userId);
      onOpenChange(false);
    },
    [onOpenChange, onSelectUser],
  );

  const noResults =
    !loading && query.trim() && filteredMessageResults.length === 0 && userResults.length === 0;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-overlay bg-black/50" />
        <Dialog.Content
          className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed left-1/2 top-[16%] z-modal flex max-h-[68vh] w-full max-w-2xl -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-border-subtle bg-card-bg shadow-2xl"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <div className="border-b border-border-subtle px-5 py-4">
            <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-bg px-3 py-2 transition-colors focus-within:bg-bg-elevated focus-within:outline-none">
              <Icon name="search" size={20} className="shrink-0 text-text-muted" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("search.search")}
                className="flex-1 bg-transparent text-base text-text-primary placeholder:text-text-muted focus-visible:outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 border-b border-border-subtle px-5 py-3 sm:grid-cols-3">
            <input
              type="text"
              value={streamFilter}
              onChange={(event) => setStreamFilter(event.target.value)}
              placeholder={t("search.filterStream")}
              className="rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus-visible:bg-bg-elevated focus-visible:outline-none"
            />
            <input
              type="text"
              value={senderFilter}
              onChange={(event) => setSenderFilter(event.target.value)}
              placeholder={t("search.filterSender")}
              className="rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus-visible:bg-bg-elevated focus-visible:outline-none"
            />
            <input
              aria-label={t("search.filterDate")}
              type="date"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              className="rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none transition-colors focus-visible:bg-bg-elevated focus-visible:outline-none"
            />
          </div>
          <ScrollArea className="flex-1 px-3 py-2">
            {loading && (
              <p className="py-4 text-center text-sm text-text-muted">{t("search.search")}...</p>
            )}
            {noResults && (
              <p className="py-4 text-center text-sm text-text-muted">{t("search.noResults")}</p>
            )}
            {!loading && userResults.length > 0 && (
              <div className="mb-2">
                <p className="px-3 pb-1 pt-2 text-[11px] uppercase tracking-wide text-text-muted">
                  {t("dm.startChat")}
                </p>
                <ul className="space-y-0.5">
                  {userResults.map((user) => (
                    <UserResultItem
                      key={user.userId}
                      userId={user.userId}
                      fullName={user.fullName}
                      email={user.email}
                      statusLabel={user.statusLabel}
                      presenceState={user.presenceState}
                      onSelect={() => handleSelectUser(user.userId)}
                    />
                  ))}
                </ul>
              </div>
            )}
            {!loading && filteredMessageResults.length > 0 && (
              <ul className="space-y-0.5">
                {filteredMessageResults.map((msg) => (
                  <SearchResultItem
                    key={msg.id}
                    msg={msg}
                    onSelect={() => handleSelectMessage(msg)}
                  />
                ))}
              </ul>
            )}
          </ScrollArea>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
