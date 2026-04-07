export interface CreateChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigateDm: (slug: string) => void;
  onChannelCreated: () => void;
}
