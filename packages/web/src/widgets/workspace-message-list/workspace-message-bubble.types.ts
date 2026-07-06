import type { MessengerMessage, MessengerUuid } from "~/entities/messenger/messenger.types";
import type { WorkspaceMessageMentionResolver } from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import type { WorkspaceMessageListActions } from "./workspace-message-list.types";

export interface WorkspaceMessageBubbleProps {
  message: MessengerMessage;
  currentUserUuid: MessengerUuid;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  resolveAuthorLabel?: (authorUuid: MessengerUuid) => string | null | undefined;
  resolveMention?: WorkspaceMessageMentionResolver;
  actions?: WorkspaceMessageListActions;
}
