import type { CreateChatTab } from "./create-chat-dialog.lib";

export interface CreateChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visibleTabs?: readonly CreateChatTab[];
  onNavigateWorkspaceStream?: (streamUuid: string) => void;
  onNavigateWorkspaceTopic?: (streamUuid: string, topicUuid: string) => void;
  onChannelCreated: () => void;
}
