import React from "react";
import type {
  ExternalAccount,
  ExternalAccountHistoryDepth,
} from "~/entities/external-account/external-account.types";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { t } from "~/i18n/i18n";
import { AppDialog, DialogCancelButton } from "~/shared/ui/app-dialog.ui";
import { Button } from "~/shared/ui/button";
import { useConfigureExternalChats } from "./configure-external-chats.hook";

const HISTORY_DEPTH_OPTIONS: readonly ExternalAccountHistoryDepth[] = [
  "new",
  "7_days",
  "30_days",
  "90_days",
  "all",
];

function statusText(status: string): string {
  return t(`configureExternalChats.status.${status}`);
}

export const ConfigureExternalChatsDialog = React.memo<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runtimeContext: WorkspaceRuntimeContext;
  account: ExternalAccount;
}>(function ConfigureExternalChatsDialog({ open, onOpenChange, runtimeContext, account }) {
  const vm = useConfigureExternalChats({ open, runtimeContext, account });
  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("configureExternalChats.title")}
      description={t("configureExternalChats.description")}
      maxWidthClassName="max-w-2xl"
      positionClassName="top-1/2 -translate-y-1/2"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <span className="text-xs text-text-muted">
            {t("configureExternalChats.ready", {
              ready: vm.readyCount,
              total: vm.selectedCount,
            })}
          </span>
          <div className="flex gap-2">
            {vm.failed.size > 0 ? (
              <Button
                type="button"
                variant="ghost"
                disabled={vm.submitting || vm.selectionBlockedBySettings}
                onClick={vm.retryFailed}
              >
                {t("configureExternalChats.retryFailed")}
              </Button>
            ) : null}
            <Button
              type="button"
              disabled={vm.submitting || vm.pending.size === 0 || vm.selectionBlockedBySettings}
              onClick={vm.start}
            >
              {vm.submitting
                ? t("configureExternalChats.starting")
                : t("configureExternalChats.start", { count: vm.pending.size })}
            </Button>
            <DialogCancelButton onClick={() => onOpenChange(false)}>
              {t("common.close")}
            </DialogCancelButton>
          </div>
        </div>
      }
    >
      <section
        className="mb-4 rounded-lg border border-border-subtle bg-bg-elevated p-3"
        aria-labelledby="external-chat-history-depth-title"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3
              id="external-chat-history-depth-title"
              className="text-sm font-medium text-text-primary"
            >
              {t("configureExternalChats.historyDepth.title")}
            </h3>
            <p className="mt-1 text-xs text-text-muted">
              {t("configureExternalChats.historyDepth.description")}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            disabled={!vm.canSaveHistoryDepth}
            onClick={vm.saveHistoryDepth}
          >
            {vm.saveStatus === "saving"
              ? t("configureExternalChats.historyDepth.saving")
              : t("configureExternalChats.historyDepth.save")}
          </Button>
        </div>

        <div
          role="radiogroup"
          aria-label={t("configureExternalChats.historyDepth.title")}
          className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5"
        >
          {HISTORY_DEPTH_OPTIONS.map((value) => {
            const checked = vm.historyDepth === value;
            return (
              <label
                key={value}
                className={`focus-within:ring-accent/40 flex cursor-pointer items-center justify-center rounded-md border px-2 py-2 text-center text-xs transition-colors focus-within:ring-2 ${
                  checked
                    ? "border-accent/50 bg-accent-soft text-accent"
                    : "border-border-subtle bg-bg text-text-muted hover:text-text-primary"
                } ${vm.settingsBusy || vm.submitting ? "cursor-not-allowed opacity-60" : ""}`}
              >
                <input
                  type="radio"
                  name="external-chat-history-depth"
                  value={value}
                  checked={checked}
                  disabled={vm.settingsBusy || vm.submitting || vm.unsupportedSelectionMode}
                  onChange={() => vm.changeHistoryDepth(value)}
                  className="sr-only"
                />
                {t(`configureExternalChats.historyDepth.options.${value}`)}
              </label>
            );
          })}
        </div>

        {vm.historyDepthDirty && vm.selectedCount > 0 ? (
          <p
            className="border-notice-base/30 bg-notice-base/10 mt-3 rounded-md border px-3 py-2 text-xs text-notice-base"
            role="status"
          >
            {t("configureExternalChats.historyDepth.selectedWarning", {
              count: vm.selectedCount,
            })}
          </p>
        ) : null}
        {vm.unsupportedSelectionMode ? (
          <p className="mt-3 text-xs text-danger" role="alert">
            {t("configureExternalChats.historyDepth.unsupportedMode")}
          </p>
        ) : vm.saveStatus === "conflict" ? (
          <div
            className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-danger"
            role="alert"
          >
            <span>{t("configureExternalChats.historyDepth.conflict")}</span>
            <Button
              type="button"
              variant="ghost"
              disabled={vm.settingsBusy || vm.submitting}
              onClick={vm.reloadAccountSettings}
            >
              {t("configureExternalChats.historyDepth.loadCurrent")}
            </Button>
          </div>
        ) : vm.saveStatus === "error" ? (
          <p className="mt-3 text-xs text-danger" role="alert">
            {t("configureExternalChats.historyDepth.saveError")}
          </p>
        ) : vm.saveStatus === "success" ? (
          <p className="mt-3 text-xs text-accent" role="status">
            {t("configureExternalChats.historyDepth.saved")}
          </p>
        ) : null}
        {vm.selectionBlockedBySettings ? (
          <p className="mt-2 text-xs text-text-muted">
            {vm.saveStatus === "saving"
              ? t("configureExternalChats.historyDepth.selectBlockedSaving")
              : t("configureExternalChats.historyDepth.selectBlockedDirty")}
          </p>
        ) : null}
      </section>

      <input
        value={vm.query}
        onChange={(event) => vm.setQuery(event.target.value)}
        placeholder={t("configureExternalChats.search")}
        aria-label={t("configureExternalChats.search")}
        className="mb-3 w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary"
      />
      {vm.loadStatus === "loading" && vm.chats.length === 0 ? (
        <p role="status" className="py-8 text-center text-sm text-text-muted">
          {t("configureExternalChats.loading")}
        </p>
      ) : vm.loadStatus === "error" ? (
        <div role="alert" className="py-6 text-center text-sm text-danger">
          <p>{t("configureExternalChats.loadError")}</p>
          <Button type="button" variant="ghost" className="mt-2" onClick={vm.refresh}>
            {t("common.retry")}
          </Button>
        </div>
      ) : vm.chats.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-muted">
          {vm.query.trim().length > 0
            ? t("configureExternalChats.noSearchResults")
            : t("configureExternalChats.empty")}
        </p>
      ) : (
        <ul className="max-h-[50vh] space-y-2 overflow-auto">
          {vm.chats.map((chat) => {
            const canChoose = !chat.selected && !chat.transitionPending;
            return (
              <li
                key={chat.uuid}
                className="flex items-center gap-3 rounded-lg border border-border-subtle px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={chat.selected || vm.pending.has(chat.uuid)}
                  disabled={!canChoose || vm.submitting || vm.selectionBlockedBySettings}
                  onChange={() => vm.toggle(chat.uuid)}
                  aria-label={chat.displayName}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-text-primary">{chat.displayName}</p>
                  <p className="text-xs text-text-muted">{statusText(chat.status)}</p>
                  {chat.safeError != null ? (
                    <p className="mt-1 break-words text-xs text-danger">{chat.safeError}</p>
                  ) : null}
                </div>
                {vm.failed.has(chat.uuid) ? (
                  <span className="text-xs text-danger">
                    {t("configureExternalChats.requestFailed")}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </AppDialog>
  );
});
