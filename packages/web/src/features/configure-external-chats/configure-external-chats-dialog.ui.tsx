import React from "react";
import type { ExternalAccount } from "~/entities/external-account/external-account.types";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { t } from "~/i18n/i18n";
import { AppDialog } from "~/shared/ui/app-dialog.ui";
import {
  ExternalChatCatalogActions,
  ExternalChatCatalogContent,
  ExternalChatHistorySettings,
} from "./configure-external-chats-content.ui";
import { useConfigureExternalChats } from "./configure-external-chats.hook";

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
      description={
        account.settings.selectionMode === "all"
          ? t("configureExternalChats.automaticDescription")
          : t("configureExternalChats.description")
      }
      maxWidthClassName="max-w-2xl"
      positionClassName="top-1/2 -translate-y-1/2"
      scrollBody
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          {/* Dismiss is the header X from AppDialog; footer keeps status + Sync only. */}
          <ExternalChatCatalogActions vm={vm} />
        </div>
      }
    >
      <ExternalChatHistorySettings vm={vm} />
      <ExternalChatCatalogContent vm={vm} preparing={!account.liveReady} />
    </AppDialog>
  );
});
