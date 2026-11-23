import type { MessengerUuid } from "~/applications/messenger/model/messenger.types";
import type {
  WorkspaceMessageMentionResolver,
  WorkspaceMessageQuoteReference,
} from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import type { WorkspaceSecretUrnReference } from "~/shared/lib/workspace-reference-urn.lib";
import type { LoadWorkspaceFilePreview } from "./messenger-workspace-message-file-preview.hook";

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
  enableMentions?: boolean;
  onOpenMessage?: (messageUuid: MessengerUuid) => void;
  onLoadWorkspaceFilePreview?: LoadWorkspaceFilePreview;
  loadEnabled?: boolean;
  secretMessageUuid?: MessengerUuid;
  onRequestSecretKey?: (
    messageUuid: MessengerUuid,
    reference: WorkspaceSecretUrnReference,
    allowUsableKey?: boolean,
  ) => void | Promise<void>;
  requestSecretKeyPending?: boolean;
}
