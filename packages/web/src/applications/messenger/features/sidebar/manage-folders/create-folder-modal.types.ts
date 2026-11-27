export interface CreateFolderPayload {
  name: string;
  backgroundColor: number;
}

export interface CreateFolderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (payload: CreateFolderPayload) => Promise<boolean>;
}
