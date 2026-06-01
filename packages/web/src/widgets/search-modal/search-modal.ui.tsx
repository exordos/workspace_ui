import * as Dialog from "@radix-ui/react-dialog";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { formatUserStatusLabel } from "~/entities/user/user-status.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { t } from "~/i18n/i18n";
import { fetchMessages } from "~/shared/api/zulip-messages";
import type { MockMessage } from "~/shared/api/zulip.types";
import { SEARCH_INPUT_DEBOUNCE_MS } from "~/shared/config/constants";
import { getPresenceState } from "~/shared/lib/format";
import { AppDialogShell, APP_DIALOG_CONTENT_BASE_CLASS } from "~/shared/ui/app-dialog.ui";
import { ScrollArea } from "~/shared/ui/scroll-area";
import { SearchInput } from "~/shared/ui/search-input";
import { filterSearchMessages } from "./search-modal-filters.lib";
import { MAX_USER_RESULTS, SearchResultItem, UserResultItem } from "./search-modal-result-items.ui";
import { useSearchModalStore } from "./search-modal.model";
import type { SearchModalProps } from "./search-modal.types";

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

  const runSearch = useCallback(
    async (q: string) => {
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
    },
    [setLoading, setResults],
  );

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

  const filteredMessageResults = useMemo(
    () => filterSearchMessages(results, users, streamFilter, senderFilter, dateFilter),
    [dateFilter, results, senderFilter, streamFilter, users],
  );

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      void runSearch(query);
    }, SEARCH_INPUT_DEBOUNCE_MS);
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

  const contentClassName = `${APP_DIALOG_CONTENT_BASE_CLASS} top-[16%] flex max-h-[68vh] max-w-2xl flex-col overflow-hidden bg-card-bg p-0 shadow-2xl`;

  return (
    <AppDialogShell open={open} onOpenChange={onOpenChange} contentClassName={contentClassName}>
      <Dialog.Description className="sr-only">{t("search.search")}</Dialog.Description>
      <div className="border-b border-border-subtle px-5 py-4">
        <SearchInput
          ref={inputRef}
          type="text"
          size="md"
          value={query}
          onChange={setQuery}
          placeholder={t("search.search")}
          ariaLabel={t("search.search")}
          className="border-border-subtle bg-bg transition-colors focus-within:border-accent-soft focus-within:bg-bg-elevated focus-within:outline-none"
        />
      </div>
      <div className="grid grid-cols-1 gap-2 border-b border-border-subtle px-5 py-3 sm:grid-cols-3">
        <input
          type="text"
          value={streamFilter}
          onChange={(event) => setStreamFilter(event.target.value)}
          placeholder={t("search.filterStream")}
          className="rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus-visible:bg-bg-elevated"
        />
        <input
          type="text"
          value={senderFilter}
          onChange={(event) => setSenderFilter(event.target.value)}
          placeholder={t("search.filterSender")}
          className="rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus-visible:bg-bg-elevated"
        />
        <input
          aria-label={t("search.filterDate")}
          type="date"
          value={dateFilter}
          onChange={(event) => setDateFilter(event.target.value)}
          className="rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus-visible:bg-bg-elevated"
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
              <SearchResultItem key={msg.id} msg={msg} onSelect={() => handleSelectMessage(msg)} />
            ))}
          </ul>
        )}
      </ScrollArea>
    </AppDialogShell>
  );
};
