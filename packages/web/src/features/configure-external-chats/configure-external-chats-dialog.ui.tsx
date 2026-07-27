import React from "react";
import type { ExternalAccount } from "~/entities/external-account/external-account.types";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { t } from "~/i18n/i18n";
import { AppDialog, DialogCancelButton } from "~/shared/ui/app-dialog.ui";
import { Button } from "~/shared/ui/button";
import { useConfigureExternalChats } from "./configure-external-chats.hook";

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
                disabled={vm.submitting}
                onClick={vm.retryFailed}
              >
                {t("configureExternalChats.retryFailed")}
              </Button>
            ) : null}
            <Button
              type="button"
              disabled={vm.submitting || vm.pending.size === 0}
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
                  disabled={!canChoose || vm.submitting}
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
