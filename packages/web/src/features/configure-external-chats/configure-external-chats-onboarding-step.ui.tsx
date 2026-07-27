import React from "react";
import type { ExternalAccount } from "~/entities/external-account/external-account.types";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  ExternalChatCatalogActions,
  ExternalChatCatalogContent,
} from "./configure-external-chats-content.ui";
import { useConfigureExternalChats } from "./configure-external-chats.hook";

export const ConfigureExternalChatsOnboardingStep = React.memo<{
  runtimeContext: WorkspaceRuntimeContext;
  account: ExternalAccount;
}>(function ConfigureExternalChatsOnboardingStep({ runtimeContext, account }) {
  const vm = useConfigureExternalChats({ open: true, runtimeContext, account });
  return (
    <div>
      <ExternalChatCatalogContent vm={vm} preparing={!account.liveReady} />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
        <ExternalChatCatalogActions vm={vm} />
      </div>
    </div>
  );
});
