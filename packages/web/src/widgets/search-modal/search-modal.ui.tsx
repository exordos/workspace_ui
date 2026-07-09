import * as Dialog from "@radix-ui/react-dialog";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  resolveUserPresenceVisual,
  selectUserDisplayName,
  selectUserStatusLabel,
  selectUsersByIds,
} from "~/entities/user/user-selectors.lib";
import { useUsersStore } from "~/entities/user/user.model";
import type { User } from "~/entities/user/user.types";
import { t } from "~/i18n/i18n";
import { AppDialogShell, APP_DIALOG_CONTENT_BASE_CLASS } from "~/shared/ui/app-dialog.ui";
import { ScrollArea } from "~/shared/ui/scroll-area";
import { SearchInput } from "~/shared/ui/search-input";
import { MAX_USER_RESULTS, UserResultItem } from "./search-modal-result-items.ui";
import { useSearchModalStore } from "./search-modal.model";
import type { SearchModalProps } from "./search-modal.types";

function normalizeSearchValue(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
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

function getNonEmptyValue(value: string | null | undefined): string | undefined {
  const normalizedValue = value?.trim() ?? "";
  return normalizedValue.length > 0 ? normalizedValue : undefined;
}

export const SearchModal: React.FC<SearchModalProps> = ({
  open,
  onOpenChange,
  onSelectUserUuid,
  mode = "zulip",
}) => {
  const query = useSearchModalStore((s) => s.query);
  const setQuery = useSearchModalStore((s) => s.setQuery);
  const resetStore = useSearchModalStore((s) => s.reset);
  const usersById = useUsersStore((s) => s.usersById);
  const userIds = useUsersStore((s) => s.userIds);
  const inputRef = useRef<HTMLInputElement>(null);
  const workspaceMode = mode === "workspace";
  const allUsers = useMemo(() => selectUsersByIds(usersById, userIds), [userIds, usersById]);

  const userResults = useMemo<
    {
      userUuid: string;
      fullName: string;
      email?: string;
      statusLabel?: string;
      presenceState: "active" | "idle" | "offline" | null;
    }[]
  >(() => {
    const normalizedQuery = normalizeSearchValue(query);
    return allUsers
      .filter((user) => matchesUserQuery(user, normalizedQuery))
      .map((user) => {
        return {
          userUuid: user.uuid,
          fullName: selectUserDisplayName(user),
          email: user.email ?? undefined,
          statusLabel: getNonEmptyValue(selectUserStatusLabel(user)),
          presenceState: resolveUserPresenceVisual(user.status),
        };
      })
      .filter((user): user is NonNullable<typeof user> => user != null)
      .slice(0, MAX_USER_RESULTS);
  }, [allUsers, query]);

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

  const handleSelectUser = useCallback(
    (user: { userUuid: string }) => {
      if (workspaceMode) {
        if (onSelectUserUuid?.(user.userUuid) === true) {
          onOpenChange(false);
        }
        return;
      }
      onOpenChange(false);
    },
    [onOpenChange, onSelectUserUuid, workspaceMode],
  );

  const noResults = query.trim() && userResults.length === 0;

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
      <ScrollArea className="flex-1 px-3 py-2">
        {noResults && (
          <p className="py-4 text-center text-sm text-text-muted">{t("search.noResults")}</p>
        )}
        {userResults.length > 0 && (
          <div className="mb-2">
            <p className="px-3 pb-1 pt-2 text-[11px] uppercase tracking-wide text-text-muted">
              {t("dm.startChat")}
            </p>
            <ul className="space-y-0.5">
              {userResults.map((user) => (
                <UserResultItem
                  key={user.userUuid}
                  userIdentity={user.userUuid}
                  fullName={user.fullName}
                  email={user.email}
                  statusLabel={user.statusLabel}
                  presenceState={user.presenceState}
                  onSelect={() => handleSelectUser(user)}
                />
              ))}
            </ul>
          </div>
        )}
      </ScrollArea>
    </AppDialogShell>
  );
};
