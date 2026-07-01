export interface CreateChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "legacy" | "workspace";
  onNavigateDm: (slug: string) => void;
  /** Navigate to channel by stream id + name (archived channels are routable without unarchive). */
  onNavigateStream: (streamId: number, streamName: string) => void;
  onNavigateWorkspaceStream?: (streamUuid: string) => void;
  onNavigateWorkspaceTopic?: (streamUuid: string, topicUuid: string) => void;
  onChannelCreated: () => void;
}
