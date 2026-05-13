export interface CreateChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigateDm: (slug: string) => void;
  /** Переход в канал по stream id + имени (архивные каналы доступны по маршруту без разархивации). */
  onNavigateStream: (streamId: number, streamName: string) => void;
  onChannelCreated: () => void;
}
