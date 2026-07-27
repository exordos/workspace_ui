import React, { useCallback } from "react";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { t } from "~/i18n/i18n";
import { AppDialog, DialogCancelButton, DialogPrimaryButton } from "~/shared/ui/app-dialog.ui";
import { useDeleteExternalAccount } from "./delete-external-account.hook";

export interface DeleteExternalAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runtimeContext: WorkspaceRuntimeContext | null;
  accountUuid: string | null;
}

export const DeleteExternalAccountDialog = React.memo<DeleteExternalAccountDialogProps>(
  function DeleteExternalAccountDialog({ open, onOpenChange, runtimeContext, accountUuid }) {
    const { deleting, error, remove, reset } = useDeleteExternalAccount({
      open,
      runtimeContext,
      accountUuid,
      onCompleted: () => onOpenChange(false),
    });
    const close = useCallback(() => {
      reset();
      onOpenChange(false);
    }, [onOpenChange, reset]);

    return (
      <AppDialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!deleting && !nextOpen) close();
        }}
        title={t("connectExternalAccount.delete.title")}
        description={t("connectExternalAccount.delete.description")}
        positionClassName="top-1/2 -translate-y-1/2"
        footer={
          <>
            <DialogCancelButton disabled={deleting} useDialogClose={false} onClick={close}>
              {t("common.cancel")}
            </DialogCancelButton>
            <DialogPrimaryButton
              onClick={remove}
              isSubmitting={deleting}
              className="hover:bg-danger/90 bg-danger text-white"
            >
              {deleting
                ? t("connectExternalAccount.delete.deleting")
                : t("connectExternalAccount.delete.confirm")}
            </DialogPrimaryButton>
          </>
        }
      >
        <p className="bg-danger/10 rounded-lg px-3 py-2 text-sm text-danger">
          {t("connectExternalAccount.delete.warning")}
        </p>
        {error ? (
          <p className="bg-danger/10 mt-3 rounded-lg px-3 py-2 text-sm text-danger" role="alert">
            {t("connectExternalAccount.delete.error")}
          </p>
        ) : null}
      </AppDialog>
    );
  },
);
