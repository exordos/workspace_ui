import { useCallback, useEffect, useState, type ReactElement } from "react";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { ManageExternalProviderDialog } from "./manage-external-provider-dialog.ui";
import { useManageExternalProvider } from "./manage-external-provider.hook";

export interface ManageExternalProviderEntryProps {
  readonly runtimeContext: WorkspaceRuntimeContext | null;
}

export function ManageExternalProviderEntry({
  runtimeContext,
}: ManageExternalProviderEntryProps): ReactElement | null {
  const [dialogOpen, setDialogOpen] = useState(false);
  const vm = useManageExternalProvider({
    probeEnabled: true,
    open: dialogOpen,
    runtimeContext,
  });

  useEffect(() => {
    if (vm.accessStatus === "allowed") return;
    const timer = window.setTimeout(() => setDialogOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [vm.accessStatus]);

  const handleOpenChange = useCallback((open: boolean) => {
    setDialogOpen(open);
  }, []);

  if (vm.accessStatus !== "allowed") {
    return null;
  }

  return (
    <div className="mt-2 border-t border-border-subtle pt-2">
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="hover:bg-bg-elevated/70 flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition-colors"
        aria-label={t("externalAccounts.manageIntegrations")}
        data-testid="manage-external-provider-trigger"
      >
        <span className="min-w-0">
          <span className="block text-xs font-medium text-text-primary">
            {t("externalAccounts.manageIntegrations")}
          </span>
          <span className="mt-0.5 block text-[10px] text-text-muted">
            {t("externalAccounts.manageIntegrationsHint")}
          </span>
        </span>
        <Icon name="chevron-right" size={14} className="shrink-0 text-text-muted" />
      </button>
      <ManageExternalProviderDialog open={dialogOpen} onOpenChange={handleOpenChange} vm={vm} />
    </div>
  );
}
