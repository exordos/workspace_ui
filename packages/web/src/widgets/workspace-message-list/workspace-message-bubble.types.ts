import type { MessengerUuid } from "~/entities/messenger/messenger.types";
import type { UsersById } from "~/entities/user/user.types";
import type { WorkspaceMessageMentionResolver } from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import type {
  WorkspaceMessageListActions,
  WorkspaceMessageListItem,
} from "./workspace-message-list.types";
import type { WorkspaceQuoteRenderMode } from "./workspace-message-quote.types";

export interface WorkspaceMessageBubbleProps {
  message: WorkspaceMessageListItem;
  currentUserUuid: MessengerUuid;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  isSelected?: boolean;
  selectionMode?: boolean;
  resolveAuthorLabel?: (authorUuid: MessengerUuid) => string | null | undefined;
  usersById: UsersById;
  topicLabel?: string | null;
  resolveMention?: WorkspaceMessageMentionResolver;
  quoteRenderMode?: WorkspaceQuoteRenderMode;
  actions?: WorkspaceMessageListActions;
  presentationMode?: "message" | "preview";
  passiveLoadersEnabled?: boolean;
}
