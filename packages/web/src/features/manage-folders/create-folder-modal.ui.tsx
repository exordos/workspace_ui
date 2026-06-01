import React from "react";
import { FolderFormModal } from "~/shared/ui/folder-form-modal.ui";
import type { CreateFolderModalProps } from "./create-folder-modal.types";

export const CreateFolderModal: React.FC<CreateFolderModalProps> = ({
  open,
  onOpenChange,
  onCreate,
}) => <FolderFormModal mode="create" open={open} onOpenChange={onOpenChange} onSubmit={onCreate} />;
