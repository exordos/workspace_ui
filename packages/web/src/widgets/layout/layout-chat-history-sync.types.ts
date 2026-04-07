import type { ZulipRawMessage } from "~/shared/api/zulip.types";

export interface LoadDeepHistoryMessagesOptions {
  initialMessages: readonly ZulipRawMessage[];
  fetchOlderMessages: (anchorId: number, numBefore: number) => Promise<ZulipRawMessage[]>;
  pageSize?: number;
  maxBatches?: number;
}
