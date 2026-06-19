import type { WorkspaceRawMessage } from "~/shared/api/messenger.types";

export interface LoadDeepHistoryMessagesOptions {
  initialMessages: readonly WorkspaceRawMessage[];
  fetchOlderMessages: (anchorId: number, numBefore: number) => Promise<WorkspaceRawMessage[]>;
  pageSize?: number;
  maxBatches?: number;
}
