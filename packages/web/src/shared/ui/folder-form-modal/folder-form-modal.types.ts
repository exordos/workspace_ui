export type FolderFormModalMode = "create" | "edit";

export interface FolderFormSubmitPayload {
  name: string;
  backgroundColor: number;
}

export interface FolderFormModalProps {
  mode: FolderFormModalMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName?: string;
  initialBackgroundColor?: number;
  onSubmit: (payload: FolderFormSubmitPayload) => Promise<boolean>;
}
