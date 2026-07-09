import type { ActiveOrgRequestContext } from "~/entities/instance/instance.model";

export function runMetadataDmBackfillLoop(options: {
  instanceId: string;
  initialUserId: number;
  maxBatches: number;
  pageSize: number;
  stagnationLimit: number;
  isCancelled: () => boolean;
  orgContext?: ActiveOrgRequestContext;
  signal?: AbortSignal;
}): Promise<void> {
  void options;
  return Promise.resolve();
}
