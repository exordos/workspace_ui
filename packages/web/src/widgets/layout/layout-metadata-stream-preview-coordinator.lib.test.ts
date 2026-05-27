import { describe, expect, it, vi } from "vitest";
import { createMetadataStreamPreviewCoordinator } from "./layout-metadata-stream-preview-coordinator.lib";

describe("createMetadataStreamPreviewCoordinator", () => {
  it("does not apply stream previews until register hydration is ready", () => {
    const coordinator = createMetadataStreamPreviewCoordinator();
    const apply = vi.fn();

    coordinator.stageStreamPreviews({
      mode: "streamPreviews",
      messages: [],
      latestMessageIdHint: null,
    });

    expect(coordinator.flushStreamPreviews(apply)).toBe(false);
    expect(apply).not.toHaveBeenCalled();

    coordinator.markRegisterHydrationReady();
    expect(coordinator.flushStreamPreviews(apply)).toBe(true);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(coordinator.hasPending()).toBe(false);
  });

  it("applies immediately when register becomes ready after bootstrap staged", () => {
    const coordinator = createMetadataStreamPreviewCoordinator();
    const apply = vi.fn();

    coordinator.markRegisterHydrationReady();
    coordinator.stageStreamPreviews({
      mode: "streamPreviews",
      messages: [],
      latestMessageIdHint: 42,
    });

    expect(coordinator.flushStreamPreviews(apply)).toBe(true);
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "streamPreviews", latestMessageIdHint: 42 }),
    );
  });
});
