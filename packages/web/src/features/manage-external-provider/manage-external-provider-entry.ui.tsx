import { useCallback, useEffect, useState, type ReactElement } from "react";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { ManageExternalProviderDialog } from "./manage-external-provider-dialog.ui";
import { useManageExternalProvider } from "./manage-external-provider.hook";

export interface ManageExternalProviderEntryProps {
  readonly runtimeContext: WorkspaceRuntimeContext | null;
}

/**
 * Admin entry that opens the integration-settings modal.
 * Styled as a flat action (icon + label), not a navigable row — no chevron.
 */
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

  const handleOpenDialog = useCallback(() => {
    setDialogOpen(true);
  }, []);

  if (vm.accessStatus !== "allowed") {
    return null;
  }

  return (
    <div className="border-t border-border-subtle pt-3">
      {/* Secondary admin action: quieter than the Connect CTA above */}
      <button
        type="button"
        onClick={handleOpenDialog}
        className="bg-bg-elevated/30 flex w-full items-center gap-2.5 rounded-lg border border-border-subtle px-2.5 py-2 text-left transition-colors hover:bg-sidebar-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label={t("externalAccounts.manageIntegrations")}
        data-testid="manage-external-provider-trigger"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bg text-text-secondary">
          <Icon name="businessCenter" size={18} className="text-current" />
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-medium leading-4 text-text-primary">
            {t("externalAccounts.manageIntegrations")}
          </span>
          <span className="mt-0.5 block text-[11px] leading-4 text-text-muted">
            {t("externalAccounts.manageIntegrationsHint")}
          </span>
        </span>
      </button>
      <ManageExternalProviderDialog open={dialogOpen} onOpenChange={handleOpenChange} vm={vm} />
    </div>
  );
}
