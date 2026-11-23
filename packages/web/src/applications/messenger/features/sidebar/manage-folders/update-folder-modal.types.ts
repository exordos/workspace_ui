export interface UpdateFolderPayload {
  name: string;
  backgroundColor: number;
}

export interface UpdateFolderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  initialBackgroundColor?: number;
  onSave: (payload: UpdateFolderPayload) => Promise<boolean>;
}
