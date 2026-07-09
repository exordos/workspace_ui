import { describe, expect, it, vi } from "vitest";
import { runMetadataDmBackfillLoop } from "./layout-metadata-dm-backfill.lib";

describe("runMetadataDmBackfillLoop", () => {
  it("is a local no-op after legacy DM backfill removal", async () => {
    const isCancelled = vi.fn(() => false);

    await runMetadataDmBackfillLoop({
      instanceId: "inst-1",
      initialUserId: 7,
      maxBatches: 2,
      pageSize: 100,
      stagnationLimit: 1,
      orgContext: { instanceId: "inst-1", epoch: 1 },
      signal: new AbortController().signal,
      isCancelled,
    });

    expect(isCancelled).not.toHaveBeenCalled();
  });
});
