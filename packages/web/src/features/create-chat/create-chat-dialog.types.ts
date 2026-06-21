export interface CreateChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Navigate to stream by Workspace stream UUID. */
  onNavigateStream: (streamUuid: string, streamName: string) => void;
  onChannelCreated: () => void;
}
