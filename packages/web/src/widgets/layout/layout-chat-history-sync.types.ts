import type { WorkspaceRawMessage } from "~/shared/api/messenger.types";
import type { MessageId } from "~/shared/lib/message-id.lib";

export interface LoadDeepHistoryMessagesOptions {
  initialMessages: readonly WorkspaceRawMessage[];
  fetchOlderMessages: (anchorId: MessageId, numBefore: number) => Promise<WorkspaceRawMessage[]>;
  pageSize?: number;
  maxBatches?: number;
}
