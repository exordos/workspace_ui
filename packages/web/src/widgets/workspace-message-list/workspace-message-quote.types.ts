import type { MessengerUuid } from "~/entities/messenger/messenger.types";
import type {
  WorkspaceMessageMentionResolver,
  WorkspaceMessageQuoteReference,
} from "~/shared/lib/workspace-message-render/workspace-message-document.types";

export type WorkspaceQuoteRenderMode = "full-history" | "single-message";

export const DEFAULT_WORKSPACE_QUOTE_RENDER_MODE: WorkspaceQuoteRenderMode = "full-history";
export const DEFAULT_WORKSPACE_QUOTE_MAX_DEPTH = 12;

export interface WorkspaceMessageQuoteProps {
  reference: WorkspaceMessageQuoteReference;
  mode?: WorkspaceQuoteRenderMode;
  depth?: number;
  maxDepth?: number;
  visitedMessageUuids?: ReadonlySet<MessengerUuid>;
  resolveMention?: WorkspaceMessageMentionResolver;
  onOpenMessage?: (messageUuid: MessengerUuid) => void;
}
