export interface ChatPageReadReceiptsReaderEntry {
  userId: number;
  name: string;
  statusLabel: string | null | undefined;
}

export interface ChatPageReadReceiptsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readersLoading: boolean;
  readersError: string | null;
  readerEntries: ChatPageReadReceiptsReaderEntry[];
}
