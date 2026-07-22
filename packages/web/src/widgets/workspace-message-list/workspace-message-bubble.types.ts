import type { MessengerUuid } from "~/entities/messenger/messenger.types";
import type { WorkspaceMessageMentionResolver } from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import type {
  WorkspaceMessageListActions,
  WorkspaceMessageListItem,
} from "./workspace-message-list.types";

export interface WorkspaceMessageBubbleProps {
  message: WorkspaceMessageListItem;
  currentUserUuid: MessengerUuid;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  isSelected?: boolean;
  selectionMode?: boolean;
  resolveAuthorLabel?: (authorUuid: MessengerUuid) => string | null | undefined;
  topicLabel?: string | null;
  resolveMention?: WorkspaceMessageMentionResolver;
  actions?: WorkspaceMessageListActions;
}
