import React, { useMemo, useState } from "react";
import type { ExternalAccount } from "~/entities/external-account/external-account.types";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { t } from "~/i18n/i18n";
import type { WorkspaceExternalChatDto } from "~/shared/api/messenger-external-accounts.types";
import { useExternalAccountSync } from "./manage-external-account.hook";

export interface ManageExternalAccountProps {
  runtimeContext: WorkspaceRuntimeContext;
  account: ExternalAccount;
}

const INPUT_CLASS =
  "min-h-10 w-full rounded-lg border border-border-subtle bg-bg px-3 text-sm text-text-primary outline-none focus:border-accent";

function chatTypeLabel(chat: WorkspaceExternalChatDto): string {
  return t(`externalAccountSync.chatTypes.${chat.source.chat_type}`);
}

function ChatCatalog({
  vm,
  visibleChats,
}: Readonly<{
  vm: ReturnType<typeof useExternalAccountSync>;
  visibleChats: WorkspaceExternalChatDto[];
}>) {
  if (vm.loadingChats) {
    return <p className="mt-3 text-xs text-text-muted">{t("externalAccountSync.loadingChats")}</p>;
  }
  if (vm.chats.length === 0) {
    return (
      <p className="mt-3 rounded-lg bg-bg-elevated px-3 py-3 text-xs text-text-secondary">
        {t("externalAccountSync.noChats")}
      </p>
    );
  }
  if (visibleChats.length === 0) {
    return <p className="mt-3 text-xs text-text-muted">{t("externalAccountSync.noMatches")}</p>;
  }
  return (
    <ul className="mt-3 max-h-72 space-y-2 overflow-auto pr-1">
      {visibleChats.map((chat) => (
        <li key={chat.uuid}>
          <label className="flex min-h-12 items-center gap-3 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2">
            <input
              type="checkbox"
              checked={chat.selected}
              disabled={
                vm.selectionMode === "all" || chat.transition_pending || vm.changingChatUuid != null
              }
              onChange={() => vm.toggleChat(chat)}
              className="h-4 w-4 accent-accent"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-text-primary">{chat.display_name}</span>
              <span className="block text-[11px] text-text-muted">
                {chatTypeLabel(chat)} · {t(`externalAccountSync.chatStatuses.${chat.status}`)}
              </span>
              {chat.safe_error != null && (
                <span className="block text-[11px] text-notice-base">{chat.safe_error}</span>
              )}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

export const ManageExternalAccount = React.memo<ManageExternalAccountProps>(
  function ManageExternalAccount({ runtimeContext, account }) {
    const vm = useExternalAccountSync(runtimeContext, account);
    const [query, setQuery] = useState("");
    const visibleChats = useMemo(() => {
      const normalizedQuery = query.trim().toLocaleLowerCase();
      if (normalizedQuery.length === 0) return vm.chats;
      return vm.chats.filter((chat) =>
        chat.display_name.toLocaleLowerCase().includes(normalizedQuery),
      );
    }, [query, vm.chats]);
    const selectedCount = vm.chats.filter((chat) => chat.selected).length;

    return (
      <section
        className="rounded-xl border border-border-subtle bg-card-bg p-4"
        data-testid="external-account-sync-settings"
      >
        <h2 className="text-sm font-semibold text-text-primary">
          {t("externalAccountSync.title")}
        </h2>
        <p className="mt-1 text-xs text-text-secondary">{t("externalAccountSync.description")}</p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-text-secondary">
            <span className="mb-1 block">{t("externalAccountSync.selectionMode")}</span>
            <select
              className={INPUT_CLASS}
              value={vm.selectionMode}
              onChange={(event) =>
                vm.setSelectionMode(event.target.value === "all" ? "all" : "explicit")
              }
            >
              <option value="explicit">{t("externalAccountSync.selectionModes.explicit")}</option>
              <option value="all">{t("externalAccountSync.selectionModes.all")}</option>
            </select>
          </label>
          <label className="block text-xs text-text-secondary">
            <span className="mb-1 block">{t("externalAccountSync.historyDepth")}</span>
            <select
              className={INPUT_CLASS}
              value={vm.historyDepth}
              onChange={(event) => {
                const value = event.target.value;
                if (
                  value === "new" ||
                  value === "7_days" ||
                  value === "30_days" ||
                  value === "90_days" ||
                  value === "all"
                ) {
                  vm.setHistoryDepth(value);
                }
              }}
            >
              <option value="new">{t("externalAccountSync.historyDepths.new")}</option>
              <option value="7_days">{t("externalAccountSync.historyDepths.7_days")}</option>
              <option value="30_days">{t("externalAccountSync.historyDepths.30_days")}</option>
              <option value="90_days">{t("externalAccountSync.historyDepths.90_days")}</option>
              <option value="all">{t("externalAccountSync.historyDepths.all")}</option>
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={vm.saveSettings}
            disabled={vm.savingSettings}
            className="min-h-10 rounded-lg bg-accent px-3 text-sm font-medium text-on-accent disabled:opacity-50"
          >
            {vm.savingSettings ? t("externalAccountSync.saving") : t("externalAccountSync.save")}
          </button>
          {vm.saved && (
            <span role="status" className="text-xs text-accent">
              {t("externalAccountSync.saved")}
            </span>
          )}
        </div>

        {vm.error != null && (
          <p role="alert" className="mt-3 text-xs text-notice-base">
            {t(`externalAccountSync.errors.${vm.error}`)}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h4 className="text-sm font-medium text-text-primary">
              {t("externalAccountSync.chats")}
            </h4>
            <p className="text-xs text-text-muted">
              {t("externalAccountSync.selectedCount", {
                selected: selectedCount,
                total: vm.chats.length,
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={vm.reloadChats}
            disabled={vm.loadingChats}
            className="min-h-9 rounded-lg border border-border-subtle px-3 text-xs text-text-secondary disabled:opacity-50"
          >
            {t("externalAccountSync.refresh")}
          </button>
        </div>

        {vm.selectionMode === "all" && (
          <p className="mt-2 rounded-lg bg-bg-elevated px-3 py-2 text-xs text-text-secondary">
            {t("externalAccountSync.allChatsHint")}
          </p>
        )}

        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("externalAccountSync.search")}
          aria-label={t("externalAccountSync.search")}
          className={`${INPUT_CLASS} mt-3`}
        />

        <ChatCatalog vm={vm} visibleChats={visibleChats} />
      </section>
    );
  },
);
