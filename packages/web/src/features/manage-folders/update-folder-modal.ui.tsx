import React from "react";
import { FolderFormModal } from "~/shared/ui/folder-form-modal.ui";
import type { UpdateFolderModalProps } from "./update-folder-modal.types";

export const UpdateFolderModal: React.FC<UpdateFolderModalProps> = ({
  open,
  onOpenChange,
  initialName,
  initialBackgroundColor,
  onSave,
}) => (
  <FolderFormModal
    mode="edit"
    open={open}
    onOpenChange={onOpenChange}
    initialName={initialName}
    initialBackgroundColor={initialBackgroundColor}
    onSubmit={onSave}
  />
);
