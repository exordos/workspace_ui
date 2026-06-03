export interface CreateChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigateDm: (slug: string) => void;
  /** Navigate to channel by stream id + name (archived channels are routable without unarchive). */
  onNavigateStream: (streamId: number, streamName: string) => void;
  onChannelCreated: () => void;
}
