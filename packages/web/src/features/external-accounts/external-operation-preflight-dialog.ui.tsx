import React from "react";
import { t } from "~/i18n/i18n";
import { AccessibleAlertDialog } from "~/shared/ui/accessible-alert-dialog.ui";

export interface ExternalOperationPreflightDialogProps {
  error: boolean;
  losses: string[] | null;
  onConfirm: () => void;
  onDismiss: () => void;
}

/** Accessible confirmation/error dialog for provider mutation preflight. */
export const ExternalOperationPreflightDialog = React.memo(
  function ExternalOperationPreflightDialog({
    error,
    losses,
    onConfirm,
    onDismiss,
  }: ExternalOperationPreflightDialogProps) {
    if (!error && losses == null) return null;

    const label = error
      ? t("message.externalOperationUnavailable")
      : t("message.externalOperationLossTitle");
    return (
      <AccessibleAlertDialog
        className="fixed inset-0 z-modal grid place-items-center bg-black/50 p-4"
        label={label}
        onDismiss={onDismiss}
        data-testid="external-operation-preflight-dialog"
      >
        <div className="w-full max-w-md rounded-xl border border-border-subtle bg-card-bg p-4 shadow-xl">
          <p className="text-sm font-semibold text-text-primary">{label}</p>
          {losses != null && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-text-secondary">
              {losses.map((loss, index) => (
                <li key={`${index}:${loss}`}>
                  {loss.length > 0 ? loss : t("message.externalOperationLossFallback")}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex gap-2">
            {losses != null && (
              <button
                type="button"
                className="min-h-11 rounded-lg bg-accent px-3 text-sm text-on-accent"
                onClick={onConfirm}
              >
                {t("message.externalOperationContinue")}
              </button>
            )}
            <button
              type="button"
              className="min-h-11 rounded-lg border border-border-subtle px-3 text-sm text-text-primary"
              onClick={onDismiss}
            >
              {error ? t("common.close") : t("common.cancel")}
            </button>
          </div>
        </div>
      </AccessibleAlertDialog>
    );
  },
);
