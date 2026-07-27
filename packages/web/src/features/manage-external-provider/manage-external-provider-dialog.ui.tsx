import React, { useId, useState } from "react";
import { t } from "~/i18n/i18n";
import { AppDialog } from "~/shared/ui/app-dialog.ui";
import { Button } from "~/shared/ui/button";
import { ManageExternalProviderForm } from "./manage-external-provider-form.ui";
import type { UseManageExternalProviderResult } from "./manage-external-provider.hook";

export interface ManageExternalProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vm: UseManageExternalProviderResult;
}

export const ManageExternalProviderDialog = React.memo<ManageExternalProviderDialogProps>(
  function ManageExternalProviderDialog({ open, onOpenChange, vm }) {
    const [saveDisabled, setSaveDisabled] = useState(true);
    const formId = `manage-external-provider-form-${useId()}`;

    return (
      <AppDialog
        open={open}
        onOpenChange={onOpenChange}
        title={t("manageExternalProvider.title")}
        description={t("manageExternalProvider.description")}
        maxWidthClassName="max-w-3xl"
        positionClassName="top-1/2 -translate-y-1/2"
        scrollBody
        // Dismiss is the header X; footer keeps only Save.
        footer={
          <Button type="submit" form={formId} disabled={saveDisabled} aria-disabled={saveDisabled}>
            {vm.saveStatus === "saving" ? t("manageExternalProvider.saving") : t("common.save")}
          </Button>
        }
      >
        <ManageExternalProviderForm
          vm={vm}
          formId={formId}
          showSubmitButton={false}
          onSaveDisabledChange={setSaveDisabled}
        />
      </AppDialog>
    );
  },
);
