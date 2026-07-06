import * as Dialog from "@radix-ui/react-dialog";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  resolveUserPresenceVisual,
  selectUserDisplayName,
  selectUsersByIds,
} from "~/entities/user/user-selectors.lib";
import { useUsersStore } from "~/entities/user/user.model";
import type { User } from "~/entities/user/user.types";
import { t } from "~/i18n/i18n";
import { fetchMessages } from "~/shared/api/zulip-messages";
import type { MockMessage, RealmEmoji } from "~/shared/api/zulip.types";
import { SEARCH_INPUT_DEBOUNCE_MS } from "~/shared/config/constants";
import { getCachedRealmEmojis } from "~/shared/lib/realm-emojis-cache";
import { AppDialogShell, APP_DIALOG_CONTENT_BASE_CLASS } from "~/shared/ui/app-dialog.ui";
import { ScrollArea } from "~/shared/ui/scroll-area";
import { SearchInput } from "~/shared/ui/search-input";
import { filterSearchMessages } from "./search-modal-filters.lib";
import { MAX_USER_RESULTS, SearchResultItem, UserResultItem } from "./search-modal-result-items.ui";
import { useSearchModalStore } from "./search-modal.model";
import type { SearchModalProps } from "./search-modal.types";

function normalizeSearchValue(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function resolveNumericUserId(user: User): number | null {
  const legacyUserId = (user as { user_id?: unknown }).user_id;
  return typeof legacyUserId === "number" && Number.isSafeInteger(legacyUserId) && legacyUserId > 0
    ? legacyUserId
    : null;
}

function matchesUserQuery(user: User, query: string): boolean {
  if (query.length === 0) {
    return false;
  }
  return (
    normalizeSearchValue(selectUserDisplayName(user)).includes(query) ||
    normalizeSearchValue(user.username).includes(query) ||
    normalizeSearchValue(user.email).includes(query) ||
    normalizeSearchValue(user.statusText).includes(query) ||
    normalizeSearchValue(user.statusEmoji).includes(query)
  );
}

function findRealmEmoji(realmEmojis: readonly RealmEmoji[], statusEmojiName: string) {
  const normalizedStatusEmojiName = statusEmojiName.toLowerCase();
  return realmEmojis.find((emoji) => {
    if (emoji.id === statusEmojiName) {
      return true;
    }
    return emoji.names.some((name) => name.toLowerCase() === normalizedStatusEmojiName);
  });
}

function getNonEmptyValue(value: string | null | undefined): string | undefined {
  const normalizedValue = value?.trim() ?? "";
  return normalizedValue.length > 0 ? normalizedValue : undefined;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  open,
  onOpenChange,
  onSelectMessage,
  onSelectUser,
  onSelectUserUuid,
  mode = "zulip",
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
  const usersById = useUsersStore((s) => s.usersById);
  const userIds = useUsersStore((s) => s.userIds);
  const inputRef = useRef<HTMLInputElement>(null);
  const users = useMemo(() => new Map(), []);
  const workspaceMode = mode === "workspace";
  const allUsers = useMemo(() => selectUsersByIds(usersById, userIds), [userIds, usersById]);
  const realmEmojis = getCachedRealmEmojis();

  const runSearch = useCallback(
    async (q: string) => {
      if (workspaceMode) {
        // Workspace message search пока отсутствует в API, поэтому здесь нет
        // message body для summary/snippet. Поверхность остается поиском людей.
        setResults([]);
        setLoading(false);
        return;
      }
      if (!q.trim()) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const list = await fetchMessages(undefined, undefined, q);
        setResults(list);
      } finally {
        setLoading(false);
      }
    },
    [setLoading, setResults, workspaceMode],
  );

  const userResults = useMemo<
    {
      userUuid: string;
      userId?: number;
      fullName: string;
      email?: string;
      statusLabel?: string;
      statusEmoji?: { name: string; imgUrl: string };
      presenceState: "active" | "idle" | "offline" | null;
    }[]
  >(() => {
    const normalizedQuery = normalizeSearchValue(query);
    return allUsers
      .filter((user) => matchesUserQuery(user, normalizedQuery))
      .map((user) => {
        const userId = resolveNumericUserId(user);
        const statusEmojiName = user.statusEmoji?.trim() ?? "";
        const realmEmoji = findRealmEmoji(realmEmojis, statusEmojiName);
        return {
          userUuid: user.uuid,
          ...(userId != null ? { userId } : {}),
          fullName: selectUserDisplayName(user),
          email: user.email ?? undefined,
          statusLabel: getNonEmptyValue(user.statusText),
          statusEmoji:
            realmEmoji != null && statusEmojiName.length > 0
              ? { name: statusEmojiName, imgUrl: realmEmoji.imgUrl }
              : undefined,
          presenceState: resolveUserPresenceVisual(user.status),
        };
      })
      .filter((user): user is NonNullable<typeof user> => user != null)
      .slice(0, MAX_USER_RESULTS);
  }, [allUsers, query, realmEmojis]);

  const filteredMessageResults = useMemo(
    () =>
      workspaceMode
        ? []
        : filterSearchMessages(results, users, streamFilter, senderFilter, dateFilter),
    [dateFilter, results, senderFilter, streamFilter, users, workspaceMode],
  );

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      void runSearch(query);
    }, SEARCH_INPUT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, open, runSearch, setLoading, setResults, workspaceMode]);

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
    (user: { userId?: number; userUuid: string }) => {
      if (workspaceMode) {
        if (onSelectUserUuid?.(user.userUuid) === true) {
          onOpenChange(false);
        }
        return;
      } else if (user.userId != null) {
        onSelectUser?.(user.userId);
      }
      onOpenChange(false);
    },
    [onOpenChange, onSelectUser, onSelectUserUuid, workspaceMode],
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
      {!workspaceMode && (
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
      )}
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
                  key={user.userUuid}
                  userIdentity={user.userUuid}
                  userId={user.userId}
                  fullName={user.fullName}
                  email={user.email}
                  statusLabel={user.statusLabel}
                  statusEmoji={user.statusEmoji}
                  presenceState={user.presenceState}
                  onSelect={() => handleSelectUser(user)}
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
